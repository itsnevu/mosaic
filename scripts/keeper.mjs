#!/usr/bin/env node
// Mosaic keeper: keeps rate history warm, deploys idle capital above the buffer, and
// rebalances when the vault's own preview says it is worth doing.
//
//   RPC_URL=... KEEPER_PRIVATE_KEY=0x... node scripts/keeper.mjs
//
// Built to be left running unattended, which means three things beyond the tick itself:
// it survives an RPC going down, it never hangs forever on one, and it tells somebody
// when it stops working. A keeper that dies quietly is worse than one that never ran.
//
// Env:
//   RPC_URL                 required; comma-separated for failover, tried in order
//   KEEPER_PRIVATE_KEY      required unless DRY_RUN=1
//   DEPLOYMENT              path to a deployments json (default: contracts/deployments/local.json)
//   INTERVAL_MS             poll interval (default 60000)
//   TICK_TIMEOUT_MS         abandon a tick that hangs this long (default 120000)
//   POKE_INTERVAL_MS        max age of a rate sample before poking (default 3600000)
//   NATIVE_USD              native token price in USD, for pricing gas into USDG (default 0)
//   COST_MARGIN             multiplier applied to the gas estimate (default 1.5)
//   MIN_GAS_BALANCE         alert below this much native token (default 0.05)
//   ALERT_WEBHOOK_URL       POST alerts here (Slack- and Discord-shaped payload)
//   ALERT_AFTER_FAILURES    consecutive failures before alerting (default 3)
//   HEALTH_PORT             serve GET /health with the last tick's state
//   HEARTBEAT_FILE          write the same state to this path each tick
//   INSTANCE                name for this instance in logs and alerts (default hostname)
//   JITTER_MS               random delay before each tick (default 0; set when running >1 instance)
//   SCORING=1               also push scored target weights when the vault allows it
//   DRY_RUN=1               simulate everything, send nothing
//   ONCE=1                  run a single tick and exit
import { createServer } from "node:http";
import { hostname } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  fallback,
  formatEther,
  formatUnits,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
const DRY_RUN = env.DRY_RUN === "1";
const ONCE = env.ONCE === "1";
const INTERVAL_MS = Number(env.INTERVAL_MS ?? 60_000);
const TICK_TIMEOUT_MS = Number(env.TICK_TIMEOUT_MS ?? 120_000);
const POKE_INTERVAL_MS = Number(env.POKE_INTERVAL_MS ?? 3_600_000);
const COST_MARGIN = Number(env.COST_MARGIN ?? 1.5);
const NATIVE_USD = Number(env.NATIVE_USD ?? 0);
const MIN_GAS_BALANCE = parseEther(String(env.MIN_GAS_BALANCE ?? "0.05"));
const ALERT_AFTER_FAILURES = Number(env.ALERT_AFTER_FAILURES ?? 3);
const JITTER_MS = Number(env.JITTER_MS ?? 0);
const INSTANCE = env.INSTANCE || hostname();
const USDG_DECIMALS = 6;

const RPC_URLS = (env.RPC_URL ?? "").split(",").map((u) => u.trim()).filter(Boolean);
if (RPC_URLS.length === 0) fail("RPC_URL is required");
if (!DRY_RUN && !env.KEEPER_PRIVATE_KEY) fail("KEEPER_PRIVATE_KEY is required (or set DRY_RUN=1)");

const deployment = JSON.parse(
  readFileSync(resolve(root, env.DEPLOYMENT ?? "contracts/deployments/local.json"), "utf8"),
);
// contracts/out never leaves the dev machine; sync-abi.mjs also drops the ABI next to this script.
const abi = JSON.parse(readFileSync(join(root, "scripts/MosaicVault.abi.json"), "utf8"));

function fail(msg) {
  console.error(`keeper: ${msg}`);
  process.exit(1);
}
const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);
const usd = (v) => `$${Number(formatUnits(v, USDG_DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chain = defineChain({
  id: deployment.chainId,
  name: deployment.name ?? `chain-${deployment.chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: RPC_URLS } },
});

// One endpoint going down should degrade nothing: viem's fallback transport retries the
// next URL in order and ranks them by responsiveness thereafter.
const transport = fallback(
  RPC_URLS.map((url) => http(url, { timeout: 20_000, retryCount: 2 })),
  { rank: RPC_URLS.length > 1 },
);
const publicClient = createPublicClient({ chain, transport });
const account = env.KEEPER_PRIVATE_KEY ? privateKeyToAccount(env.KEEPER_PRIVATE_KEY) : undefined;
const walletClient = account ? createWalletClient({ account, chain, transport }) : undefined;
const vault = { address: deployment.vault, abi };

// ---------------------------------------------------------------- alerting

/**
 * Alerts are deduplicated by key and resolve themselves, so a persistent problem pages
 * once rather than every minute, and recovery is announced. Without that an operator
 * learns to ignore the channel, which is the same as having no alerting.
 */
const firing = new Map();

async function post(text) {
  if (!env.ALERT_WEBHOOK_URL) return;
  try {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `text` is what Slack reads, `content` is what Discord reads; sending both means
      // the operator does not have to tell us which one they use.
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    log(`alert delivery failed: ${reason(e)}`);
  }
}

