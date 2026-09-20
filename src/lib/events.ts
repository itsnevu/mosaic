"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import type { Address, Log } from "viem";
import { getDeployment, mosaicVaultAbi } from "./contracts";
import { logId, scanLogs } from "./logs";

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
 * With a known launch block the whole history is read through the adaptive scanner in
 * `logs.ts` and kept in memory, so the latest rows are the latest rows; without one, the
 * bounded backwards walk above is all that can honestly be done.
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
      type Found = { kind: ActivityKind; log: Log & { args?: Record<string, unknown> } };
      const batches: Found[][] = [];

      if (deployment?.block !== undefined) {
        const scans = await Promise.all(
          KINDS.map(async (eventName) => {
            const s = await scanLogs(
              `${chainId}:${vault}:activity:${eventName}`,
              (r) => client.getContractEvents({ address: vault, abi: mosaicVaultAbi, eventName, fromBlock: r.from, toBlock: r.to }),
              floor,
              latest,
              logId,
            );
            return s.logs.map((l) => ({ kind: eventName, log: l as Found["log"] }));
          }),
        );
        batches.push(...scans);
      } else {
        let found = 0;
        for (const { from, to } of chunksBackFrom(latest, floor)) {
          const round = await Promise.all(
            KINDS.map((eventName) =>
              client
                .getContractEvents({ address: vault, abi: mosaicVaultAbi, eventName, fromBlock: from, toBlock: to })
                .then((logs) => logs.map((l) => ({ kind: eventName, log: l as Found["log"] })))
                .catch(() => []),
            ),
          );
          for (const r of round) {
            batches.push(r);
            found += r.length;
          }
          if (found >= limit) break; // enough for the page; older history is a click away, not a scroll
        }
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

      // Timestamps for the blocks we are actually showing, one read each, remembered.
      const times = await timestampsFor(client, chainId, rows.map((r) => r.blockNumber));
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

      const scan = await scanLogs(
        `${chainId}:${vault}:depositors`,
        (r) => client.getContractEvents({ address: vault, abi: mosaicVaultAbi, eventName: "Deposit", fromBlock: r.from, toBlock: r.to }),
        floor,
        latest,
        logId,
      );
      if (!scan.complete) return undefined;
      const owners = new Set<string>();
      for (const l of scan.logs) {
        const owner = (l as { args?: { owner?: string } }).args?.owner;
        if (owner) owners.add(owner.toLowerCase());
      }
      return owners.size;
    },
  });

  return q.data;
}

/* ------------------------------------------------------------------ whole-history reads */

/** Block timestamps already fetched, per chain; a block does not change its time. */
const blockTimes = new Map<string, number>();

async function timestampsFor(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  chainId: number,
  blocks: bigint[],
): Promise<Map<bigint, number>> {
  const out = new Map<bigint, number>();
  const missing: bigint[] = [];
  for (const b of new Set(blocks)) {
    const hit = blockTimes.get(`${chainId}:${b}`);
    if (hit !== undefined) out.set(b, hit);
    else missing.push(b);
  }
  await Promise.all(
    missing.map(async (b) => {
      try {
        const blk = await client.getBlock({ blockNumber: b });
        const t = Number(blk.timestamp);
        blockTimes.set(`${chainId}:${b}`, t);
        out.set(b, t);
      } catch {
        /* the point still plots by block order; only its date is unknown */
      }
    }),
  );
  return out;
}

type VaultLog = Log & { args?: Record<string, unknown> };
const ZERO = "0x0000000000000000000000000000000000000000";

export type UserLedger = {
  /** USDG this address put in, from its own `Deposit` events. */
  deposited?: bigint;
  /** USDG this address took out, from its own `Withdraw` events. */
  withdrawn?: bigint;
  /** Number of deposits found. */
  deposits: number;
  /** Unix time of the first deposit, when the block could be read. */
  since?: number;
  /**
   * Set when a figure derived from the ledger would be wrong: shares moved by plain transfer
   * or minted to this address as fee ("transfers"), or a scan that could not reach the
   * launch block within its budget ("incomplete"). Either way nothing is shown.
   */
  unreliable?: "transfers" | "incomplete";
  isLoaded: boolean;
  refetch: () => void;
};

