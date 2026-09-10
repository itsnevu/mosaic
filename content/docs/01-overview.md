---
title: Overview
summary: What Mosaic is, what it does with a deposit, and what it deliberately does not do.
order: 1
---

Mosaic Capital is a vault for USDG. You deposit once; the protocol spreads that deposit across
several lending venues, keeps it there at sensible weights, and moves it only when moving is worth
the gas. Yield shows up as your shares becoming worth more USDG. There is nothing to claim, nothing
to monitor, and no reward token.

## What a deposit actually does

1. **You deposit USDG** and receive `mUSDG` shares priced at the current share price.
2. **Your deposit waits in the idle buffer** — six percent of the vault is kept liquid — until the
   next batch. Batching means the gas cost of entering a venue is shared, so a small deposit gets a
   large deposit's economics.
3. **A keeper deploys the batch** across the registered venues, pro-rata to target weights.
4. **Interest accrues** at each venue and raises the vault's total assets, which raises the price of
   your shares. You hold the same number of shares in month six as on day one.
5. **You withdraw** whenever you like. Ordinary withdrawals come straight out of the buffer without
   unwinding anything.

## What makes it different

**Allocation is priced, not guessed.** Each venue is scored on-chain from its rate, its free
liquidity, its utilization and how much its rate has been swinging. A venue paying well but lent out
to the last dollar scores below a steadier one paying slightly less.

**Moving costs are a first-class term.** A rebalance only fires when the expected yield change over
a thirty-day horizon justifies the gas, within a bounded allowance for moves made on risk grounds
rather than yield grounds. Overtrading is how sophisticated strategies underperform lazy ones.

**Limits are in the contract, not the marketing.** No venue may exceed forty percent of the vault.
The performance fee is charged on yield only, against a high-water mark, and cannot touch principal.
A keeper can decide *when* the vault acts but never *where* the money goes.

**The vault tells you what it can actually pay.** Withdrawal capacity counts only cash the venues
can hand over right now; balances lent out to borrowers are excluded. You see that number before you
type an amount.

## What it does not do

- It does not promise a rate. Yield is whatever the venues pay, net of fees.
- It does not chase the single highest headline rate. Concentration turns a survivable event into a
  total loss, and supplying into a pool lowers the very rate that attracted you.
- It does not custody your position off-chain. `mUSDG` is a standard ERC-4626 share; any wallet or
  protocol can read it.
- It does not have an emergency it can solve by taking your funds. The owner can pause deposits and
  pull capital back to the buffer; withdrawals stay open the whole time.

## Where to go next

- [How it works](/docs/how-it-works) — the mechanism in detail: buffer, allocation, rebalancing, fees.
- [Depositing and withdrawing](/docs/depositing) — what to expect as a depositor.
- [Contracts and parameters](/docs/contracts) — the interface, every parameter and its bound.
- [Running a keeper](/docs/keeper) — for operators.
- [Security](/docs/security) — trust model, invariants, known gaps.
- [Whitepaper](/whitepaper) — the full technical treatment.
