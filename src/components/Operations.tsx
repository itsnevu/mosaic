"use client";

import { useChainId } from "wagmi";
import { truncateAddress } from "@/components/ConnectButton";
import { useVaultActivity } from "@/lib/events";
import { useVaultOps } from "@/lib/hooks";
import { supportedChains, explorerTxUrl } from "@/lib/chain";
import { fmtAgo, fmtBps, fmtSignedUsdg, fmtUntil, fmtUsdg, usd } from "@/lib/format";

/**
 * What the keeper sees: how much could leave the vault right now, and whether a rebalance
 * currently clears its own cost. Both come from the vault's views, not from a server.
 */
export function OpsPanel({ totalAssets }: { totalAssets?: bigint }) {
  const ops = useVaultOps();
  const p = ops.preview;

  const liquidBps =
    ops.withdrawalCapacity !== undefined && totalAssets !== undefined && totalAssets > 0n
      ? Number((ops.withdrawalCapacity * 10_000n) / totalAssets)
      : undefined;

  const verdict = !p
    ? "Waiting for the vault to answer"
    : p.ok
      ? "Ready — a keeper can rebalance now"
      : p.movedTotal === 0n
        ? "Nothing to move"
        : p.netGainAssets < p.minNetGainAssets
          ? "Held — the move would cost more than it is worth"
          : `Held — cooldown ${fmtUntil(p.readyAt)}`;

  return (
    <section id="ops" className="border-t hairline">
      <div className="px-6 sm:px-10 pt-12 pb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="tag mb-4">[03] Operations</p>
          <h2 className="text-[28px] sm:text-[36px] leading-[1] tracking-[-0.03em] font-medium">
            Liquidity now, and the next move.
          </h2>
        </div>
        <p className="label max-w-sm">
          Capacity counts only cash the venues can actually pay out; balances lent to borrowers are excluded. A
          rebalance runs when the drift clears the threshold, the cooldown has elapsed, and the expected yield
          change covers the gas.
        </p>
      </div>

      <div className="px-6 sm:px-10 pb-14 grid gap-x-10 gap-y-8 md:grid-cols-2">
        <dl className="divide-y divide-[color:var(--line)] border-y hairline">
          {[
            ["Withdrawable right now", usd(ops.withdrawalCapacity, 0)],
            ["Share of TVL that is liquid", fmtBps(liquidBps)],
            ["Peak weight drift", p ? fmtBps(p.maxDeviationBps) : "—"],
            ["Assets the next rebalance moves", p ? usd(p.movedTotal, 0) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="py-3 flex items-baseline justify-between gap-4">
              <dt className="label">{k}</dt>
              <dd className="font-mono tracking-tight">{v}</dd>
            </div>
          ))}
        </dl>

        <dl className="divide-y divide-[color:var(--line)] border-y hairline">
          {[
            ["Expected yield change, net of gas", p && p.movedTotal > 0n ? fmtSignedUsdg(p.netGainAssets) : "—"],
            ["Worst outcome allowed", p && p.movedTotal > 0n ? fmtSignedUsdg(p.minNetGainAssets) : "—"],
            ["Assumed gas cost", usd(ops.rebalanceCostAssets)],
            ["Slippage bound on unwinds", fmtBps(ops.maxSlippageBps)],
          ].map(([k, v]) => (
            <div key={k} className="py-3 flex items-baseline justify-between gap-4">
              <dt className="label">{k}</dt>
              <dd className="font-mono tracking-tight">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="label !normal-case !tracking-normal !text-ink md:col-span-2">
          <span className={p?.ok ? "pulse mr-2 align-middle" : "hidden"} />
          {verdict}
          {ops.scoringEnabled === undefined
            ? ""
            : ops.scoringEnabled
              ? " · target weights are scored on-chain"
              : " · target weights are set by the owner"}
          {ops.lastRebalance !== undefined && ops.lastRebalance > 0n
            ? ` · last rebalance ${fmtAgo(Number(ops.lastRebalance))}`
            : ""}
        </p>
      </div>
    </section>
  );
}

/** Rebalance, deployment and fee history, read straight from the vault's logs. */
export function ActivityFeed() {
  const { activity, isLoaded } = useVaultActivity();
  const chainId = useChainId();
  const chain = supportedChains.find((c) => c.id === chainId);

  return (
    <section id="activity" className="border-t hairline">
      <div className="px-6 sm:px-10 pt-12 pb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="tag mb-4">[07] History</p>
          <h2 className="text-[28px] sm:text-[36px] leading-[1] tracking-[-0.03em] font-medium">
            Every move the vault made.
          </h2>
        </div>
        <p className="label max-w-sm">
          Deployments, rebalances, fee accruals and target changes, in reverse order. Straight from chain logs —
          there is no server in between.
        </p>
      </div>

      <div className="px-6 sm:px-10 pb-14 overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-y hairline">
              {["When", "Event", "Detail", "Amount", "Tx"].map((h, i) => (
                <th key={h} className={`label py-3 ${i >= 3 ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activity.length === 0 && (
              <tr className="border-b hairline">
                <td colSpan={5} className="py-6 label">
                  {isLoaded ? "No vault activity in the scanned window yet." : "Reading logs…"}
                </td>
              </tr>
            )}
            {activity.map((row) => {
              const url = explorerTxUrl(chain, row.txHash);
              return (
                <tr key={row.id} className="border-b hairline">
                  <td className="py-4 label !text-ink whitespace-nowrap">{fmtAgo(row.timestamp)}</td>
                  <td className="py-4 font-medium tracking-tight whitespace-nowrap">{row.kind}</td>
                  <td className="py-4 text-[13.5px] text-muted">{row.detail}</td>
                  <td className="py-4 font-mono text-right tracking-tight whitespace-nowrap">
                    {usd(row.assets, 0)}
                  </td>
                  <td className="py-4 font-mono text-[12px] text-muted text-right whitespace-nowrap">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="hover:text-ink underline">
                        {truncateAddress(row.txHash, 8, 6)}
                      </a>
                    ) : (
                      <span title={row.txHash}>{truncateAddress(row.txHash, 8, 6)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
