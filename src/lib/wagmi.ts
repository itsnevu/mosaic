import { createConfig, http, fallback, createStorage, cookieStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import { supportedChains, productionChain } from "./chain";

/**
 * One transport per chain. Reads on the production chain go through the
 * same-origin relay at /api/rpc (see src/app/api/rpc/route.ts): the public RPC
 * ignores many residential IPs, and the relay also shares one upstream answer
 * between visitors. The public RPC stays as the fallback. JSON-RPC batching is
 * on so a refetch tick is one request, not one per hook. Wallet writes never
 * touch this: the injected provider sends its own transactions.
 */
function transportFor(c: (typeof supportedChains)[number]) {
  const upstream = c.rpcUrls.default.http[0];
  const isProd = productionChain && c.id === productionChain.id;
  if (!isProd || typeof window === "undefined") return http(upstream, { batch: true });
  return fallback([
    http(`${window.location.origin}/api/rpc`, { batch: true, timeout: 15_000 }),
    http(upstream, { batch: true }),
  ]);
}

const transports = Object.fromEntries(supportedChains.map((c) => [c.id, transportFor(c)]));

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected()],
  transports,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
