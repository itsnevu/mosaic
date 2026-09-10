"use client";

import { useBlendedApy } from "@/lib/hooks";

const DEPOSIT = 10_000;

const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * $10,000 at the vault's live blended rate. The figure moves with the pools, so it is read
 * from chain rather than written down — a worked example that quietly went stale would be
 * the least honest number on the page.
 */
export default function WorkedExample() {
  const apy = useBlendedApy();
  const perYear = apy === undefined ? undefined : DEPOSIT * apy;

  return (
    <>
      <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
        {usd(DEPOSIT)} × {apy === undefined ? "—" : `${(apy * 100).toFixed(2)}%`} APY
      </p>
      <p className="mt-3 font-mono text-5xl tabular-nums tracking-tighter text-money sm:text-6xl md:text-8xl">
        {perYear === undefined ? "—" : usd(perYear)}
      </p>
      <p className="mt-6 max-w-[54ch] text-base leading-relaxed text-zinc-600">
        Per year, at the vault&apos;s current blended rate, before the performance fee. It never lands as a
        token you collect; the price per share simply carries it. Ten thousand USDG becomes ten thousand
        shares worth {perYear === undefined ? "more" : usd(DEPOSIT + perYear)} without a single transaction
        from you.
      </p>
    </>
  );
}
