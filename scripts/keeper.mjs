#!/usr/bin/env node
// Mosaic keeper: keeps rate history warm, deploys idle capital above the buffer, and
// rebalances when the vault's own preview says it is worth doing.
//
//   RPC_URL=... KEEPER_PRIVATE_KEY=0x... node scripts/keeper.mjs
//
// Env:
//   RPC_URL                 required
//   KEEPER_PRIVATE_KEY      required unless DRY_RUN=1
//   DEPLOYMENT              path to a deployments json (default: contracts/deployments/local.json)
//   INTERVAL_MS             poll interval (default 60000)
//   POKE_INTERVAL_MS        max age of a rate sample before poking (default 3600000)
//   NATIVE_USD              native token price in USD, for pricing gas into USDG (default 0)
//   COST_MARGIN             multiplier applied to the gas estimate (default 1.5)
//   SCORING=1               also push scored target weights when the vault allows it
//   DRY_RUN=1               simulate everything, send nothing
//   ONCE=1                  run a single tick and exit
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
const DRY_RUN = env.DRY_RUN === "1";
const ONCE = env.ONCE === "1";
const INTERVAL_MS = Number(env.INTERVAL_MS ?? 60_000);
const POKE_INTERVAL_MS = Number(env.POKE_INTERVAL_MS ?? 3_600_000);
const COST_MARGIN = Number(env.COST_MARGIN ?? 1.5);
const NATIVE_USD = Number(env.NATIVE_USD ?? 0);
const USDG_DECIMALS = 6;

const RPC_URL = env.RPC_URL;
if (!RPC_URL) fail("RPC_URL is required");
if (!DRY_RUN && !env.KEEPER_PRIVATE_KEY) fail("KEEPER_PRIVATE_KEY is required (or set DRY_RUN=1)");

const deployment = JSON.parse(
  readFileSync(resolve(root, env.DEPLOYMENT ?? "contracts/deployments/local.json"), "utf8"),
);
const { abi } = JSON.parse(readFileSync(join(root, "contracts/out/MosaicVault.sol/MosaicVault.json"), "utf8"));

function fail(msg) {
  console.error(`keeper: ${msg}`);
  process.exit(1);
}
const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);
const usd = (v) => `$${Number(formatUnits(v, USDG_DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const chain = defineChain({
  id: deployment.chainId,
  name: deployment.name ?? `chain-${deployment.chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
const account = env.KEEPER_PRIVATE_KEY ? privateKeyToAccount(env.KEEPER_PRIVATE_KEY) : undefined;
const walletClient = account ? createWalletClient({ account, chain, transport: http(RPC_URL) }) : undefined;
const vault = { address: deployment.vault, abi };

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
  const nativeCost = Number(formatUnits(gas * price, 18));
  const costAssets = parseUnits((nativeCost * NATIVE_USD * COST_MARGIN).toFixed(USDG_DECIMALS), USDG_DECIMALS);
  const current = await publicClient.readContract({ ...vault, functionName: "rebalanceCostAssets" });
  // only write when it moved by more than 10%, to avoid burning gas on noise
  const drift = current === 0n ? 1 : Math.abs(Number(costAssets - current)) / Number(current);
  log(`cost estimate ${usd(costAssets)} (on-chain ${usd(current)})`);
  if (drift > 0.1) await send("setRebalanceCostAssets", [costAssets]);
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
  log(`TVL ${usd(totalAssets)} · idle ${usd(idle)} · deployed ${usd(deployed)}${paused ? " · PAUSED" : ""}`);
  if (paused) return;

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

log(`keeper on chain ${deployment.chainId} · vault ${deployment.vault} · ${DRY_RUN ? "DRY RUN" : account.address}`);
await tick().catch((e) => log(`tick failed: ${reason(e)}`));
if (!ONCE) {
  setInterval(() => void tick().catch((e) => log(`tick failed: ${reason(e)}`)), INTERVAL_MS);
}
