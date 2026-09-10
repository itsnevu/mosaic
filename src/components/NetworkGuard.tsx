"use client";

import { useConnection, useSwitchChain } from "wagmi";
import { defaultChain, supportedChains } from "@/lib/chain";

type ChainId = (typeof supportedChains)[number]["id"];

export function chainName(id?: number): string {
  if (id === undefined) return "—";
  return supportedChains.find((c) => c.id === id)?.name ?? `Chain ${id}`;
}

/** Ask the wallet to move to `chainId` (adding the network if it does not know it yet). */
export function SwitchChainButton({
  chainId = defaultChain.id,
  className = "btn btn-sm btn-fill",
  label,
}: {
  chainId?: number;
  className?: string;
  label?: string;
}) {
  const { mutate: switchChain, isPending, error } = useSwitchChain();
  return (
    <button
      type="button"
      className={className}
      disabled={isPending}
      title={error ? error.message : undefined}
      onClick={() => switchChain({ chainId: chainId as ChainId })}
    >
      {isPending ? "Check your wallet…" : (label ?? `Switch to ${chainName(chainId)}`)}
    </button>
  );
}

/**
 * Shown when the wallet sits on a chain the app has no deployment for. Reads still work
 * (they go through the app's own RPC); writes would land on the wrong network, so this
 * offers the switch rather than just naming the problem.
 */
export function WrongChainBanner({ appChainId }: { appChainId: number }) {
  const { isConnected, chainId: walletChainId } = useConnection();
  if (!isConnected || walletChainId === undefined || walletChainId === appChainId) return null;

  return (
    <div className="mt-6 border border-ink px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
      <span className="pulse" />
      <p className="label !normal-case !tracking-normal !text-ink flex-1 min-w-[16rem]">
        Wallet is on {chainName(walletChainId)}; Mosaic is deployed on {chainName(appChainId)}. Deposits and
        withdrawals are disabled until you switch.
      </p>
      <SwitchChainButton chainId={appChainId} />
    </div>
  );
}
