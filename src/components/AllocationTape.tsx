"use client";

/* [02] Allocation tape — the hero figure. Accrued's dotted canvas is replaced by a
   CSS dot field; the ETH → USDG pair is replaced by a treemap sized by live weight.
   Hovering the field fades the solid tiles out and an outlined ghost layer in.

   The tiles are the vault's real allocation. Before a chain answers there is nothing to
   draw, so the figure says so rather than showing a shape that means nothing. */

import { useAllocations, useVaultStats } from "@/lib/hooks";

type Tile = { name: string; w: number };

function Cell({ t, ghost }: { t: Tile; ghost: boolean }) {
  const narrow = t.w <= 11; // name would not fit on phones; show weight only there
  return (
    <div
      style={{ flex: t.w }}
      className={
        ghost
          ? "relative flex min-w-0 flex-col justify-between overflow-hidden border border-black/35 bg-background/40 p-2.5"
          : "relative flex min-w-0 flex-col justify-between overflow-hidden bg-accent p-2.5"
      }
    >
      <span
        className={
          (narrow ? "hidden sm:block " : "") +
          "truncate font-mono text-[9px] uppercase tracking-[0.12em] sm:text-[10px] " +
          (ghost ? "text-zinc-900" : "text-zinc-100")
        }
      >
        {t.name}
      </span>
      <span
        className={
          "mt-auto font-mono text-xs tabular-nums tracking-tight sm:text-sm " +
          (ghost ? "text-zinc-600" : "text-zinc-400")
        }
      >
        {t.w}%
      </span>
    </div>
  );
}

/* the idle buffer: a thin full-width strip under the pool tiles */
function Strip({ t, ghost }: { t: Tile; ghost: boolean }) {
  return (
    <div
      style={{ flex: Math.max(t.w, 3) }}
      className={
        ghost
          ? "flex min-h-0 items-center justify-between gap-2 overflow-hidden border border-black/35 bg-background/40 px-2.5 sm:px-3"
          : "flex min-h-0 items-center justify-between gap-2 overflow-hidden bg-accent px-2.5 sm:px-3"
      }
    >
      <span
        className={
          "truncate font-mono text-[9px] uppercase tracking-[0.12em] " + (ghost ? "text-zinc-900" : "text-zinc-100")
        }
      >
        {t.name}
      </span>
      <span className={"font-mono text-[10px] tabular-nums tracking-tight " + (ghost ? "text-zinc-600" : "text-zinc-400")}>
        {t.w}%
      </span>
    </div>
  );
}

/**
 * Greedy balance into two columns: heaviest tile first, each next one onto the lighter side.
 * Good enough to keep the figure readable for any number of pools, which is what the previous
 * hand-placed layout could not do — it only ever fitted exactly six.
 */
function splitBalanced(tiles: Tile[]): [Tile[], Tile[]] {
  const left: Tile[] = [];
  const right: Tile[] = [];
  let lw = 0;
  let rw = 0;
  for (const t of [...tiles].sort((a, b) => b.w - a.w)) {
    if (lw <= rw) {
      left.push(t);
      lw += t.w;
    } else {
      right.push(t);
      rw += t.w;
    }
  }
  return [left, right];
}

function Treemap({ tiles, buffer, ghost }: { tiles: Tile[]; buffer: Tile; ghost: boolean }) {
  const [left, right] = splitBalanced(tiles);
  const weight = (col: Tile[]) => col.reduce((a, t) => a + t.w, 0) || 1;

  return (
    <div className="flex h-full w-full gap-1">
      <div className="flex min-w-0 flex-col gap-1" style={{ flex: weight(left) }}>
        {left.map((t) => (
          <Cell key={t.name} t={t} ghost={ghost} />
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-1" style={{ flex: weight(right) + buffer.w }}>
        {right.map((t) => (
          <Cell key={t.name} t={t} ghost={ghost} />
        ))}
        <Strip t={buffer} ghost={ghost} />
      </div>
    </div>
  );
}

export default function AllocationTape() {
  const stats = useVaultStats();
  const { allocations } = useAllocations(stats.poolCount);

  const live = stats.hasDeployment && stats.isLoaded && !stats.isError;
  const total = stats.totalAssets;

  // Weights over total assets, so the idle buffer and the pools add up to the whole deposit.
  const tiles: Tile[] =
    live && total && total > 0n
      ? allocations
          .map((a) => ({ name: a.name, w: Math.round((Number(a.assets) / Number(total)) * 100) }))
          .filter((t) => t.w > 0)
      : [];
  const bufferPct =
    live && total && total > 0n && stats.idleAssets !== undefined
      ? Math.max(0, 100 - tiles.reduce((acc, t) => acc + t.w, 0))
      : 0;

  const ready = tiles.length > 0;

  return (
    <figure
      className="group relative mx-auto w-full max-w-[480px] cursor-crosshair outline-none"
      tabIndex={0}
      aria-label={
        ready
          ? `One USDG deposit spread across ${tiles.length} lending pools by weight`
          : "Allocation figure, waiting for the vault to answer"
      }
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">[02] Allocation tape</p>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Hover the field</span>
      </div>

      <div className="relative mt-5 overflow-hidden border border-black/10 bg-zinc-50/60">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/20 to-transparent"></span>
        <span className="absolute -left-px -top-px h-3 w-3 border-l border-t border-accent"></span>
        <span className="absolute -right-px -top-px h-3 w-3 border-r border-t border-accent"></span>
        <span className="absolute -bottom-px -left-px h-3 w-3 border-b border-l border-accent"></span>
        <span className="absolute -bottom-px -right-px h-3 w-3 border-b border-r border-accent"></span>

        {/* dot field (stands in for Accrued's <canvas>) */}
        <div className="tape-dots aspect-square h-auto w-full opacity-95" aria-hidden="true"></div>

        {ready ? (
          <>
            {/* solid tiles */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-7 sm:p-9">
              <div className="h-full w-full transition-opacity duration-300 group-hover:opacity-0 group-focus-within:opacity-0">
                <Treemap tiles={tiles} buffer={{ name: "Buffer", w: bufferPct }} ghost={false} />
              </div>
            </div>
            {/* outlined ghost tiles, revealed on hover */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-7 sm:p-9">
              <div className="h-full w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
                <Treemap tiles={tiles} buffer={{ name: "Buffer", w: bufferPct }} ghost />
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-7">
            <p className="max-w-[24ch] text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-zinc-400">
              {stats.hasDeployment ? "Reading allocation from chain…" : "No vault deployed on this network"}
            </p>
          </div>
        )}
      </div>

      <figcaption className="mt-6 grid grid-cols-[1fr_auto] items-end gap-6 border-t border-black/8 pt-5">
        <div>
          <p className="font-mono text-2xl tracking-tight text-zinc-900 md:text-[2rem]">
            USDG → {ready ? tiles.length : "—"} {ready && tiles.length === 1 ? "pool" : "pools"}
          </p>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            One deposit, then the spread
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl tabular-nums tracking-tighter text-money md:text-[2.75rem]">
            <BlendedApy />
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">% APY</p>
        </div>
      </figcaption>
    </figure>
  );
}

function BlendedApy() {
  const stats = useVaultStats();
  const { allocations } = useAllocations(stats.poolCount);
  const live = stats.hasDeployment && stats.isLoaded && !stats.isError;
  const weighted = allocations.reduce((acc, a) => acc + (a.rateBps * a.currentBps) / 10_000, 0);
  return <>{live && weighted > 0 ? (weighted / 100).toFixed(2) : "—"}</>;
}
