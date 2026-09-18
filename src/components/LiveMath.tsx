"use client";

import { useState } from "react";

import { useAllocations, useVaultStats } from "@/lib/hooks";

const MIN = 1000;
const MAX = 250000;
const STEP = 500;
const CHIPS = [1000, 10000, 25000, 50000, 100000];

const usd0 = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const usd2 = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LiveMath() {
  const [amount, setAmount] = useState(10000);
  const stats = useVaultStats();
  const { allocations } = useAllocations(stats.poolCount);

  // The vault's own blended rate: each pool's rate weighted by what it actually holds.
  const live = stats.hasDeployment && stats.isLoaded && !stats.isError;
  const weightedBps = allocations.reduce((acc, a) => acc + (a.rateBps * a.currentBps) / 10_000, 0);
  const isLive = live && weightedBps > 0;
  // No rate until the vault answers: a projection off an invented APY would be a claim.
  const apy = isLive ? weightedBps / 10_000 : undefined;

  const pct = ((amount - MIN) / (MAX - MIN)) * 100;
  const perYear = apy === undefined ? undefined : amount * apy;

  return (
    <div className="relative max-w-lg border border-black/10 bg-zinc-50/60">
      <span aria-hidden="true" className="absolute -left-px -top-px h-3 w-3 border-l border-t border-accent"></span>
      <span aria-hidden="true" className="absolute -right-px -top-px h-3 w-3 border-r border-t border-accent"></span>
      <span aria-hidden="true" className="absolute -bottom-px -left-px h-3 w-3 border-b border-l border-accent"></span>
      <span aria-hidden="true" className="absolute -bottom-px -right-px h-3 w-3 border-b border-r border-accent"></span>

      <div className="flex items-center justify-between gap-3 border-b border-black/8 px-4 py-3 sm:px-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          {apy === undefined ? "Waiting for the vault" : `Projected · ${(apy * 100).toFixed(2)}% APY`}
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse bg-accent"></span>
          Live math
        </span>
      </div>

      <div className="px-4 py-5 sm:px-5 sm:py-6">
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Deposit</p>
            <p className="mt-1 font-mono text-2xl tabular-nums tracking-tight text-zinc-900 transition-[opacity] duration-150 sm:text-3xl">
              {usd0(amount)}
            </p>
          </div>
          <p className="hidden font-mono text-xl text-zinc-400 sm:block" aria-hidden="true">
            →
          </p>
          <div className="sm:text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Per year</p>
            <p className="mt-1 font-mono text-2xl tabular-nums tracking-tight text-money transition-[opacity] duration-150 sm:text-3xl">
              {perYear === undefined ? "—" : usd2(perYear)}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="relative flex h-11 items-center touch-none">
            <div className="pointer-events-none absolute inset-x-0 h-1.5 bg-black/8"></div>
            <div
              className="pointer-events-none absolute left-0 h-1.5 bg-accent transition-[width] duration-200 ease-out"
              style={{ width: `${pct.toFixed(2)}%` }}
            ></div>
            <input
              type="range"
              min={MIN}
              max={MAX}
              step={STEP}
              value={amount}
              aria-label="Deposit amount"
              onChange={(e) => setAmount(Number(e.target.value))}
              className="hero-range absolute inset-0 w-full"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const active = c === amount;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setAmount(c)}
                className={
                  active
                    ? "border border-accent bg-raised px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-50"
                    : "inline-flex min-h-8 items-center border border-black/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:border-black/20 hover:text-zinc-800"
                }
              >
                {usd0(c)}
              </button>
            );
          })}
        </div>

        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          {isLive ? "Blended rate, live from the vault" : "No rate until the vault answers"} · APY moves with pool rates ·{" "}
          {usd2(100000)} deposit → {apy === undefined ? "—" : usd2(100000 * apy)} / yr
        </p>
      </div>
    </div>
  );
}
