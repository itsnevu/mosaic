"use client";

import { useMemo } from "react";
import { useChainId, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { getDeployment, mosaicVaultAbi, usdgAbi, type Deployment, type PoolInfo } from "./contracts";

const REFETCH = 4_000;

export type VaultStats = {
  /** True when the active chain has a deployment in DEPLOYMENTS. */
  hasDeployment: boolean;
  deployment?: Deployment;
  chainId: number;
  /** Reads finished (successfully or not) at least once. */
  isLoaded: boolean;
  isError: boolean;
  totalAssets?: bigint; // 6 decimals
  totalSupply?: bigint; // 12 decimals (shares)
  pricePerShare?: bigint; // 1e18 == 1 USDG per share unit
  poolCount?: number;
  idleAssets?: bigint;
  deployedAssets?: bigint;
  depositCap?: bigint;
  bufferTargetBps?: number;
  performanceFeeBps?: number;
  paused?: boolean;
  refetch: () => void;
};

/** Vault-wide numbers. Works without a connected wallet (public RPC). */
export function useVaultStats(): VaultStats {
  const chainId = useChainId();
  const deployment = getDeployment(chainId);
  const vault = deployment?.vault;
  const base = { address: vault as Address, abi: mosaicVaultAbi } as const;

  const q = useReadContracts({
    contracts: [
      { ...base, functionName: "totalAssets" },
      { ...base, functionName: "totalSupply" },
      { ...base, functionName: "pricePerShare" },
      { ...base, functionName: "adaptersLength" },
      { ...base, functionName: "idleAssets" },
      { ...base, functionName: "deployedAssets" },
      { ...base, functionName: "depositCap" },
      { ...base, functionName: "bufferTargetBps" },
      { ...base, functionName: "performanceFeeBps" },
      { ...base, functionName: "paused" },
    ],
    query: { enabled: !!vault, refetchInterval: REFETCH },
  });

  const r = q.data;
  const big = (i: number) => (r?.[i]?.status === "success" ? (r[i].result as bigint) : undefined);
  const num = (i: number) => {
    const v = big(i);
    return v === undefined ? undefined : Number(v);
  };

  return {
    hasDeployment: !!deployment,
    deployment,
    chainId,
    isLoaded: q.isFetched,
    isError: q.isError || (r?.every((x) => x.status === "failure") ?? false),
    totalAssets: big(0),
    totalSupply: big(1),
    pricePerShare: big(2),
    poolCount: num(3),
    idleAssets: big(4),
    deployedAssets: big(5),
    depositCap: big(6),
    bufferTargetBps: num(7),
    performanceFeeBps: num(8),
    paused: r?.[9]?.status === "success" ? (r[9].result as boolean) : undefined,
    refetch: () => void q.refetch(),
  };
}

export type UserPosition = {
  usdgBalance?: bigint;
  shares?: bigint;
  assetValue?: bigint;
  allowance?: bigint;
  isLoaded: boolean;
  refetch: () => void;
};

/** A user's USDG balance, vault shares, their USDG value and current vault allowance. */
export function useUserPosition(address?: Address): UserPosition {
  const chainId = useChainId();
  const d = getDeployment(chainId);
  const enabled = !!d && !!address;

  const q = useReadContracts({
    contracts: [
      { address: d?.usdg as Address, abi: usdgAbi, functionName: "balanceOf", args: [address as Address] },
      { address: d?.vault as Address, abi: mosaicVaultAbi, functionName: "balanceOf", args: [address as Address] },
      { address: d?.usdg as Address, abi: usdgAbi, functionName: "allowance", args: [address as Address, d?.vault as Address] },
    ],
    query: { enabled, refetchInterval: REFETCH },
  });
  const shares = q.data?.[1]?.status === "success" ? (q.data[1].result as bigint) : undefined;

  const value = useReadContract({
    address: d?.vault as Address,
    abi: mosaicVaultAbi,
    functionName: "convertToAssets",
    args: [shares ?? 0n],
    query: { enabled: enabled && shares !== undefined, refetchInterval: REFETCH },
  });

  return {
    usdgBalance: q.data?.[0]?.status === "success" ? (q.data[0].result as bigint) : undefined,
    shares,
    assetValue: value.data as bigint | undefined,
    allowance: q.data?.[2]?.status === "success" ? (q.data[2].result as bigint) : undefined,
    isLoaded: q.isFetched,
    refetch: () => {
      void q.refetch();
      void value.refetch();
    },
  };
}

export type Allocation = {
  index: number;
  adapter: Address;
  name: string;
  assets: bigint;
  currentBps: number;
  targetBps: number;
  rateBps: number;
};

/** Per-adapter allocation: current weight vs target, current rate. */
export function useAllocations(poolCount?: number): { allocations: Allocation[]; isLoaded: boolean } {
  const chainId = useChainId();
  const d = getDeployment(chainId);
  const n = poolCount ?? d?.pools.length ?? 0;

  const contracts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        address: d?.vault as Address,
        abi: mosaicVaultAbi,
        functionName: "allocation" as const,
        args: [BigInt(i)] as const,
      })),
    [d?.vault, n],
  );

  const q = useReadContracts({ contracts, query: { enabled: !!d && n > 0, refetchInterval: REFETCH } });

  const allocations: Allocation[] = (q.data ?? []).flatMap((res, i) => {
    if (res.status !== "success") return [];
    const [adapter, assets, currentBps, targetBps, rateBps] = res.result as readonly [Address, bigint, bigint, number, bigint];
    const info: PoolInfo | undefined = d?.pools.find((p) => p.adapter.toLowerCase() === adapter.toLowerCase());
    return [
      {
        index: i,
        adapter,
        name: info?.name ?? `Adapter ${i + 1}`,
        assets,
        currentBps: Number(currentBps),
        targetBps: Number(targetBps),
        rateBps: Number(rateBps),
      },
    ];
  });

  return { allocations, isLoaded: q.isFetched };
}

