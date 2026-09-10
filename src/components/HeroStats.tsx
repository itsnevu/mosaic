"use client";

import { formatUnits } from "viem";
import { useDepositorCount } from "@/lib/events";
import { useAllocations, useVaultStats } from "@/lib/hooks";
import { fmtPps } from "@/lib/format";
import { USDG_DECIMALS } from "@/lib/contracts";

/**
 * Shown before a chain answers, or when no deployment exists for the active chain.
 * Every figure here is a dash on purpose: these sit beside live numbers, and a plausible
 * stand-in would read as a real metric. The cooldown is a contract constant, not a measurement,
 * so it is the one thing that can be stated without asking the chain.
 */
const FALLBACK = {
  apy: "—",
  pools: "—",
  cooldown: "24h",
  tvl: "—",
  depositors: "—",
  buffer: "—",
  pps: "—",
};

function usd(v?: bigint) {
  if (v === undefined) return undefined;
  const n = Number(formatUnits(v, USDG_DECIMALS));
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function HeroStats() {
  const s = useVaultStats();
  const { allocations } = useAllocations(s.poolCount);
  const depositors = useDepositorCount();

  const live = s.hasDeployment && s.isLoaded && !s.isError;

  // Blended APY: each pool's rate weighted by what it actually holds.
  const weighted = allocations.reduce((acc, a) => acc + (a.rateBps * a.currentBps) / 10_000, 0);
  const apy = live && weighted > 0 ? `${(weighted / 100).toFixed(2)}%` : FALLBACK.apy;

  const tvl = (live && usd(s.totalAssets)) || FALLBACK.tvl;
  const pools = live && s.poolCount !== undefined ? String(s.poolCount) : FALLBACK.pools;
  const pps = live && s.pricePerShare !== undefined ? fmtPps(s.pricePerShare) : FALLBACK.pps;

  const buffer =
    live && s.idleAssets !== undefined && s.totalAssets !== undefined && s.totalAssets > 0n
      ? `${((Number(s.idleAssets) / Number(s.totalAssets)) * 100).toFixed(1)}%`
      : FALLBACK.buffer;

  const rowA: [string, string][] = [
    ["Current APY", apy],
    ["Pools", pools],
    ["Cooldown", FALLBACK.cooldown],
  ];
  const rowB: [string, string][] = [
    ["TVL", tvl],
    ["Depositors", live && depositors !== undefined ? depositors.toLocaleString("en-US") : FALLBACK.depositors],
    ["Idle buffer", buffer],
    ["Share price", pps],
  ];

  return (
    <>
      <dl className="mt-8 grid grid-cols-3 divide-x divide-black/8 border-y border-black/8">
        {rowA.map(([k, v]) => (
          <div key={k} className="px-3 py-4 text-center md:py-5">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {k === "Cooldown" && <span className="hidden sm:inline">Rebalance </span>}
              {k}
            </dt>
            <dd className="mt-1.5 font-mono text-lg tabular-nums tracking-tight text-zinc-900 sm:text-xl">{v}</dd>
          </div>
        ))}
      </dl>

      <dl className="mt-4 grid grid-cols-2 divide-x divide-black/8 border-y border-black/8 sm:grid-cols-4">
        {rowB.map(([k, v]) => (
          <div key={k} className="flex flex-col px-3 py-4 text-center md:py-5">
            <dt className="flex min-h-[2em] items-start justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {k}
            </dt>
            <dd className="mt-auto pt-1.5 font-mono text-lg tabular-nums tracking-tight text-money sm:text-xl">{v}</dd>
          </div>
        ))}
      </dl>

      {live && (
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse bg-accent" />
          Live from the vault
        </p>
      )}
    </>
  );
}
