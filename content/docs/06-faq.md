---
title: FAQ
summary: Short answers to the questions that come up most.
order: 6
---

## About the product

**What is Mosaic in one sentence?**
An ERC-4626 vault that turns one USDG deposit into a diversified lending position, rebalanced only
when moving is worth the gas.

**How do I earn?**
Your shares become worth more USDG. There is no claim button, no reward token, and no separate
harvest step.

**What APY should I expect?**
Whatever the venues pay, weighted by allocation, net of the ten percent performance fee. The
dashboard shows the vault's live blended rate. Anyone quoting a fixed number for a product that
supplies to floating-rate lending markets is quoting a marketing figure.

**Why not just put everything in the highest-paying pool?**
Two reasons. A headline rate says nothing about surviving your arrival — supplying capital lowers
utilization, which lowers the rate you actually receive. And concentration turns a single venue's
bad day into a total loss. Splitting keeps each position on a steeper part of its own yield curve,
so diversification here raises expected return rather than costing it.

## Deposits and withdrawals

**Why does depositing take two transactions?**
The first approves the vault to move your USDG; the second deposits. Subsequent deposits within the
approved amount need only one.

**Why is my deposit not earning immediately?**
It waits in the idle buffer until the next batch deploys. Batching is what makes entry gas cheap for
small deposits. The wait is usually short.

**Can a withdrawal fail?**
Yes, if you ask for more than the vault can pay right now — lending venues can be temporarily
illiquid. It fails cleanly: the transaction reverts and your shares are untouched. The app shows the
available figure before you type an amount, so this should not surprise you.

**Why is available capacity lower than TVL?**
Because capacity counts only cash the venues could hand over right now. Balances lent out to
borrowers are excluded until a borrower repays.

**Is there a lock-up or withdrawal fee?**
No, and no.

## Fees

**How much and on what?**
Ten percent, on yield only, capped in code at thirty percent.

**What is a high-water mark?**
The highest share price the vault has reached. Fees only apply above it, so after a drawdown you are
not charged again until the previous peak is passed. The same gain is never charged twice.

**Can the fee touch my principal?**
No. The mark only ever ratchets upward, including in the edge case where the fee rounds to zero
shares — a case fuzzing caught and the code now handles explicitly.

**Do I pay for gains that happened before I deposited?**
No. Fees accrue before every deposit, so you buy in at a price that already reflects them.

## Risk

**What are the actual risks?**
A venue could fail; the vault's own contracts are a target; the allocation model could misjudge; the
keeper could stall or be compromised. Each is bounded by something in the contract — weight
ceilings, a small unchanging core, cooldowns and profitability gates, and a keeper whose authority
is timing rather than direction. [Security](/docs/security) covers all of it.

**Has it been audited?**
Not yet, and that is stated plainly rather than buried. The contracts carry sixty-three tests across
unit, fuzz and invariant suites, and the engineering notes are maintained as the package an auditor
starts from. An audit is a prerequisite for mainnet, not a nice-to-have.

**Can the team rug?**
The owner can pause deposits, change parameters within coded bounds, and pull capital from a venue
back to the idle buffer. Withdrawals stay open while paused. The owner cannot transfer depositor
assets out. Adapters are the real trust surface: a malicious adapter could steal what was deployed
to it, which is why registration is owner-only and why no venue may exceed forty percent.

**What happens if the keeper stops?**
Yield degrades — capital sits idle and weights drift — but nothing is lost, and you can still
withdraw. Withdrawals never depend on the keeper.

## Technical

**Is `mUSDG` transferable?**
Yes. It is a standard ERC-20 and ERC-4626 share, twelve decimals.

**Why twelve decimals?**
Six from USDG plus a six-decimal offset. It keeps round-trip rounding loss around one wei and makes
the classic ERC-4626 inflation attack uneconomic.

**Does share price only go up?**
Almost. Venues round a supplier's burn up, so unwinding one to serve a withdrawal costs up to a wei
per venue touched. It is dust, it is bounded, and it is measured in the invariant suite rather than
glossed over.

**Can other protocols use my position as collateral?**
That is the intent of using a standard share token, and it is on the roadmap rather than live today.

**Where is the code?**
The contracts, the keeper and this site live in one repository. The [whitepaper](/whitepaper) has
the full technical treatment.
