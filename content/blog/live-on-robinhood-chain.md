---
title: Mosaic Is Live on Robinhood Chain. Here Is Exactly What Your USDG Does.
summary: One deposit, three Morpho vaults, and a share price that only moves when the chain says it moved. No projections, no illustrative numbers.
date: 2026-09-12
---

Mosaic is live on Robinhood Chain mainnet. That sentence is easy to write and most of the time it means very little, so here is the version with the details filled in. The vault takes USDG, the dollar stablecoin that Robinhood Chain runs on. It sends that USDG into three lending vaults that already exist and already hold real money: Steakhouse USDG, Ethena x Steakhouse USDG, and NetNet Credit, all built on Morpho, all on the same chain. Mosaic did not build a lending market. It sits on top of the ones that people are already using, and its whole job is to decide how much goes where.

The split today is forty, thirty five, twenty five. Those are target weights, not promises. When you deposit, the vault keeps five percent of the total as a buffer so that withdrawals do not have to wait on a lending pool, and the rest goes out to the three venues in that ratio. When the rates diverge enough that moving money would earn more than the gas it costs to move it, a keeper rebalances. When they do not, it leaves things alone. Doing nothing is a decision the vault is allowed to make, and most of the time it is the right one.

What you get back is a share. The share is an ERC-4626 token, which is a fancy way of saying any wallet, any explorer, any other contract can read what it is worth without asking Mosaic. Your share price starts at one and rises as the lending vaults pay. There is no claim button, no reward token, no points. If the number went up, you earned. If it did not, you did not, and the page will say so.

That last part is the one we care about most. Every figure on the site is read from the chain at the moment you load the page. TVL is the vault's total assets. The depositor count is a scan of the deposit events. The allocation tape is the adapters reporting what they hold. The APY is measured from how fast the share price actually rose, which means that on day one, before enough time has passed to measure anything, it reads as a dash. We could have printed the venues' advertised rates instead. We did not, because an advertised rate is what somebody hopes to pay and a measured rate is what they paid.

Deposits are capped at two million USDG while the system proves itself. The contracts are verified on the Robinhood Chain explorer, the vault address is printed in the header of every page, and the keeper's every move is an event you can read. If you want to check us, please do. That is the point.
