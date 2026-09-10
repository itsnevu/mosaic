"use client";

import Link from "next/link";
import { useState } from "react";
import { parseUnits, type Address } from "viem";
import { useConnection, usePublicClient, useWriteContract } from "wagmi";
import ConnectButton, { truncateAddress } from "@/components/ConnectButton";
import { ActivityFeed, OpsPanel } from "@/components/Operations";
import { WrongChainBanner, chainName } from "@/components/NetworkGuard";
import { useAllocations, useUserPosition, useVaultOps, useVaultStats } from "@/lib/hooks";
import { BPS, SHARE_DECIMALS, USDG_DECIMALS, mosaicVaultAbi, usdgAbi } from "@/lib/contracts";
import { fmtBps, fmtPps, fmtShares, fmtUsdg, usd } from "@/lib/format";

/* ---------- small pieces (mirrors landing page style) ---------- */

function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <rect x="0" y="0" width="9" height="9" fill="currentColor" />
      <rect x="11" y="0" width="9" height="9" fill="currentColor" opacity="0.55" />
      <rect x="0" y="11" width="9" height="9" fill="currentColor" opacity="0.55" />
      <rect x="11" y="11" width="9" height="9" fill="currentColor" />
    </svg>
  );
}

function Stat({ label, value, accent, last }: { label: string; value: string; accent?: boolean; last?: boolean }) {
  return (
    <div className={`py-5 px-4 ${last ? "" : "border-r hairline"}`}>
      <div className="label">{label}</div>
      <div className={`font-mono text-2xl mt-2 tracking-tight ${accent ? "text-accent" : ""}`}>{value}</div>
    </div>
  );
}

type TxState =
  | { kind: "idle" }
  | { kind: "pending"; step: string }
  | { kind: "confirmed"; hash: string; summary: string }
  | { kind: "error"; message: string };

function TxStatus({ s }: { s: TxState }) {
  if (s.kind === "idle") return null;
  const cls =
    s.kind === "pending" ? "text-muted" : s.kind === "confirmed" ? "text-ink" : "text-red-700";
  return (
    <p className={`label mt-4 !normal-case !tracking-normal ${cls}`}>
      {s.kind === "pending" && (
        <>
          <span className="pulse mr-2 align-middle" />
          {s.step}
        </>
      )}
      {s.kind === "confirmed" && (
        <>
          Confirmed · {s.summary} · <span className="font-mono">{truncateAddress(s.hash, 10, 6)}</span>
        </>
      )}
      {s.kind === "error" && <>Failed · {s.message}</>}
    </p>
  );
}

function shortError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const first = msg.split("\n")[0];
  return first.length > 160 ? first.slice(0, 157) + "…" : first;
}

/* ---------- page ---------- */