async function alert(key, message) {
  if (firing.has(key)) return;
  firing.set(key, Date.now());
  log(`ALERT ${key}: ${message}`);
  await post(`🔴 Mosaic keeper (${INSTANCE}) · ${message}`);
}

async function resolveAlert(key, message) {
  if (!firing.has(key)) return;
  const since = Math.round((Date.now() - firing.get(key)) / 1000);
  firing.delete(key);
  log(`RESOLVED ${key}: ${message}`);
  await post(`🟢 Mosaic keeper (${INSTANCE}) · ${message} (was firing ${since}s)`);
}

// ---------------------------------------------------------------- health

const health = {
  instance: INSTANCE,
  chainId: deployment.chainId,
  vault: deployment.vault,
  dryRun: DRY_RUN,
  startedAt: new Date().toISOString(),
  lastTickAt: null,
  lastOkAt: null,
  consecutiveFailures: 0,
  lastError: null,
  alerts: [],
  vaultState: null,
};

function publishHealth() {
  health.alerts = [...firing.keys()];
  // A tick that never completes must look unhealthy, not merely stale.
  const staleAfter = INTERVAL_MS + TICK_TIMEOUT_MS;
  health.healthy =
    health.consecutiveFailures < ALERT_AFTER_FAILURES &&
    (!health.lastOkAt || Date.now() - Date.parse(health.lastOkAt) < staleAfter);
  if (env.HEARTBEAT_FILE) {
    try {
      writeFileSync(resolve(root, env.HEARTBEAT_FILE), JSON.stringify(health, null, 2));
    } catch (e) {
      log(`heartbeat write failed: ${reason(e)}`);
    }
  }
}

if (env.HEALTH_PORT) {
  createServer((req, res) => {
    if (req.url?.startsWith("/health")) {
      publishHealth();
      res.writeHead(health.healthy ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify(health, null, 2));
      return;
    }
    res.writeHead(404).end();
  }).listen(Number(env.HEALTH_PORT), () => log(`health endpoint on :${env.HEALTH_PORT}/health`));
}

// ---------------------------------------------------------------- chain calls

/** Simulate first; only send when the vault agrees the call is valid. */
async function send(functionName, args = []) {
  try {
    const { request } = await publicClient.simulateContract({ ...vault, functionName, args, account: account?.address });
    if (DRY_RUN) {
      log(`  would send ${functionName}()`);
      return "dry-run";
    }
    const hash = await walletClient.writeContract(request);
    const rc = await publicClient.waitForTransactionReceipt({ hash });
    log(`  ${functionName}() ${rc.status} gas=${rc.gasUsed} ${hash}`);
    return rc.status === "success" ? hash : undefined;
  } catch (e) {
    return { skipped: reason(e) };
  }
}

function reason(e) {
  const name = e?.cause?.data?.errorName ?? e?.cause?.cause?.data?.errorName;
  if (name) return name;
  const line = String(e?.shortMessage ?? e?.message ?? e).split("\n")[0];
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/** Price one rebalance in USDG so the vault's profitability gate has a real number to work with. */
async function refreshCostEstimate() {
  if (!NATIVE_USD) return; // no price feed configured: leave the on-chain estimate alone
  let gas = 900_000n;
  try {
    gas = await publicClient.estimateContractGas({ ...vault, functionName: "rebalance", account: account?.address });
  } catch {
    /* rebalance not currently callable — fall back to the static estimate */
  }
  const { maxFeePerGas, gasPrice } = await publicClient.estimateFeesPerGas().catch(() => ({}));
  const price = maxFeePerGas ?? gasPrice ?? (await publicClient.getGasPrice());
  const nativeCost = Number(formatEther(gas * price));
  const costAssets = parseUnits((nativeCost * NATIVE_USD * COST_MARGIN).toFixed(USDG_DECIMALS), USDG_DECIMALS);
  const current = await publicClient.readContract({ ...vault, functionName: "rebalanceCostAssets" });
  // only write when it moved by more than 10%, to avoid burning gas on noise
  const drift = current === 0n ? 1 : Math.abs(Number(costAssets - current)) / Number(current);
  log(`cost estimate ${usd(costAssets)} (on-chain ${usd(current)})`);
  if (drift > 0.1) {
    const r = await send("setRebalanceCostAssets", [costAssets]);
    if (r?.skipped) log(`  setRebalanceCostAssets skipped: ${r.skipped}`);
  }
}

/** A keeper that cannot pay gas is a keeper that has silently stopped. */
async function checkGasBalance() {
  if (!account) return;
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < MIN_GAS_BALANCE) {
    await alert(
      "gas-balance",
      `keeper balance ${formatEther(balance)} is below ${formatEther(MIN_GAS_BALANCE)} — it will stop acting`,
    );
  } else {
    await resolveAlert("gas-balance", `keeper balance recovered to ${formatEther(balance)}`);
  }
}

