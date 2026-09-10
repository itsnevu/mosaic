"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import type { Address, Log } from "viem";
import { getDeployment, mosaicVaultAbi } from "./contracts";

/** How far back to scan for vault activity. Whole history on a fresh chain, a window on a busy one. */
const LOOKBACK_BLOCKS = BigInt(process.env.NEXT_PUBLIC_LOG_LOOKBACK ?? 100_000);

export type ActivityKind = "Deployed" | "Rebalanced" | "FeeAccrued" | "TargetWeightsSet" | "ScoredWeightsApplied";

export type ActivityRow = {
  id: string;
  kind: ActivityKind;
  blockNumber: bigint;
  timestamp?: number;
  txHash: `0x${string}`;
  /** Headline number for the row, in USDG (6 decimals), when the event has one. */
  assets?: bigint;
  detail: string;
};

const KINDS: ActivityKind[] = ["Deployed", "Rebalanced", "FeeAccrued", "TargetWeightsSet", "ScoredWeightsApplied"];

function describe(kind: ActivityKind, args: Record<string, unknown>): { detail: string; assets?: bigint } {
  switch (kind) {
    case "Deployed":
      return { detail: "Idle capital pushed into pools", assets: args.totalDeployed as bigint };
    case "Rebalanced": {
      const dev = Number(args.maxDeviationBps ?? 0n) / 100;
      return { detail: `Weights restored · peak drift ${dev.toFixed(2)}%`, assets: args.deployedAssets as bigint };
    }
    case "FeeAccrued":
      return { detail: "Performance fee on yield above the high-water mark", assets: args.feeAssets as bigint };
    case "TargetWeightsSet":
    case "ScoredWeightsApplied": {
      const w = (args.weightsBps as readonly number[] | undefined) ?? [];
      const pct = w.map((x) => `${(Number(x) / 100).toFixed(0)}%`).join(" / ");
      return {
        detail:
          kind === "ScoredWeightsApplied"
            ? `Targets rescored from rate, liquidity and volatility · ${pct}`
            : `Targets set manually · ${pct}`,
      };
    }
  }
}

/**
 * Vault history straight from chain logs — deployments, rebalances, fees and target changes.
 * There is no indexer: the window is bounded by NEXT_PUBLIC_LOG_LOOKBACK.
 */
export function useVaultActivity(limit = 25) {
  const chainId = useChainId();
  const client = usePublicClient();
  const vault = getDeployment(chainId)?.vault as Address | undefined;

  const q = useQuery({
    queryKey: ["vault-activity", chainId, vault, limit],
    enabled: !!client && !!vault,
    refetchInterval: 12_000,
    queryFn: async (): Promise<ActivityRow[]> => {
      if (!client || !vault) return [];
      const latest = await client.getBlockNumber();
      const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;

      const batches = await Promise.all(
        KINDS.map((eventName) =>
          client
            .getContractEvents({ address: vault, abi: mosaicVaultAbi, eventName, fromBlock, toBlock: latest })
            .then((logs) => logs.map((l) => ({ kind: eventName, log: l as Log & { args?: Record<string, unknown> } })))
            .catch(() => []),
        ),
      );

      const rows = batches
        .flat()
        .filter((r) => r.log.blockNumber !== null && r.log.transactionHash !== null)
        .map(({ kind, log }) => {
          const { detail, assets } = describe(kind, log.args ?? {});
          return {
            id: `${log.transactionHash}-${log.logIndex}`,
            kind,
            blockNumber: log.blockNumber as bigint,
            txHash: log.transactionHash as `0x${string}`,
            assets,
            detail,
          } satisfies ActivityRow;
        })
        .sort((a, b) =>
          a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1,
        )
        .slice(0, limit);

      // Timestamps for the blocks we are actually showing, one read each.
      const blocks = [...new Set(rows.map((r) => r.blockNumber))];
      const times = new Map<bigint, number>();
      await Promise.all(
        blocks.map(async (b) => {
          try {
            const blk = await client.getBlock({ blockNumber: b });
            times.set(b, Number(blk.timestamp));
          } catch {
            /* pruned or unavailable — the row still renders with its block number */
          }
        }),
      );

      return rows.map((r) => ({ ...r, timestamp: times.get(r.blockNumber) }));
    },
  });

  return { activity: q.data ?? [], isLoaded: q.isFetched, isError: q.isError };
}

/**
 * Distinct addresses that hold vault shares, counted from ERC-4626 `Deposit` logs.
 * Real or nothing: when logs cannot be read this returns undefined and the caller shows a dash,
 * rather than a plausible-looking number nobody can verify.
 */
export function useDepositorCount() {
  const chainId = useChainId();
  const client = usePublicClient();
  const vault = getDeployment(chainId)?.vault as Address | undefined;

  const q = useQuery({
    queryKey: ["depositor-count", chainId, vault],
    enabled: !!client && !!vault,
    refetchInterval: 30_000,
    queryFn: async (): Promise<number | undefined> => {
      if (!client || !vault) return undefined;
      const latest = await client.getBlockNumber();
      const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;
      const logs = await client.getContractEvents({
        address: vault,
        abi: mosaicVaultAbi,
        eventName: "Deposit",
        fromBlock,
        toBlock: latest,
      });
      const owners = new Set<string>();
      for (const l of logs) {
        const owner = (l as { args?: { owner?: string } }).args?.owner;
        if (owner) owners.add(owner.toLowerCase());
      }
      return owners.size;
    },
  });

  return q.data;
}
