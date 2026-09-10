import { createConfig, http, createStorage, cookieStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import { supportedChains } from "./chain";

/** One HTTP transport per supported chain, taken from each chain's own rpcUrls. */
const transports = Object.fromEntries(
  supportedChains.map((c) => [c.id, http(c.rpcUrls.default.http[0])]),
);

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
