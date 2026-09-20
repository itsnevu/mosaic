---
title: Changelog
summary: What changed, when, and where to check it. Newest first. Every entry names the code or the contract call that makes it true.
date: 2026-09-20
---

## 2026-09-20 — What your position earned, the share price since launch, and the exit route

Three additions to the app, all read from the chain, none from a database.

**Earned, on your position.** The dashboard now shows what a wallet's position has earned: its value
today, plus everything it withdrew, minus everything it deposited. The two ledgers come from the
wallet's own `Deposit` and `Withdraw` events on the vault. Nothing was ever claimed to receive it;
nothing needs to be claimed to see it. When the arithmetic would be wrong — shares that reached or
left the wallet by plain transfer, or were minted to it as fee — the figure is withheld and the
reason is printed instead of a number.

**Share price since launch.** One line, drawn only from points the chain has: the launch block at
exactly 1.0000, every fee accrual (which writes the post-fee price), and every deposit and
redemption (which fixes the price at that block as assets over shares). No sampling, no
smoothing, no projection. The caption says how many events the line is drawn from.

**Exit route, before you sign.** Type a redemption and the withdraw panel walks it the way the
contract's `_withdraw` does: the idle buffer first, then each venue in registry order for what it
reports free, and a shortfall if anything is still owed at the end. A redemption that would not
clear is shown as such, and the button will not send it.

**Under both.** A new log scanner asks the provider for the whole history in one request and
shrinks its span only if the provider refuses, remembering the span that worked. It replaces the
fixed backwards walk for questions that need every block since launch: the History table on the
dashboard, which on a chain producing several blocks a second could only see the last hour, now
shows every move since the launch block, and the depositor count on the landing page uses it
too. Each scan reports whether it reached the launch block, and the page says so when it did not.
The relay keeps answers about closed history — logs and blocks at least 128 blocks behind the
head — for an hour, so the first visitor reads the history from the chain and the next ones read
the same immutable answer from memory. Still no index and no database.

**Fixed.** The relay used to keep a `null` answer for two seconds like any other. A wallet
polling for its own receipt could then see a mined transaction with no receipt and report the
deposit as failed although it had succeeded. A null is "not yet", not a fact; it is no longer
kept.

**Corrected.** The landing page said larger withdrawals unwind "cheapest exit first" and that
"anyone can trigger" a rebalance. The contract walks adapters in registry order, and `deploy()`
and `rebalance()` are keeper-only. The copy now says what the code does.

Where to check: `src/lib/logs.ts`, `src/lib/events.ts` (`useUserLedger`, `useSharePriceHistory`),
`src/lib/hooks.ts` (`useExitRoute`), `src/components/SharePriceChart.tsx`.

## 2026-09-20 — Chain reads through a same-origin relay

The public Robinhood Chain RPC ignores many residential IPs outright, so visitors saw dashes for
every number. Browser reads now post to `/api/rpc`, which forwards an allowlist of read methods
upstream, shares one answer between callers for two seconds, and stores nothing else. Multicall3
is registered for the production chain, so a refetch is one request rather than forty. Still true:
every number is read from the chain. No longer exactly true: "no server between you and the
chain" — there is one hop, and its source is `src/app/api/rpc/route.ts`.

## 2026-09-11 — Live on Robinhood Chain

Vault `0xFB204767caB0C41F6fa6C4f903B0509fF6D35A6f` on Robinhood Chain (4663), deployed at block
60488484 (19:02 UTC by the block's own clock; the deployment record reached the repository on
2026-09-18). Three venues, all Morpho vaults on the same chain: Steakhouse USDG, Ethena x Steakhouse
USDG, NetNet Credit, at target weights 40 / 35 / 25. Deposit cap 2,000,000 USDG. Hero motion,
ten key visuals and the launch posts shipped alongside.

## 2026-09-10 — The vault, the keeper, the dashboard and the site

`MosaicVault.sol`: ERC-4626 over USDG, adapter registry, idle buffer, batched `deploy()`, gated
`rebalance()`, performance fee on yield above a high-water mark, deposit cap, pause that never
blocks withdrawals. Sixty-three tests including seven invariants. A keeper that simulates every
call before sending it, with failover and alerts. The landing page, the app, docs, whitepaper and
the first two blog posts.
