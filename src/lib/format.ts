import { formatUnits } from "viem";
import { SHARE_DECIMALS, USDG_DECIMALS } from "./contracts";

/**
 * USDG with its dollar sign, or a bare dash when there is nothing to show.
 * Composing the sign into a template gives "$—" when a read fails, which reads like a
 * broken number rather than an absent one — the same goes for units and "of X" phrasing.
 */
export function usd(v?: bigint, digits = 2): string {
  return v === undefined ? "—" : `$${fmtUsdg(v, digits)}`;
}

export function fmtUsdg(v?: bigint, digits = 2): string {
  if (v === undefined) return "—";
  const n = Number(formatUnits(v, USDG_DECIMALS));
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtShares(v?: bigint, digits = 4): string {
  if (v === undefined) return "—";
  const n = Number(formatUnits(v, SHARE_DECIMALS));
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** pricePerShare is 1e18-scaled. */
export function fmtPps(v?: bigint, digits = 4): string {
  if (v === undefined) return "—";
  return (Number(v) / 1e18).toFixed(digits);
}

export function fmtBps(bps?: number, digits = 2): string {
  if (bps === undefined) return "—";
  return `${(bps / 100).toFixed(digits)}%`;
}

/** Signed USDG, e.g. "+$120.00" / "-$3.40". */
export function fmtSignedUsdg(v?: bigint, digits = 2): string {
  if (v === undefined) return "—";
  const neg = v < 0n;
  return `${neg ? "-" : "+"}$${fmtUsdg(neg ? -v : v, digits)}`;
}

/** Compact relative time, e.g. "4m ago", "3d ago". */
export function fmtAgo(unixSeconds?: number, now = Date.now()): string {
  if (unixSeconds === undefined) return "—";
  const s = Math.max(0, Math.floor(now / 1000 - unixSeconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Countdown to a future unix timestamp, e.g. "in 3h 12m", or "now". */
export function fmtUntil(unixSeconds?: bigint, now = Date.now()): string {
  if (unixSeconds === undefined) return "—";
  const s = Number(unixSeconds) - Math.floor(now / 1000);
  if (s <= 0) return "now";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}
