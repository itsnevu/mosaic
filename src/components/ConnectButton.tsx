"use client";

import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";

export type ConnectButtonProps = {
  className?: string;
  /** Label shown when disconnected. Default "Connect wallet". */
  label?: string;
};

export function truncateAddress(addr: string, head = 6, tail = 4) {
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/**
 * Connect / disconnect via the injected (browser) wallet.
 * Disconnected: one button with `label`. Connected: truncated address + disconnect.
 */
export default function ConnectButton({ className = "btn btn-sm btn-fill", label = "Connect wallet" }: ConnectButtonProps) {
  const { address, isConnected, isConnecting, isReconnecting } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending, error } = useConnect();
  const { mutate: disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono text-[11px] tracking-[0.08em] text-ink" title={address}>
          {truncateAddress(address)}
        </span>
        <button type="button" className="btn btn-sm" onClick={() => disconnect()}>
          Disconnect
        </button>
      </span>
    );
  }

  const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];
  const busy = isPending || isConnecting || isReconnecting;

  return (
    <button
      type="button"
      className={className}
      disabled={busy || !injected}
      title={error ? error.message : undefined}
      onClick={() => injected && connect({ connector: injected })}
    >
      {busy ? "Connecting…" : label}
    </button>
  );
}