/**
 * A depositor's own ledger, read from their `Deposit` and `Withdraw` events on the vault.
 * Against the position's current value this gives what the position earned. No claim was
 * ever needed to receive it, and none is needed to see it.
 */
export function useUserLedger(address?: Address): UserLedger {
  const chainId = useChainId();
  const client = usePublicClient();
  const deployment = getDeployment(chainId);
  const vault = deployment?.vault as Address | undefined;
  const floor = deployment?.block === undefined ? undefined : BigInt(deployment.block);

  const q = useQuery({
    queryKey: ["user-ledger", chainId, vault, address],
    enabled: !!client && !!vault && !!address && floor !== undefined,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Omit<UserLedger, "isLoaded" | "refetch">> => {
      if (!client || !vault || !address || floor === undefined) return { deposits: 0 };
      const head = await client.getBlockNumber();
      const key = (name: string) => `${chainId}:${vault}:${name}:${address.toLowerCase()}`;
      const events =
        (eventName: "Deposit" | "Withdraw" | "Transfer", args: Record<string, Address>) => (r: { from: bigint; to: bigint }) =>
          client.getContractEvents({ address: vault, abi: mosaicVaultAbi, eventName, args, fromBlock: r.from, toBlock: r.to }) as Promise<VaultLog[]>;

      const [dep, wd, tin, tout] = await Promise.all([
        scanLogs(key("Deposit"), events("Deposit", { owner: address }), floor, head, logId),
        scanLogs(key("Withdraw"), events("Withdraw", { owner: address }), floor, head, logId),
        scanLogs(key("Transfer:to"), events("Transfer", { to: address }), floor, head, logId),
        scanLogs(key("Transfer:from"), events("Transfer", { from: address }), floor, head, logId),
      ]);
      if (![dep, wd, tin, tout].every((s) => s.complete)) return { deposits: dep.logs.length, unreliable: "incomplete" };

      const sum = (logs: VaultLog[], field: string) =>
        logs.reduce((acc, l) => acc + ((l.args?.[field] as bigint | undefined) ?? 0n), 0n);
      const deposited = sum(dep.logs, "assets");
      const withdrawn = sum(wd.logs, "assets");

      // Shares that arrived by plain transfer, left by one, or were minted to this address as
      // fee are not in the deposit ledger, and a figure built on it would be wrong.
      const from = (l: VaultLog) => (l.args?.from as string | undefined)?.toLowerCase();
      const to = (l: VaultLog) => (l.args?.to as string | undefined)?.toLowerCase();
      const mintsToMe = tin.logs.filter((l) => from(l) === ZERO).length;
      const moved = tin.logs.some((l) => from(l) !== ZERO) || tout.logs.some((l) => to(l) !== ZERO);
      const unreliable = moved || mintsToMe !== dep.logs.length ? ("transfers" as const) : undefined;

      const first = dep.logs.reduce<bigint | undefined>(
        (m, l) => (l.blockNumber !== null && (m === undefined || l.blockNumber < m) ? l.blockNumber : m),
        undefined,
      );
      const since = first === undefined ? undefined : (await timestampsFor(client, chainId, [first])).get(first);

      return { deposited, withdrawn, deposits: dep.logs.length, since, unreliable };
    },
  });

  return { deposits: 0, ...(q.data ?? {}), isLoaded: q.isFetched || floor === undefined, refetch: () => void q.refetch() };
}

export type PricePoint = {
  blockNumber: bigint;
  /** Unix seconds; undefined when the block could not be read. */
  timestamp?: number;
  /** 1e18-scaled USDG per share, as `pricePerShare()` reports it. */
  pps: bigint;
  source: "launch" | "fee" | "deposit" | "withdraw" | "now";
};

export type SharePriceHistory = {
  points: PricePoint[];
  /** Events the line is drawn from, before any thinning for the screen. */
  eventCount: number;
  /** False when the scan could not reach the launch block within its budget. */
  complete: boolean;
  /** Unix seconds the history was last read. */
  fetchedAt?: number;
  isLoaded: boolean;
  isError: boolean;
};

const MAX_POINTS = 80;
/** 1e18 × 10^6 (the decimals offset): pps = assets × this / shares, as the contract computes it. */
const PPS_SCALE_SHARES = 10n ** 24n;

