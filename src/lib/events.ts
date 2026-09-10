"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import type { Address, Log } from "viem";
import { getDeployment, mosaicVaultAbi } from "./contracts";

/**
 * Log scanning, sized for real providers rather than for a local chain.
 *
 * Most hosted RPCs cap `eth_getLogs` at a few thousand blocks, so a single call over a
 * hundred-thousand-block window simply fails. History is therefore walked backwards from the
 * head in chunks, stopping as soon as enough rows are in hand — on an active vault that is
 * usually the first chunk — and bounded so a quiet vault cannot spin forever.
 *
 * This is not an indexer and does not pretend to be one. A busy chain with a long history
 * still wants one; what this does is stay correct and cheap without it.
 */
const CHUNK_BLOCKS = BigInt(process.env.NEXT_PUBLIC_LOG_CHUNK ?? 10_000);
const MAX_CHUNKS = Number(process.env.NEXT_PUBLIC_LOG_MAX_CHUNKS ?? 12);

type Chunk = { from: bigint; to: bigint };

/** Block ranges from the head backwards, floored at the deployment block when known. */
function* chunksBackFrom(latest: bigint, floor: bigint): Generator<Chunk> {
  let to = latest;
  for (let i = 0; i < MAX_CHUNKS && to >= floor; i++) {
    const from = to > floor + CHUNK_BLOCKS ? to - CHUNK_BLOCKS : floor;
    yield { from, to };
    if (from === floor) return;
    to = from - 1n;
  }
}

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
  const deployment = getDeployment(chainId);
  const vault = deployment?.vault as Address | undefined;

  const q = useQuery({
    queryKey: ["vault-activity", chainId, vault, limit],
    enabled: !!client && !!vault,
    refetchInterval: 12_000,
    queryFn: async (): Promise<ActivityRow[]> => {
      if (!client || !vault) return [];
      const latest = await client.getBlockNumber();
      const floor = BigInt(deployment?.block ?? 0);

      const batches: { kind: ActivityKind; log: Log & { args?: Record<string, unknown> } }[][] = [];
      let found = 0;
      for (const { from, to } of chunksBackFrom(latest, floor)) {
        const round = await Promise.all(
          KINDS.map((eventName) =>
            client
              .getContractEvents({ address: vault, abi: mosaicVaultAbi, eventName, fromBlock: from, toBlock: to })
              .then((logs) => logs.map((l) => ({ kind: eventName, log: l as Log & { args?: Record<string, unknown> } })))
              .catch(() => []),
          ),
        );
        for (const r of round) {
          batches.push(r);
          found += r.length;
        }
        if (found >= limit) break; // enough for the page; older history is a click away, not a scroll
      }

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
  const deployment = getDeployment(chainId);
  const vault = deployment?.vault as Address | undefined;

  const q = useQuery({
    queryKey: ["depositor-count", chainId, vault],
    enabled: !!client && !!vault,
    refetchInterval: 30_000,
    queryFn: async (): Promise<number | undefined> => {
      if (!client || !vault) return undefined;
      const latest = await client.getBlockNumber();
      const floor = deployment?.block === undefined ? undefined : BigInt(deployment.block);
      // Counting depositors means counting all of them. Without a floor to scan back to, or
      // with history longer than the budget allows, the honest answer is "unknown" rather
      // than a number that quietly means "since some block".
      if (floor === undefined) return undefined;

      const owners = new Set<string>();
      let reachedFloor = false;
      for (const { from, to } of chunksBackFrom(latest, floor)) {
        const logs = await client
          .getContractEvents({ address: vault, abi: mosaicVaultAbi, eventName: "Deposit", fromBlock: from, toBlock: to })
          .catch(() => null);
        if (logs === null) return undefined; // a failed chunk means the total cannot be trusted
        for (const l of logs) {
          const owner = (l as { args?: { owner?: string } }).args?.owner;
          if (owner) owners.add(owner.toLowerCase());
        }
        if (from === floor) {
          reachedFloor = true;
          break;
        }
      }
      return reachedFloor ? owners.size : undefined;
    },
  });

  return q.data;
}
