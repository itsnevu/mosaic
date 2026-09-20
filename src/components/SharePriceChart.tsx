"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PricePoint } from "@/lib/events";
import { fmtPps } from "@/lib/format";

/**
 * The share price since launch as one line, drawn only from points the chain has: the launch
 * block at exactly 1.0000, every fee accrual, every deposit and redemption. Between points the
 * line is straight because yield accrues per second and the true curve is very nearly so; the
 * caption says how many events it is drawn from so nobody mistakes the line for a sample.
 *
 * Ink for the line, blue for the one money number it ends on, hairlines for the grid — the
 * same rules as the rest of the site. No area wash, no smoothing, sharp corners.
 */
export function SharePriceChart({
  points,
  livePps,
  now,
  eventCount,
  complete,
  isLoaded,
  isError,
  unavailable,
}: {
  points: PricePoint[];
  /** `pricePerShare()` right now; drawn as the last point so the line reaches today. */
  livePps?: bigint;
  /** Unix seconds the history was last read, which is when the live point is stamped. */
  now?: number;
  eventCount: number;
  complete: boolean;
  isLoaded: boolean;
  isError: boolean;
  /** Why the chart cannot be drawn at all, when that is the case. */
  unavailable?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    setWidth(Math.max(240, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);

  const series = useMemo(() => {
    const all: PricePoint[] = [...points];
    if (livePps !== undefined && now !== undefined && all.length > 0) {
      const last = all[all.length - 1];
      // Never earlier than the last event: a clock behind the chain must not fold the line back.
      const at = last.timestamp !== undefined && last.timestamp > now ? last.timestamp : now;
      all.push({ blockNumber: last.blockNumber, timestamp: at, pps: livePps, source: "now" });
    }
    return all;
  }, [points, livePps, now]);

  const H = 220;
  const PAD = { top: 18, right: 88, bottom: 28, left: 8 };
  const innerW = Math.max(1, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;

  const geo = useMemo(() => {
    if (series.length === 0) return undefined;
    // Time on x when every point has a timestamp; block order otherwise. Never a mix.
    const timed = series.every((p) => p.timestamp !== undefined);
    const xs = series.map((p, i) => (timed ? (p.timestamp as number) : Number(p.blockNumber) + i * 1e-6));
    const ys = series.map((p) => Number(p.pps) / 1e18);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    if (yMax - yMin < 1e-6) {
      yMin -= 0.0005;
      yMax += 0.0005;
    }
    const span = yMax - yMin;
    yMin -= span * 0.12;
    yMax += span * 0.12;
    const X = (x: number) => PAD.left + (x1 === x0 ? innerW : ((x - x0) / (x1 - x0)) * innerW);
    const Y = (y: number) => PAD.top + innerH - ((y - yMin) / (yMax - yMin)) * innerH;
    const pts = series.map((p, i) => ({ x: X(xs[i]), y: Y(ys[i]), v: ys[i], p }));
    const ticks = [0, 0.5, 1].map((t) => yMin + (yMax - yMin) * (0.1 + 0.8 * t));
    return { pts, ticks, Y, timed, x0, x1 };
  }, [series, innerW, innerH, PAD.left, PAD.top]);

  const status = unavailable
    ? unavailable
    : isError
      ? "The chain could not be read."
      : !isLoaded
        ? "Reading the vault's history…"
        : series.length === 0
          ? "No events to draw from yet."
          : undefined;

  const last = geo?.pts[geo.pts.length - 1];
  const hov = hover !== undefined ? geo?.pts[hover] : undefined;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + PAD.left;
    let best = 0;
    let bestD = Infinity;
    geo.pts.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  const date = (p?: PricePoint) =>
    p?.timestamp === undefined
      ? `block ${p?.blockNumber ?? "—"}`
      : new Date(p.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div ref={wrap} className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="label">Share price since launch</p>
        <p className="label">
          {geo && geo.timed ? `${date(series[0])} → ${date(series[series.length - 1])}` : ""}
          {status ? "" : ` · drawn from ${eventCount.toLocaleString("en-US")} on-chain event${eventCount === 1 ? "" : "s"}`}
          {!status && !complete ? " · history before the scan window is not shown" : ""}
        </p>
      </div>

      <div className="mt-3 border-y hairline">
        {status ? (
          <p className="label !normal-case !tracking-normal !text-ink py-10">{status}</p>
        ) : (
          <svg width={width} height={H} className="block" role="img" aria-label="Share price since launch">
            {geo?.ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + innerW} y1={geo.Y(t)} y2={geo.Y(t)} stroke="var(--line)" strokeWidth={1} />
                {/* A tick label under the end label would only be noise; the end label carries the value. */}
                {!(last && Math.abs(geo.Y(t) - last.y) < 14) && (
                  <text
                    x={PAD.left + innerW + 8}
                    y={geo.Y(t) + 3.5}
                    fontFamily="var(--font-mono)"
                    fontSize={10}
                    fill="var(--faint)"
                  >
                    {t.toFixed(4)}
                  </text>
                )}
              </g>
            ))}
            {geo && (
              <>
                <path
                  d={geo.pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {last && (
                  <>
                    <circle cx={last.x} cy={last.y} r={6} fill="#fff" />
                    <circle cx={last.x} cy={last.y} r={4} fill="var(--ink)" />
                    <text
                      x={PAD.left + innerW + 8}
                      y={Math.min(Math.max(last.y + 4, PAD.top + 10), PAD.top + innerH)}
                      fontFamily="var(--font-mono)"
                      fontSize={12}
                      fontWeight={500}
                      fill="#2563eb"
                      style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 4 }}
                    >
                      {last.v.toFixed(4)}
                    </text>
                  </>
                )}
                {hov && (
                  <>
                    <line x1={hov.x} x2={hov.x} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--line-strong)" strokeWidth={1} />
                    <circle cx={hov.x} cy={hov.y} r={6} fill="#fff" />
                    <circle cx={hov.x} cy={hov.y} r={4} fill="var(--ink)" />
                  </>
                )}
                <rect
                  x={PAD.left}
                  y={PAD.top}
                  width={innerW}
                  height={innerH}
                  fill="transparent"
                  onPointerMove={onMove}
                  onPointerLeave={() => setHover(undefined)}
                />
              </>
            )}
          </svg>
        )}
      </div>

      <p className="label mt-3 min-h-[1.2em]">
        {hov
          ? `${date(hov.p)} · ${fmtPps(hov.p.pps)} USDG per share · ${
              { launch: "launch", fee: "fee accrual", deposit: "deposit", withdraw: "redemption", now: "now" }[hov.p.source]
            }`
          : "Yield arrives as this line rising. It moves only when the chain says it moved."}
      </p>
    </div>
  );
}