/**
 * The share price since launch, from the chain's own record of it: every fee accrual writes
 * the post-fee price, and every deposit and redemption fixes the price at its block as assets
 * over shares. Nothing is sampled, estimated or projected — the line has a point where the
 * chain has an event, and starts at exactly 1.0000 because the contract does.
 */
export function useSharePriceHistory(): SharePriceHistory {
  const chainId = useChainId();
  const client = usePublicClient();
  const deployment = getDeployment(chainId);
  const vault = deployment?.vault as Address | undefined;
  const floor = deployment?.block === undefined ? undefined : BigInt(deployment.block);

  const q = useQuery({
    queryKey: ["share-price-history", chainId, vault],
    enabled: !!client && !!vault && floor !== undefined,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Omit<SharePriceHistory, "isLoaded" | "isError">> => {
      if (!client || !vault || floor === undefined) return { points: [], eventCount: 0, complete: false };
      const fetchedAt = Math.floor(Date.now() / 1000);
      const head = await client.getBlockNumber();
      const events = (eventName: "FeeAccrued" | "Deposit" | "Withdraw") => (r: { from: bigint; to: bigint }) =>
        client.getContractEvents({ address: vault, abi: mosaicVaultAbi, eventName, fromBlock: r.from, toBlock: r.to }) as Promise<VaultLog[]>;
      const key = (n: string) => `${chainId}:${vault}:history:${n}`;

      const [fee, dep, wd] = await Promise.all([
        scanLogs(key("FeeAccrued"), events("FeeAccrued"), floor, head, logId),
        scanLogs(key("Deposit"), events("Deposit"), floor, head, logId),
        scanLogs(key("Withdraw"), events("Withdraw"), floor, head, logId),
      ]);
      const complete = fee.complete && dep.complete && wd.complete;

      type Raw = { blockNumber: bigint; logIndex: number; pps: bigint; source: PricePoint["source"] };
      const raw: Raw[] = [];
      for (const l of fee.logs) {
        const pps = l.args?.newHighWaterMarkPps as bigint | undefined;
        if (l.blockNumber !== null && l.logIndex !== null && pps) raw.push({ blockNumber: l.blockNumber, logIndex: l.logIndex, pps, source: "fee" });
      }
      for (const [logs, source] of [[dep.logs, "deposit"], [wd.logs, "withdraw"]] as const) {
        for (const l of logs) {
          const assets = l.args?.assets as bigint | undefined;
          const shares = l.args?.shares as bigint | undefined;
          if (l.blockNumber === null || l.logIndex === null || !assets || !shares) continue;
          raw.push({ blockNumber: l.blockNumber, logIndex: l.logIndex, pps: (assets * PPS_SCALE_SHARES) / shares, source });
        }
      }
      raw.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));

      // One point per block, its last event: the price is a property of the block.
      const perBlock: Raw[] = [];
      for (const r of raw) {
        if (perBlock.length && perBlock[perBlock.length - 1].blockNumber === r.blockNumber) perBlock[perBlock.length - 1] = r;
        else perBlock.push(r);
      }
      // The vault opens at exactly 1.0000. That is the contract, not an assumption.
      if (complete && (perBlock.length === 0 || perBlock[0].blockNumber > floor)) {
        perBlock.unshift({ blockNumber: floor, logIndex: -1, pps: 10n ** 18n, source: "launch" });
      }

      // Thin for the screen, keeping both ends; the count of what was read is reported as is.
      let picked = perBlock;
      if (perBlock.length > MAX_POINTS) {
        picked = [];
        for (let i = 0; i < MAX_POINTS; i++) picked.push(perBlock[Math.round((i * (perBlock.length - 1)) / (MAX_POINTS - 1))]);
      }

      const times = await timestampsFor(client, chainId, picked.map((p) => p.blockNumber));
      return {
        points: picked.map((p) => ({ blockNumber: p.blockNumber, timestamp: times.get(p.blockNumber), pps: p.pps, source: p.source })),
        eventCount: raw.length,
        complete,
        fetchedAt,
      };
    },
  });

  return {
    points: q.data?.points ?? [],
    eventCount: q.data?.eventCount ?? 0,
    fetchedAt: q.data?.fetchedAt,
    complete: q.data?.complete ?? false,
    isLoaded: q.isFetched || floor === undefined,
    isError: q.isError,
  };
}
