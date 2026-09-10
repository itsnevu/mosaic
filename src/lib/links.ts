/**
 * Every outbound link on the site, in one place.
 *
 * The entries marked TODO have no destination yet. They are deliberately
 * centralised so that publishing the real handles is a one-line change here
 * rather than a hunt through the markup.
 */
export const LINKS = {
  // TODO: replace with the real Mosaic handles once the accounts exist.
  x: "https://x.com/",
  telegram: "https://t.me/",
  docs: "/docs",
  blog: "/blog",
  // Live pages in this app:
  app: "/app",
  terms: "/terms",
  privacy: "/privacy",
} as const;

/** Block explorer link for an address, when the active chain publishes one. */
export function explorerAddress(explorerUrl: string | undefined, address: string): string | undefined {
  if (!explorerUrl || explorerUrl.includes("TODO")) return undefined;
  return `${explorerUrl.replace(/\/$/, "")}/address/${address}`;
}