export default function Dashboard() {
  const { address, isConnected, chainId: walletChainId } = useConnection();
  const stats = useVaultStats();
  const pos = useUserPosition(address);
  const { allocations } = useAllocations(stats.poolCount);
  const ops = useVaultOps();
  const d = stats.deployment;

  const wrongChain = isConnected && walletChainId !== undefined && walletChainId !== stats.chainId;
  const unreachable = stats.hasDeployment && stats.isLoaded && stats.isError;

  /** Why deposits/withdrawals are unavailable, or undefined when they are fine. */
  function blockedBecause(kind: "deposit" | "withdraw"): string | undefined {
    if (!stats.hasDeployment) return "Unavailable on this network";
    if (unreachable) return "Chain unreachable";
    if (!isConnected) return "Connect wallet";
    if (wrongChain) return `Switch to ${chainName(stats.chainId)}`;
    if (kind === "deposit" && stats.paused === true) return "Deposits paused";
    return undefined;
  }

  const bufferBps =
    stats.totalAssets && stats.totalAssets > 0n && stats.idleAssets !== undefined
      ? Number((stats.idleAssets * BigInt(BPS)) / stats.totalAssets)
      : undefined;
  const capUsedBps =
    stats.depositCap && stats.depositCap > 0n && stats.totalAssets !== undefined
      ? Number((stats.totalAssets * BigInt(BPS)) / stats.depositCap)
      : undefined;

  return (
    <>
      <header className="border-b hairline sticky top-0 z-40 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-[1440px] px-6 sm:px-10 h-14 flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-ink">
            <Logo />
            <span className="font-medium tracking-tight text-[15px]">Mosaic</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-[12.5px] text-muted">
            <span className="text-ink">Vault</span>
            <a href="#allocation" className="hover:text-ink">Allocation</a>
            <a href="#ops" className="hover:text-ink">Operations</a>
            <a href="#position" className="hover:text-ink">Position</a>
            <a href="#activity" className="hover:text-ink">History</a>
            <Link href="/" className="hover:text-ink">← Site</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="label hidden sm:inline">
              {stats.hasDeployment ? chainName(stats.chainId) : "No deployment"}
            </span>
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1">
        {/* title + stat strip */}
        <section className="px-6 sm:px-10 pt-14 pb-10">
          <p className="tag mb-5">[01] USDG vault · mUSDG</p>
          <h1 className="text-[40px] sm:text-[56px] leading-[0.98] tracking-[-0.03em] font-medium">
            One ledger.
            <br />
            Live from chain.
          </h1>

          {!stats.hasDeployment && (
            <p className="mt-6 label !text-ink !normal-case !tracking-normal max-w-xl">
              No Mosaic deployment is configured for chain {stats.chainId}. Run <code className="font-mono">npm run chain</code>,{" "}
              <code className="font-mono">npm run deploy:local</code> and <code className="font-mono">npm run abi:sync</code>.
            </p>
          )}
          {unreachable && (
            <p className="mt-6 label !text-ink !normal-case !tracking-normal">
                {chainName(stats.chainId)} unreachable — check the RPC endpoint for this network.
            </p>
          )}
          <WrongChainBanner appChainId={stats.chainId} />

          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 border-y hairline">
            <Stat label="TVL" value={usd(stats.totalAssets)} accent />
            <Stat label="Share price" value={fmtPps(stats.pricePerShare)} />
            <Stat label="Pools" value={stats.poolCount === undefined ? "—" : String(stats.poolCount)} />
            <Stat label="Total shares" value={fmtShares(stats.totalSupply, 2)} last />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 border-b hairline">
            <Stat
              label="Idle buffer"
              value={bufferBps === undefined ? "—" : `${fmtBps(bufferBps)} / ${fmtBps(stats.bufferTargetBps, 0)}`}
            />
            <Stat label="Deployed" value={usd(stats.deployedAssets, 0)} />
            <Stat
              label="Deposit cap used"
              value={stats.depositCap === undefined ? "—" : `${fmtBps(capUsedBps)} of ${usd(stats.depositCap, 0)}`}
            />
            <Stat
              label="Status"
              value={stats.paused === undefined ? "—" : stats.paused ? "PAUSED" : "OPEN"}
              last
            />
          </div>
          <p className="label mt-4">
            {stats.performanceFeeBps === undefined
              ? "Performance fee unavailable"
              : `Performance fee ${fmtBps(stats.performanceFeeBps, 0)} of yield`}{" "}
            · Vault{" "}
            <span className="normal-case font-mono">{d ? d.vault : "—"}</span>
          </p>
        </section>

        {/* allocation */}
        <section id="allocation" className="border-t hairline">
          <div className="px-6 sm:px-10 pt-12 pb-8 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="tag mb-4">[02] Allocation</p>
              <h2 className="text-[28px] sm:text-[36px] leading-[1] tracking-[-0.03em] font-medium">
                Current weight vs target.
              </h2>
            </div>
            <p className="label max-w-sm">
              Weights are over deployed assets; the idle buffer sits outside them. A rebalance is pending when
              any deviation clears the threshold and the cooldown has elapsed.
            </p>
          </div>
          <div className="px-6 sm:px-10 pb-14 overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-y hairline">
                  {["#", "Pool", "Adapter", "Assets", "Current", "Target", "Δ", "Rate"].map((h, i) => (
                    <th key={h} className={`label py-3 ${i >= 3 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allocations.length === 0 && (
                  <tr className="border-b hairline">
                    <td colSpan={8} className="py-6 label">
                      {!stats.hasDeployment
                        ? "No deployment on this chain."
                        : unreachable
                          ? "Chain unreachable — allocation cannot be read."
                          : "Loading allocation…"}
                    </td>
                  </tr>
                )}
                {allocations.map((a) => {
                  const delta = a.currentBps - a.targetBps;
                  return (
                    <tr key={a.adapter} className="border-b hairline">
                      <td className="py-4 label !text-ink">{String(a.index + 1).padStart(2, "0")}</td>
                      <td className="py-4 font-medium tracking-tight">{a.name}</td>
                      <td className="py-4 font-mono text-[12px] text-muted" title={a.adapter}>
                        {truncateAddress(a.adapter)}
                      </td>
                      <td className="py-4 font-mono text-right tracking-tight">${fmtUsdg(a.assets)}</td>
                      <td className="py-4 font-mono text-right tracking-tight">{fmtBps(a.currentBps)}</td>
                      <td className="py-4 font-mono text-right tracking-tight text-muted">{fmtBps(a.targetBps)}</td>
                      <td
                        className={`py-4 font-mono text-right tracking-tight ${
                          Math.abs(delta) > 50 ? "text-accent" : "text-faint"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {(delta / 100).toFixed(2)}%
                      </td>
                      <td className="py-4 font-mono text-right tracking-tight">{fmtBps(a.rateBps)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {allocations.length > 0 && (
              <div className="tape mt-6 flex h-3 w-full gap-px border border-[color:var(--line-strong)] p-px">
                {allocations.map((a, i) => (
                  <div
                    key={a.adapter}
                    title={`${a.name} ${fmtBps(a.currentBps)}`}
                    style={{
                      width: `${a.currentBps / 100}%`,
                      backgroundColor: ["#0a0a0a", "#2a2a2e", "#46464c", "#6b6b70", "#9a9aa0"][i % 5],
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <OpsPanel totalAssets={stats.totalAssets} />

        {/* position + forms */}
        <section id="position" className="border-t hairline grid lg:grid-cols-[1fr_1fr_1fr]">
          <div className="px-6 sm:px-10 py-12 border-b lg:border-b-0 lg:border-r hairline">
            <p className="tag mb-4">[04] Your position</p>
            {!isConnected ? (
              <>
                <h2 className="text-[28px] leading-[1] tracking-[-0.03em] font-medium">Not connected.</h2>
                <p className="mt-4 text-[14.5px] leading-relaxed text-muted max-w-sm">
                  Connect an injected wallet on the local Anvil chain to see your USDG, your mUSDG shares and what
                  they are worth right now.
                </p>
                <div className="mt-6">
                  <ConnectButton className="btn" />
                </div>
              </>
            ) : (
              <dl className="mt-2 divide-y divide-[color:var(--line)]">
                {[
                  ["Wallet", address ? truncateAddress(address, 8, 6) : "—"],
                  ["USDG balance", usd(pos.usdgBalance)],
                  ["mUSDG shares", fmtShares(pos.shares)],
                  ["Value in USDG", usd(pos.assetValue)],
                  ["Allowance to vault", usd(pos.allowance)],
                ].map(([k, v]) => (
                  <div key={k} className="py-3 flex items-baseline justify-between gap-4">
                    <dt className="label">{k}</dt>
                    <dd className="font-mono tracking-tight">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <DepositForm
            vault={d?.vault}
            usdg={d?.usdg}
            address={address}
            allowance={pos.allowance}
            balance={pos.usdgBalance}
            blockedBecause={blockedBecause("deposit")}
            onDone={() => {
              stats.refetch();
              pos.refetch();
            }}
          />
          <WithdrawForm
            vault={d?.vault}
            address={address}
            shares={pos.shares}
            pricePerShare={stats.pricePerShare}
            capacity={ops.withdrawalCapacity}
            blockedBecause={blockedBecause("withdraw")}
            onDone={() => {
              stats.refetch();
              pos.refetch();
            }}
          />
        </section>

        <ActivityFeed />
      </main>

      <footer className="border-t hairline">
        <div className="mx-auto max-w-[1440px] px-6 sm:px-10 py-5 flex flex-col sm:flex-row gap-3 justify-between label">
          <span>© 2026 Mosaic Capital · local Anvil deployment (mock USDG, mock pools)</span>
          <span>Yield is realized in price per share. No claim button.</span>
        </div>
      </footer>
    </>
  );
}

/* ---------- deposit ---------- */

function DepositForm({
  vault,
  usdg,
  address,
  allowance,
  balance,
  blockedBecause,
  onDone,
}: {
  vault?: Address;
  usdg?: Address;
  address?: Address;
  allowance?: bigint;
  balance?: bigint;
  /** Set when depositing is unavailable; the reason is shown on the button. */
  blockedBecause?: string;
  onDone: () => void;
}) {
  const disabled = blockedBecause !== undefined;
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const { mutateAsync: write } = useWriteContract();
  const client = usePublicClient();

  let parsed: bigint | undefined;
  try {
    parsed = amount ? parseUnits(amount, USDG_DECIMALS) : undefined;
  } catch {
    parsed = undefined;
  }
  const needsApproval = parsed !== undefined && allowance !== undefined && allowance < parsed;
  const canSubmit = !disabled && !!vault && !!usdg && !!address && parsed !== undefined && parsed > 0n && tx.kind !== "pending";

  async function submit() {
    if (!canSubmit || !vault || !usdg || !address || parsed === undefined || !client) return;
    try {
      if (needsApproval) {
        setTx({ kind: "pending", step: "1/2 Approve USDG — confirm in wallet" });
        const h = await write({ address: usdg, abi: usdgAbi, functionName: "approve", args: [vault, parsed] });
        setTx({ kind: "pending", step: "1/2 Approving… waiting for confirmation" });
        await client.waitForTransactionReceipt({ hash: h });
      }
      setTx({ kind: "pending", step: `${needsApproval ? "2/2 " : ""}Deposit — confirm in wallet` });
      const h2 = await write({ address: vault, abi: mosaicVaultAbi, functionName: "deposit", args: [parsed, address] });
      setTx({ kind: "pending", step: "Depositing… waiting for confirmation" });
      const rc = await client.waitForTransactionReceipt({ hash: h2 });
      if (rc.status !== "success") throw new Error("transaction reverted");
      setTx({ kind: "confirmed", hash: h2, summary: `deposited $${fmtUsdg(parsed)}` });
      setAmount("");
      onDone();
    } catch (e) {
      setTx({ kind: "error", message: shortError(e) });
    }
  }

  return (
    <div className="px-6 sm:px-10 py-12 border-b lg:border-b-0 lg:border-r hairline">
      <p className="tag mb-4">[05] Deposit</p>
      <h2 className="text-[28px] leading-[1] tracking-[-0.03em] font-medium">Approve, then deposit.</h2>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
        Mint mUSDG at the current price per share. Sits in the buffer until the next batched deployment.
      </p>
      <label className="label block mt-8">Amount (USDG)</label>
      <div className="field mt-2 flex items-stretch">
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          disabled={disabled}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className="flex-1 min-w-0 px-4 py-3 font-mono text-xl bg-transparent outline-none disabled:text-faint"
        />
        <button
          type="button"
          className="chip !border-0 !border-l !border-[color:var(--line-strong)] !bg-transparent"
          disabled={disabled || balance === undefined}
          onClick={() => balance !== undefined && setAmount((Number(balance) / 10 ** USDG_DECIMALS).toString())}
        >
          MAX
        </button>
      </div>
      <p className="label mt-2">Balance {usd(balance)}</p>
      <button type="button" className="btn btn-fill mt-6 w-full" disabled={!canSubmit} onClick={submit}>
        {blockedBecause ?? (needsApproval ? "Approve & deposit" : "Deposit")}
      </button>
      <TxStatus s={tx} />
    </div>
  );
}

/* ---------- withdraw (redeem shares) ---------- */

function WithdrawForm({
  vault,
  address,
  shares,
  pricePerShare,
  capacity,
  blockedBecause,
  onDone,
}: {
  vault?: Address;
  address?: Address;
  shares?: bigint;
  pricePerShare?: bigint;
  /** What the vault could pay out right now, across idle and liquid pool balances. */
  capacity?: bigint;
  /** Set when redeeming is unavailable; the reason is shown on the button. */
  blockedBecause?: string;
  onDone: () => void;
}) {
  const disabled = blockedBecause !== undefined;
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const { mutateAsync: write } = useWriteContract();
  const client = usePublicClient();

  let parsed: bigint | undefined;
  try {
    parsed = amount ? parseUnits(amount, SHARE_DECIMALS) : undefined;
  } catch {
    parsed = undefined;
  }
  const tooMany = parsed !== undefined && shares !== undefined && parsed > shares;
  // estimate: shares (12 dec) * pps (1e18) / 1e18 / 1e6 -> USDG (6 dec)
  const est = parsed !== undefined && pricePerShare !== undefined ? (parsed * pricePerShare) / 10n ** 24n : undefined;
  const overCapacity = est !== undefined && capacity !== undefined && est > capacity;
  const canSubmit =
    !disabled && !!vault && !!address && parsed !== undefined && parsed > 0n && !tooMany && !overCapacity && tx.kind !== "pending";

  async function submit() {
    if (!canSubmit || !vault || !address || parsed === undefined || !client) return;
    try {
      setTx({ kind: "pending", step: "Redeem — confirm in wallet" });
      const h = await write({ address: vault, abi: mosaicVaultAbi, functionName: "redeem", args: [parsed, address, address] });
      setTx({ kind: "pending", step: "Redeeming… waiting for confirmation" });
      const rc = await client.waitForTransactionReceipt({ hash: h });
      if (rc.status !== "success") throw new Error("transaction reverted");
      setTx({ kind: "confirmed", hash: h, summary: `redeemed ${fmtShares(parsed)} shares` });
      setAmount("");
      onDone();
    } catch (e) {
      setTx({ kind: "error", message: shortError(e) });
    }
  }

  return (
    <div className="px-6 sm:px-10 py-12">
      <p className="tag mb-4">[06] Withdraw</p>
      <h2 className="text-[28px] leading-[1] tracking-[-0.03em] font-medium">Redeem shares.</h2>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
        Burn mUSDG, receive USDG at the current price. Served from the buffer; larger amounts unwind pools. Full fill
        or revert.
      </p>
      <label className="label block mt-8">Shares (mUSDG)</label>
      <div className="field mt-2 flex items-stretch">
        <input
          inputMode="decimal"
          placeholder="0.0000"
          value={amount}
          disabled={disabled}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className="flex-1 min-w-0 px-4 py-3 font-mono text-xl bg-transparent outline-none disabled:text-faint"
        />
        <button
          type="button"
          className="chip !border-0 !border-l !border-[color:var(--line-strong)] !bg-transparent"
          disabled={disabled || shares === undefined}
          onClick={() => shares !== undefined && setAmount((Number(shares) / 10 ** SHARE_DECIMALS).toString())}
        >
          MAX
        </button>
      </div>
      <p className="label mt-2">
        You hold {fmtShares(shares)} · ≈ {usd(est)} out{tooMany ? " · exceeds balance" : ""}
      </p>
      <p className={`label mt-1 ${overCapacity ? "!text-ink" : ""}`}>
        {overCapacity
          ? `Vault can serve ${usd(capacity, 0)} right now — the rest is lent out.`
          : capacity === undefined
            ? "Available liquidity unknown."
            : `Vault can serve ${usd(capacity, 0)} right now.`}
      </p>
      <button type="button" className="btn mt-6 w-full" disabled={!canSubmit} onClick={submit}>
        {blockedBecause ?? (overCapacity ? "Above available liquidity" : "Redeem")}
      </button>
      <TxStatus s={tx} />
    </div>
  );
}
