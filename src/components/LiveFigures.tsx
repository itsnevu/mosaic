"use client";

import { useBlendedApy, useVaultStats } from "@/lib/hooks";

/**
 * The vault's blended rate as a bare number, for the places the "%" sits in its own element.
 * Shows a dash when no chain has answered — these figures are labelled as published numbers,
 * so a stand-in would be a claim rather than a placeholder.
 */
export function BlendedApyFigure({ className = "" }: { className?: string }) {
  const apy = useBlendedApy();
  return <span className={className}>{apy === undefined ? "—" : (apy * 100).toFixed(2)}</span>;
}

/** "USDG → N pools", with N read from the registry. */
export function PoolCountLabel({ className = "" }: { className?: string }) {
  const { poolCount, hasDeployment, isLoaded, isError } = useVaultStats();
  const live = hasDeployment && isLoaded && !isError && poolCount !== undefined;
  return (
    <span className={className}>
      USDG → {live ? poolCount : "—"} {live && poolCount === 1 ? "pool" : "pools"}
    </span>
  );
}
