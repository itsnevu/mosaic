"use client";

import { useVaultRules } from "@/lib/hooks";

const pct = (bps?: number, digits = 0) => (bps === undefined ? "—" : `${(bps / 100).toFixed(digits)}%`);
const hours = (sec?: number) => (sec === undefined ? "—" : sec % 3600 === 0 ? `${sec / 3600}h` : `${Math.round(sec / 60)}m`);
const usd = (v?: bigint) => (v === undefined ? "—" : `$${(Number(v) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);

/** "The rule set is the product" — every figure here is the vault's current parameter, read on load. */
export function RuleNumbers() {
  const r = useVaultRules();
  const rows: { label: string; value: string; body: string }[] = [
    { label: "Max pool weight", value: pct(r.maxWeightBps), body: "No single pool may exceed this share of the vault, regardless of how attractive it looks." },
    { label: "Idle buffer target", value: pct(r.bufferTargetBps, 1), body: "Sized against observed redemptions so the common withdrawal never touches a pool." },
    { label: "Rebalance threshold", value: pct(r.rebalanceThresholdBps, 1), body: "Drift below this is allowed to sit. A move must also earn more than it costs." },
    { label: "Cooldown", value: hours(r.rebalanceCooldownSec), body: "A hard wait between rebalances. Two pools trading places cannot make the vault oscillate." },
    { label: "Performance fee", value: r.performanceFeeBps === undefined ? "—" : `${pct(r.performanceFeeBps)} of yield`, body: "Charged on yield generated, never on principal, and realized in the price per share." },
    { label: "Deposit cap", value: usd(r.depositCap), body: "Conservative during the early period. The amount at stake grows only as the system proves itself." },
  ];
  return (
    <>
      {rows.map((n, i) => (
        <article
          key={n.label}
          className={`border-b border-black/8 px-4 py-12 md:px-8 md:py-16 ${i % 2 === 0 ? "md:border-r" : ""}`}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{n.label}</p>
          <p className="mt-4 font-mono text-4xl tabular-nums tracking-tighter text-zinc-900 sm:text-5xl md:text-6xl">
            {n.value}
          </p>
          <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-zinc-600">{n.body}</p>
        </article>
      ))}
      {!r.hasDeployment && (
        <p className="col-span-full px-4 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 md:px-8">
          No vault deployed on this network — parameters appear once one is.
        </p>
      )}
    </>
  );
}
