"use client";

import { useChainId } from "wagmi";
import { supportedChains, explorerAddressUrl } from "@/lib/chain";
import { getDeployment } from "@/lib/contracts";

/**
 * The deployed vault address for the active chain, linked to the explorer when the chain
 * publishes one. Renders a dash rather than a placeholder when there is no deployment —
 * an address is the one thing on this page nobody should ever see a stand-in for.
 */
export default function VaultAddress({ className = "" }: { className?: string }) {
  const chainId = useChainId();
  const vault = getDeployment(chainId)?.vault;
  if (!vault) return <span className={className}>—</span>;

  const short = `${vault.slice(0, 6)}…${vault.slice(-4)}`;
  const url = explorerAddressUrl(
    supportedChains.find((c) => c.id === chainId),
    vault,
  );
  if (!url) return <span className={className} title={vault}>{short}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={vault} className={`${className} hover:underline`}>
      {short}
    </a>
  );
}
