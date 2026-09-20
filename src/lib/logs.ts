/**
 * Adaptive log scanning for questions that need the vault's whole history — a depositor's
 * own ledger, the share price since launch, the count of everyone who ever deposited.
 *
 * The recent-history walker in `events.ts` reads a bounded window backwards from the head,
 * which is right for a table of the latest moves and wrong for "since launch": on a chain
 * that produces several blocks a second, launch is hundreds of thousands of blocks ago
 * within days and a fixed chunk budget never reaches it.
 *
 * This scanner asks for the whole range in one request first. Providers that allow it
 * answer in one round trip. Providers that cap the block range or the result count refuse,
 * and the span is halved until a request succeeds; that span is then reused for the rest of
 * the range, several requests in flight at once, and remembered for the next scan. Results
 * are kept per query in memory, so a refetch reads only the blocks that arrived since.
 *
 * Every result says whether it is complete. A budget of requests bounds the cost of a hostile
 * provider, and when it runs out the caller is told so and shows a dash or a qualified
 * figure — never a number that quietly means "since some block".
 */

const REQUEST_BUDGET = Number(process.env.NEXT_PUBLIC_LOG_REQUEST_BUDGET ?? 160);
const CONCURRENCY = 8;
/** Probes spent narrowing the span between the last refusal and the last success. */
const MAX_PROBES = 3;
/** Blocks re-read on every refetch, so a short reorg cannot leave a stale row behind. */
const RESCAN_MARGIN = 64n;

export type Range = { from: bigint; to: bigint };
export type Fetch<T> = (range: Range) => Promise<T[]>;

export type Scan<T> = {
  logs: T[];
  /** False when the budget ran out or a single block could not be read. */
  complete: boolean;
  /** First block the logs cover. */
  from: bigint;
  /** Last block the logs cover. */
  to: bigint;
};

type Cached<T> = Scan<T> & { span: bigint };
const memory = new Map<string, Cached<unknown>>();

/** Forget a cached scan, e.g. after the connected wallet changes. Rarely needed. */
export function forgetScan(key: string) {
  memory.delete(key);
}

async function scanFresh<T>(
  fetch: Fetch<T>,
  range: Range,
  spanHint: bigint | undefined,
  budget: { left: number },
): Promise<Cached<T>> {
  const logs: T[] = [];
  let complete = true;
  let span = spanHint ?? range.to - range.from + 1n;
  if (span < 1n) span = 1n;
  let cursor = range.from;

  // Phase one, sequential: find the widest span the provider accepts. Halve on refusal until
  // something works, then narrow the gap between the last refusal and the last success with a
  // few probes — a provider capped at 10,000 blocks would otherwise be read at 5,000 and cost
  // twice the requests. Every attempt that succeeds also advances the cursor, so none is wasted.
  let good: bigint | undefined;
  let bad: bigint | undefined;
  let probes = 0;
  while (cursor <= range.to) {
    if (budget.left <= 0) return { logs, complete: false, from: range.from, to: cursor - 1n, span: good ?? span };
    const from = cursor;
    const to = from + span - 1n > range.to ? range.to : from + span - 1n;
    budget.left--;
    try {
      logs.push(...(await fetch({ from, to })));
      cursor = to + 1n;
      const width = to - from + 1n;
      if (good === undefined || width > good) good = width;
    } catch {
      if (span <= 1n) {
        // A single block the provider will not serve: skip it and say so.
        complete = false;
        cursor = to + 1n;
        continue;
      }
      bad = span;
      span = good ?? span / 2n;
      if (good === undefined) continue;
    }
    if (good === undefined) continue;
    if (bad === undefined || probes >= MAX_PROBES || bad - good <= good / 8n) break;
    span = (good + bad) / 2n;
    probes++;
  }
  span = good ?? span;

  // Phase two: the rest of the range at the learned span, a few requests at a time.
  while (cursor <= range.to) {
    const batch: Range[] = [];
    while (batch.length < CONCURRENCY && cursor <= range.to) {
      const to = cursor + span - 1n > range.to ? range.to : cursor + span - 1n;
      batch.push({ from: cursor, to });
      cursor = to + 1n;
    }
    if (budget.left < batch.length) {
      return { logs, complete: false, from: range.from, to: batch[0].from - 1n, span };
    }
    budget.left -= batch.length;
    const results = await Promise.all(batch.map((r) => fetch(r).then((l) => ({ ok: true as const, l })).catch(() => ({ ok: false as const }))));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.ok) {
        logs.push(...r.l);
        continue;
      }
      // A refusal here means the span learned earlier was a lucky quiet stretch; try this
      // piece again at half the span, once, then give it up rather than spiral.
      const piece = batch[i];
      const half = span / 2n;
      if (half < 1n || budget.left < 2) {
        complete = false;
        continue;
      }
      budget.left -= 2;
      const mid = piece.from + half - 1n;
      const again = await Promise.all(
        [
          { from: piece.from, to: mid },
          { from: mid + 1n, to: piece.to },
        ].map((r) => fetch(r).catch(() => null)),
      );
      for (const l of again) {
        if (l === null) complete = false;
        else logs.push(...l);
      }
      span = half;
    }
  }

  return { logs, complete, from: range.from, to: range.to, span };
}

/**
 * Logs for `fetch` over [floor, head], reusing what an earlier call of the same `key` already
 * read. `dedupe` identifies a log so the reorg margin cannot double-count.
 */
export async function scanLogs<T>(
  key: string,
  fetch: Fetch<T>,
  floor: bigint,
  head: bigint,
  dedupe: (log: T) => string,
): Promise<Scan<T>> {
  const budget = { left: REQUEST_BUDGET };
  const prior = memory.get(key) as Cached<T> | undefined;

  if (!prior || !prior.complete || prior.from !== floor) {
    // A span learned on a scan that ran out of budget may be a hostile provider's, or a bad
    // hour's; start from the whole range again rather than inherit it.
    const fresh = await scanFresh(fetch, { from: floor, to: head }, prior?.complete ? prior.span : undefined, budget);
    memory.set(key, fresh as Cached<unknown>);
    return fresh;
  }

  if (head <= prior.to) return prior;

  const from = prior.to - RESCAN_MARGIN > floor ? prior.to - RESCAN_MARGIN : floor;
  const next = await scanFresh(fetch, { from, to: head }, prior.span, budget);
  const seen = new Set(prior.logs.map(dedupe));
  const merged: Cached<T> = {
    logs: [...prior.logs, ...next.logs.filter((l) => !seen.has(dedupe(l)))],
    complete: next.complete,
    from: floor,
    to: next.complete ? head : next.to,
    span: next.span,
  };
  memory.set(key, merged as Cached<unknown>);
  return merged;
}

/** Identity for a viem log: transaction hash plus its index within the block. */
export function logId(l: { transactionHash: `0x${string}` | null; logIndex: number | null }): string {
  return `${l.transactionHash}-${l.logIndex}`;
}
