/**
 * Every outbound link on the site, in one place.
 *
 * The entries marked TODO have no destination yet. They are deliberately
 * centralised so that publishing the real handles is a one-line change here
 * rather than a hunt through the markup.
 */
export const LINKS = {
  x: "https://x.com/mosaic_capital",
  // TODO: no Telegram yet; the footer hides the icon while this is empty.
  telegram: "",
  docs: "/docs",
  blog: "/blog",
  whitepaper: "/whitepaper",
  // TODO: replace with the real support address once the mailbox exists. Kept here rather
  // than inline in the legal pages so publishing it is one line, and so an address nobody
  // reads is never quietly presented as a support channel.
  support: "",
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