export type VaultOps = {
  withdrawalCapacity?: bigint;
  lastRebalance?: bigint;
  rebalanceCooldown?: bigint;
  rebalanceCostAssets?: bigint;
  maxSlippageBps?: number;
  maxRebalanceDragBps?: number;
  rebalanceHorizon?: bigint;
  scoringEnabled?: boolean;
  /** previewRebalance(): what the keeper would do right now. */
  preview?: {
    ok: boolean;
    maxDeviationBps: number;
    movedTotal: bigint;
    netGainAssets: bigint;
    minNetGainAssets: bigint;
    readyAt: bigint;
  };
  isLoaded: boolean;
};

/**
 * Keeper-facing state: how much could actually be withdrawn right now, and whether a
 * rebalance is currently worth doing by the vault's own economics.
 */
export function useVaultOps(): VaultOps {
  const chainId = useChainId();
  const d = getDeployment(chainId);
  const base = { address: d?.vault as Address, abi: mosaicVaultAbi } as const;

  const q = useReadContracts({
    contracts: [
      { ...base, functionName: "withdrawalCapacity" },
      { ...base, functionName: "lastRebalance" },
      { ...base, functionName: "rebalanceCooldown" },
      { ...base, functionName: "rebalanceCostAssets" },
      { ...base, functionName: "maxSlippageBps" },
      { ...base, functionName: "maxRebalanceDragBps" },
      { ...base, functionName: "rebalanceHorizon" },
      { ...base, functionName: "scoringEnabled" },
      { ...base, functionName: "previewRebalance" },
    ],
    query: { enabled: !!d?.vault, refetchInterval: REFETCH },
  });

  const r = q.data;
  const ok = (i: number) => r?.[i]?.status === "success";
  const big = (i: number) => (ok(i) ? (r![i].result as bigint) : undefined);
  const num = (i: number) => {
    const v = ok(i) ? (r![i].result as number | bigint) : undefined;
    return v === undefined ? undefined : Number(v);
  };

  const p = ok(8)
    ? (r![8].result as readonly [boolean, bigint, bigint, bigint, bigint, bigint])
    : undefined;

  return {
    withdrawalCapacity: big(0),
    lastRebalance: big(1),
    rebalanceCooldown: big(2),
    rebalanceCostAssets: big(3),
    maxSlippageBps: num(4),
    maxRebalanceDragBps: num(5),
    rebalanceHorizon: big(6),
    scoringEnabled: ok(7) ? (r![7].result as boolean) : undefined,
    preview: p && {
      ok: p[0],
      maxDeviationBps: Number(p[1]),
      movedTotal: p[2],
      netGainAssets: p[3],
      minNetGainAssets: p[4],
      readyAt: p[5],
    },
    isLoaded: q.isFetched,
  };
}

/**
 * The vault's blended rate: each venue's rate weighted by what it actually holds.
 * Returns undefined until a chain answers, so callers can show a dash rather than a stand-in.
 */
export function useBlendedApy(): number | undefined {
  const stats = useVaultStats();
  const { allocations } = useAllocations(stats.poolCount);
  const live = stats.hasDeployment && stats.isLoaded && !stats.isError;
  const weightedBps = allocations.reduce((acc, a) => acc + (a.rateBps * a.currentBps) / 10_000, 0);
  return live && weightedBps > 0 ? weightedBps / 10_000 : undefined;
}

/* ------------------------------------------------------------------ vault parameters */

export type VaultRules = {
  maxWeightBps?: number;
  bufferTargetBps?: number;
  rebalanceThresholdBps?: number;
  rebalanceCooldownSec?: number;
  performanceFeeBps?: number;
  /** USDG, 6 dp */
  depositCap?: bigint;
  isLoaded: boolean;
  hasDeployment: boolean;
};

/**
 * The rule set as the vault holds it right now — owner-tunable, so the landing reads it rather
 * than quoting the deploy-time defaults.
 */
export function useVaultRules(): VaultRules {
  const chainId = useChainId();
  const deployment = getDeployment(chainId);
  const vault = deployment?.vault;
  const fns = ["defaultMaxWeightBps", "bufferTargetBps", "rebalanceThresholdBps", "rebalanceCooldown", "performanceFeeBps", "depositCap"] as const;
  const { data, isLoading } = useReadContracts({
    contracts: vault ? fns.map((functionName) => ({ address: vault, abi: mosaicVaultAbi, functionName })) : [],
    allowFailure: true,
    query: { enabled: !!vault, refetchInterval: 30_000 },
  });
  const r = (i: number) => {
    const x = data?.[i];
    return x && x.status === "success" ? x.result : undefined;
  };
  const num = (v: unknown) => (v === undefined ? undefined : Number(v));
  return {
    maxWeightBps: num(r(0)),
    bufferTargetBps: num(r(1)),
    rebalanceThresholdBps: num(r(2)),
    rebalanceCooldownSec: num(r(3)),
    performanceFeeBps: num(r(4)),
    depositCap: r(5) as bigint | undefined,
    isLoaded: !!vault && !isLoading && data !== undefined,
    hasDeployment: !!deployment,
  };
}