async function pokeIfStale() {
  const len = await publicClient.readContract({ ...vault, functionName: "adaptersLength" });
  if (len === 0n) return;
  const adapters = await Promise.all(
    Array.from({ length: Number(len) }, (_, i) =>
      publicClient.readContract({ ...vault, functionName: "adapters", args: [BigInt(i)] })),
  );
  const stats = await Promise.all(
    adapters.map((a) => publicClient.readContract({ ...vault, functionName: "rateStat", args: [a] })),
  );
  const oldest = Math.min(...stats.map(([, , at]) => Number(at)));
  const age = Date.now() / 1000 - oldest;
  if (oldest === 0 || age * 1000 > POKE_INTERVAL_MS) {
    log(`rate sample ${oldest === 0 ? "missing" : `${Math.round(age / 60)}m old`} — poking`);
    const r = await send("pokeRates");
    if (r?.skipped) log(`  pokeRates skipped: ${r.skipped}`);
  }
}

async function tick() {
  const [totalAssets, idle, deployed, paused] = await Promise.all([
    publicClient.readContract({ ...vault, functionName: "totalAssets" }),
    publicClient.readContract({ ...vault, functionName: "idleAssets" }),
    publicClient.readContract({ ...vault, functionName: "deployedAssets" }),
    publicClient.readContract({ ...vault, functionName: "paused" }),
  ]);
  health.vaultState = {
    totalAssets: totalAssets.toString(),
    idleAssets: idle.toString(),
    deployedAssets: deployed.toString(),
    paused,
  };
  log(`TVL ${usd(totalAssets)} · idle ${usd(idle)} · deployed ${usd(deployed)}${paused ? " · PAUSED" : ""}`);

  await checkGasBalance();

  if (paused) {
    // Worth paging: someone paused the vault, or an owner action did it unintentionally.
    await alert("vault-paused", "vault is paused — deposits and deployment are stopped");
    return;
  }
  await resolveAlert("vault-paused", "vault is no longer paused");

  await pokeIfStale();

  if (env.SCORING === "1") {
    const enabled = await publicClient.readContract({ ...vault, functionName: "scoringEnabled" });
    if (enabled) {
      const r = await send("applyScoredWeights");
      if (r?.skipped) log(`  applyScoredWeights skipped: ${r.skipped}`);
    }
  }

  const dep = await send("deploy");
  if (dep?.skipped) log(`  deploy skipped: ${dep.skipped}`);

  await refreshCostEstimate();

  const [ok, dev, moved, net, minNet, readyAt] = await publicClient.readContract({
    ...vault,
    functionName: "previewRebalance",
  });
  log(
    `rebalance: dev ${(Number(dev) / 100).toFixed(2)}% · moves ${usd(moved)} · net ${net < 0n ? "-" : "+"}${usd(
      net < 0n ? -net : net,
    )} vs floor ${minNet < 0n ? "-" : ""}${usd(minNet < 0n ? -minNet : minNet)} · ${
      ok ? "GO" : `hold (ready ${new Date(Number(readyAt) * 1000).toISOString().slice(0, 16)})`
    }`,
  );
  if (ok) {
    const r = await send("rebalance");
    if (r?.skipped) log(`  rebalance skipped: ${r.skipped}`);
  }
}

/**
 * One tick, bounded in time and never allowed to throw. A hung RPC must not take the
 * loop with it — the next interval has to come round regardless.
 */
async function runTick() {
  if (JITTER_MS > 0) await sleep(Math.floor(Math.random() * JITTER_MS));
  health.lastTickAt = new Date().toISOString();
  let timer;
  try {
    await Promise.race([
      tick(),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error(`tick exceeded ${TICK_TIMEOUT_MS}ms`)), TICK_TIMEOUT_MS);
      }),
    ]);
    health.lastOkAt = new Date().toISOString();
    health.lastError = null;
    if (health.consecutiveFailures >= ALERT_AFTER_FAILURES) {
      await resolveAlert("tick-failing", "ticks are succeeding again");
    }
    health.consecutiveFailures = 0;
  } catch (e) {
    health.consecutiveFailures += 1;
    health.lastError = reason(e);
    log(`tick failed (${health.consecutiveFailures}x): ${health.lastError}`);
    if (health.consecutiveFailures >= ALERT_AFTER_FAILURES) {
      await alert("tick-failing", `${health.consecutiveFailures} consecutive tick failures — last: ${health.lastError}`);
    }
  } finally {
    clearTimeout(timer);
    publishHealth();
  }
}

log(
  `keeper ${INSTANCE} on chain ${deployment.chainId} · vault ${deployment.vault} · ${
    DRY_RUN ? "DRY RUN" : account.address
  } · ${RPC_URLS.length} RPC${RPC_URLS.length > 1 ? "s" : ""}`,
);

await runTick();
if (ONCE) {
  // The fallback transport keeps a ranking timer alive, so a single-shot run would otherwise
  // hang after finishing its work. Exit non-zero when that one tick failed, so CI and
  // supervisors can tell the difference.
  process.exit(health.consecutiveFailures > 0 ? 1 : 0);
}

setInterval(() => void runTick(), INTERVAL_MS);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log(`${sig} — stopping`);
    process.exit(0);
  });
}
