import { defineChain, type Chain } from "viem";

/** Local Anvil dev chain. `npm run chain` starts it, `npm run deploy:local` deploys to it. */
export const anvil = defineChain({
  id: 31337,
  name: "Anvil (local)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

/*
 * The production chain is configured, not hard-coded: Robinhood Chain's id, RPC and explorer
 * are read from NEXT_PUBLIC_* at build time (see .env.example). Each reference below is a
 * literal `process.env.NEXT_PUBLIC_…` because Next only inlines those; a computed lookup
 * would come back undefined in the browser. Nothing is registered until an id and RPC exist,
 * so an unconfigured build simply runs against Anvil.
 */
const ENV = {
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  chainName: process.env.NEXT_PUBLIC_CHAIN_NAME,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL,
  currencySymbol: process.env.NEXT_PUBLIC_NATIVE_SYMBOL,
} as const;

function buildProductionChain(): Chain | undefined {
  const id = Number(ENV.chainId);
  if (!Number.isInteger(id) || id <= 0 || !ENV.rpcUrl) return undefined;
  const symbol = ENV.currencySymbol || "ETH";
  return defineChain({
    id,
    name: ENV.chainName || "Robinhood Chain",
    nativeCurrency: { name: symbol, symbol, decimals: 18 },
    rpcUrls: { default: { http: [ENV.rpcUrl] } },
    // Multicall3 sits at its canonical address on Robinhood Chain (the LIQUOR indexer reads
    // through it). With it registered, a useReadContracts of ten views is one eth_call.
    contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
    ...(ENV.explorerUrl ? { blockExplorers: { default: { name: "Explorer", url: ENV.explorerUrl } } } : {}),
  });
}

/** Robinhood Chain, or undefined until NEXT_PUBLIC_CHAIN_ID / NEXT_PUBLIC_RPC_URL are set. */
export const productionChain = buildProductionChain();

/** Chains offered to wagmi. Production first when configured, so it is the default. */
export const supportedChains = (productionChain ? [productionChain, anvil] : [anvil]) as unknown as readonly [
  Chain,
  ...Chain[],
];

/** The chain the app should read from and ask wallets to switch to. */
export const defaultChain: Chain = productionChain ?? anvil;

export function explorerTxUrl(chain: Chain | undefined, hash: string): string | undefined {
  const base = chain?.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : undefined;
}

export function explorerAddressUrl(chain: Chain | undefined, address: string): string | undefined {
  const base = chain?.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, "")}/address/${address}` : undefined;
}
