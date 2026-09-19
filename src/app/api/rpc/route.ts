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
 * (many visitors, one eth_call); nothing is stored beyond that window and
 * nothing is logged. Numbers still come from the chain, just via one hop.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = process.env.RPC_UPSTREAM_URL || process.env.NEXT_PUBLIC_RPC_URL || "";
const TTL_MS = Number(process.env.RPC_RELAY_TTL_MS || 2_000);
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

const cache = new Map<string, { at: number; body: string }>();

function rpcError(id: Rpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function keyOf(r: Rpc) {
  return `${r.method}:${JSON.stringify(r.params ?? [])}`;
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

  // Sweep expired entries now and then so the map cannot grow without bound.
  const now = Date.now();
  if (cache.size > 2_000) for (const [k, v] of cache) if (now - v.at > TTL_MS) cache.delete(k);

  // Single call: serve from the window if we have it.
  if (!batch) {
    const one = calls[0];
    const k = keyOf(one);
    const hit = cache.get(k);
    if (hit && now - hit.at <= TTL_MS) {
      const body = JSON.parse(hit.body);
      body.id = one.id ?? null;
      return NextResponse.json(body);
    }
    try {
      const text = await forward(one);
      // Only a well-formed success is worth sharing; a 429 page or an error must not be replayed.
      try {
        const parsedText = JSON.parse(text);
        if (parsedText && typeof parsedText === "object" && !("error" in parsedText)) cache.set(k, { at: Date.now(), body: text });
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
    const hit = cache.get(keyOf(c));
    if (hit && now - hit.at <= TTL_MS) {
      const body = JSON.parse(hit.body);
      body.id = c.id ?? null;
      out[i] = body;
    } else pending.push({ i, call: c });
  });
  if (pending.length) {
    try {
      const text = await forward(pending.map((p) => p.call));
      const results = JSON.parse(text) as Array<{ id?: Rpc["id"] }>;
      const byId = new Map(results.map((r) => [String(r.id), r]));
      for (const p of pending) {
        const r = byId.get(String(p.call.id)) ?? rpcError(p.call.id, -32603, "missing in upstream batch");
        out[p.i] = r;
        if (!("error" in r)) cache.set(keyOf(p.call), { at: Date.now(), body: JSON.stringify(r) });
      }
    } catch {
      for (const p of pending) out[p.i] = rpcError(p.call.id, -32603, "upstream unavailable");
    }
  }
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
