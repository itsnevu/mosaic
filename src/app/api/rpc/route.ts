import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin JSON-RPC relay for the browser's chain reads.
 *
 * The public Robinhood Chain RPC answers this server in under a second and
 * refuses or throttles many residential IPs entirely, which left the site
 * showing dashes for those visitors. The browser now posts its reads here and
 * this route forwards them upstream from one well-behaved address.
 *
 * Read-only by allowlist: the wallet signs and sends transactions through its
 * own provider, never through our transport, so nothing state-changing has a
 * reason to arrive. Identical calls within TTL share one upstream response
 * (many visitors, one eth_call); nothing is logged. Numbers still come from
 * the chain, just via one hop.
 *
 * Answers about closed history are kept longer: logs and blocks at least
 * HISTORY_MARGIN blocks behind the head cannot change, so the first visitor
 * who reads the vault's history since launch pays for it upstream and the
 * next ones read the same immutable answer here. It is a cache of what the
 * chain said, in memory, bounded, and rebuilt from the chain when it is gone;
 * not an index and not a database.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = process.env.RPC_UPSTREAM_URL || process.env.NEXT_PUBLIC_RPC_URL || "";
const TTL_MS = Number(process.env.RPC_RELAY_TTL_MS || 2_000);
const HISTORY_TTL_MS = Number(process.env.RPC_RELAY_HISTORY_TTL_MS || 60 * 60_000);
/** Blocks behind the head a range must end for its logs and blocks to count as closed. */
const HISTORY_MARGIN = 128n;
const MAX_ENTRIES = 5_000;
const TIMEOUT_MS = 12_000;
const MAX_BODY = 256 * 1024;

const ALLOW = new Set([
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_call",
  "eth_getLogs",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
]);

type Rpc = { jsonrpc?: string; id?: number | string | null; method?: string; params?: unknown };

const cache = new Map<string, { at: number; ttl: number; body: string }>();
/** Highest block number seen in an upstream answer; what "closed history" is measured from. */
let head = 0n;

function rpcError(id: Rpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function keyOf(r: Rpc) {
  return `${r.method}:${JSON.stringify(r.params ?? [])}`;
}

function hexBlock(v: unknown): bigint | undefined {
  return typeof v === "string" && /^0x[0-9a-f]+$/i.test(v) ? BigInt(v) : undefined;
}

/**
 * How long an answer may be shared: a moment for live state, an hour for closed history —
 * logs over a range, or a block, that ends at least HISTORY_MARGIN blocks behind the head.
 */
function ttlFor(r: Rpc): number {
  if (head === 0n) return TTL_MS;
  const p = Array.isArray(r.params) ? r.params : [];
  let last: bigint | undefined;
  if (r.method === "eth_getLogs") last = hexBlock((p[0] as { toBlock?: unknown } | undefined)?.toBlock);
  else if (r.method === "eth_getBlockByNumber") last = hexBlock(p[0]);
  return last !== undefined && last + HISTORY_MARGIN <= head ? HISTORY_TTL_MS : TTL_MS;
}

function remember(r: Rpc, body: string, parsedBody: { result?: unknown }) {
  if (r.method === "eth_blockNumber") {
    const n = hexBlock(parsedBody.result);
    if (n !== undefined && n > head) head = n;
  }
  // A null is "not yet", not a fact: a receipt or block that has not landed must not be
  // replayed to the next poll, or a wallet's wait for its own transaction sees a mined
  // transaction with no receipt and concludes it was replaced.
  if (parsedBody.result === null || parsedBody.result === undefined) return;
  cache.set(keyOf(r), { at: Date.now(), ttl: ttlFor(r), body });
}

async function forward(payload: unknown): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      cache: "no-store",
    });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  if (!UPSTREAM) return NextResponse.json(rpcError(null, -32603, "relay has no upstream"), { status: 503 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json(rpcError(null, -32600, "body too large"), { status: 413 });

  let parsed: Rpc | Rpc[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(rpcError(null, -32700, "parse error"), { status: 400 });
  }

  const batch = Array.isArray(parsed);
  const calls: Rpc[] = Array.isArray(parsed) ? parsed : [parsed];
  for (const c of calls) {
    if (!c || typeof c.method !== "string" || !ALLOW.has(c.method)) {
      return NextResponse.json(rpcError(c?.id, -32601, "method not relayed"), { status: 403 });
    }
  }

  // Sweep expired entries now and then, and the oldest if that is not enough, so the map
  // cannot grow without bound. Insertion order is age order.
  const now = Date.now();
  if (cache.size > 2_000) {
    for (const [k, v] of cache) if (now - v.at > v.ttl) cache.delete(k);
    for (const k of cache.keys()) {
      if (cache.size <= MAX_ENTRIES) break;
      cache.delete(k);
    }
  }
  const fresh = (c: Rpc) => {
    const hit = cache.get(keyOf(c));
    return hit && now - hit.at <= hit.ttl ? hit : undefined;
  };

  // Single call: serve from the window if we have it.
  if (!batch) {
    const one = calls[0];
    const hit = fresh(one);
    if (hit) {
      const body = JSON.parse(hit.body);
      body.id = one.id ?? null;
      return NextResponse.json(body);
    }
    try {
      const text = await forward(one);
      // Only a well-formed success is worth sharing; a 429 page or an error must not be replayed.
      try {
        const parsedText = JSON.parse(text);
        if (parsedText && typeof parsedText === "object" && !("error" in parsedText)) remember(one, text, parsedText);
      } catch {
        /* upstream returned non-JSON; pass it through uncached */
      }
      return new NextResponse(text, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    } catch {
      return NextResponse.json(rpcError(one.id, -32603, "upstream unavailable"), { status: 502 });
    }
  }

  // Batch: answer the cached ones locally, forward the rest as one batch.
  const out: unknown[] = new Array(calls.length);
  const pending: { i: number; call: Rpc }[] = [];
  calls.forEach((c, i) => {
    const hit = fresh(c);
    if (hit) {
      const body = JSON.parse(hit.body);
      body.id = c.id ?? null;
      out[i] = body;
    } else pending.push({ i, call: c });
  });
  if (pending.length) {
    try {
      const text = await forward(pending.map((p) => p.call));
      const results = JSON.parse(text) as Array<{ id?: Rpc["id"]; result?: unknown }>;
      const byId = new Map(results.map((r) => [String(r.id), r]));
      for (const p of pending) {
        const r = byId.get(String(p.call.id)) ?? rpcError(p.call.id, -32603, "missing in upstream batch");
        out[p.i] = r;
        if (!("error" in r)) remember(p.call, JSON.stringify(r), r);
      }
    } catch {
      for (const p of pending) out[p.i] = rpcError(p.call.id, -32603, "upstream unavailable");
    }
  }
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
