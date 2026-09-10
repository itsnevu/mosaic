---
title: Mosaic Capital — Protocol Whitepaper
summary: How a single USDG deposit becomes a diversified lending position, and what in the contract makes that claim enforceable rather than aspirational.
date: 2026-09-10
---

## Abstract

Stablecoin lending yield is abundant and badly distributed. It sits across many pools at rates
that move constantly, and capturing it demands attention that most depositors cannot spend. The
result is that ordinary capital parks in one venue and stays there, earning the bottom of a market
whose top is public information.

Mosaic Capital is an ERC-4626 vault over USDG that turns one deposit into a position across many
lending venues. Capital is allocated by a score computed on-chain from each venue's rate,
free liquidity, utilization and rate volatility, subject to a hard per-venue ceiling. It is moved
in batches so gas is shared, kept partly in an idle buffer so ordinary withdrawals never unwind a
position, and rebalanced only when the expected yield change over a realistic horizon justifies
the cost of moving. Yield accrues as the price per share rising; there is no claim button and no
reward token.

This document describes the mechanism as implemented. Every parameter, formula and guarantee below
corresponds to code in `MosaicVault.sol`, and the constraints are stated as what the contract
enforces rather than what the operator intends.

## 1. The problem

### Yield is fragmented, and the fragments move

A lending pool's supply rate is a function of utilization: the fraction of supplied capital that
borrowers have taken out. Utilization moves with borrower demand and with supplier behaviour, so a
headline rate is a snapshot, not a property. A pool paying twelve percent this week pays four the
next because capital arrived, and nobody is notified.

Watching a dozen such pools, comparing them on risk as well as rate, and moving between them is a
job. Doing it across five positions instead of one — which is what prudence actually requires — is
five times that job and five times the gas.

### Your own deposit lowers your rate

This is the part that makes naive optimization fail. Supplying capital increases the supply side,
which lowers utilization, which lowers the rate. A pool advertising twelve percent on two million
of liquidity does not still pay twelve percent after another million arrives.

The consequence is that the rate worth optimizing is the one the vault will receive *after* its
allocation exists, not the one on the screen before. Because yield curves flatten as capital pushes
into them, splitting a deposit across several venues leaves each position on a steeper part of its
own curve. Diversification here raises the expected return; it is not the price paid for safety.

### Rebalancing costs more than it looks

Knowing the better allocation is not the same as reaching it. Every move costs gas and carries
execution risk, so a vault that reshuffles on every rate twitch destroys more value than it
captures. This is how sophisticated strategies underperform lazy ones. Any honest design has to
treat the cost of moving as a first-class term, not an afterthought.

## 2. Design overview

Mosaic is deliberately small at the centre and extensible at the edge.

```
                    depositor
                        │  USDG
                        ▼
              ┌──────────────────────┐
              │     MosaicVault      │   ERC-4626, mUSDG shares
              │  ────────────────    │
              │  idle buffer (6%)    │──► ordinary withdrawals, instantly
              │  registry + weights  │
              │  scoring · planning  │
              │  fee (high-water)    │
              └──────────┬───────────┘
                         │ four verbs
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   IPoolAdapter     IPoolAdapter     IPoolAdapter
        │                │                │
     venue A          venue B          venue C
```

The vault holds the accounting, the weights, the buffer and the fee. It knows nothing about any
particular lending market. Each venue is reached through an adapter that translates it into a
small, fixed vocabulary, so adding a venue never means changing the vault.

A **keeper** — a permissioned hot key — decides *when* the vault acts. It can never decide *where*
capital goes beyond the registered adapters, nor exceed the weight ceilings, nor bypass the
cooldown. Its authority is timing, not direction.

## 3. Vault accounting

### Shares and price per share

The vault implements ERC-4626 over USDG. Depositors receive `mUSDG` shares; yield appears as those
shares becoming worth more USDG, never as a separate token to harvest. Any wallet or protocol that
understands ERC-4626 can read a position without custom code.

Shares carry **twelve decimals** — the asset's six plus a six-decimal offset. Two things follow.
Round-trip rounding loss is bounded at roughly one wei of USDG, and the classic ERC-4626 inflation
attack, where a first depositor donates assets to skew the share price against the second, becomes
uneconomic: the attacker must fund a million-fold larger donation than the value at stake.

Price per share is reported 1e18-scaled, starting at exactly `1e18`:

```
pricePerShare = totalAssets × 1e18 × 1e6 / totalSupply
```

### What the vault counts

```
totalAssets = idleAssets + Σ adapter.totalAssets()
```

`idleAssets` is the USDG the vault holds directly. Each adapter reports principal plus accrued
interest at the venue. This identity is asserted as an invariant across 128 000 randomized calls;
nothing is held anywhere the accounting does not see.

## 4. Adapters

Every venue is reduced to seven functions:

| Function | Meaning |
| --- | --- |
| `deposit(assets)` | pull from the vault and supply to the venue |
| `withdraw(assets)` | redeem up to `assets`, return what was actually received |
| `totalAssets()` | principal plus accrued interest currently held |
| `currentRateBps()` | annualized supply rate, in basis points |
| `asset()` | the underlying, checked against the vault's on registration |
| `availableLiquidity()` | what could actually be withdrawn right now |
| `maxDeposit()` | room left to supply |
| `utilizationBps()` | borrowed over supplied, where the venue has the concept |

The last three exist so that liquidity and risk are priced **on-chain** rather than assumed.
Without them the vault would have to treat every balance as instantly redeemable, which is exactly
the assumption that breaks during stress.

### What is trusted, and what is not

An adapter is trusted code: a malicious one can steal what was deployed to it. That is why
registration is owner-only and why a per-adapter ceiling — forty percent by default — bounds the
blast radius of any single venue failing.

What the vault does **not** trust is the numbers an adapter reports. Rates are clamped to
`MAX_RATE_BPS` (1000% APY) before touching any arithmetic, so a buggy or hostile adapter cannot
overflow the planning math or the rate statistics. Liquidity claims can only ever *shrink* what
the vault attempts, never expand it. Every deposit path re-checks the vault's own caps rather than
relying on the adapter's.

## 5. Allocation

### The score

Each adapter is scored on four terms, all in basis points:

```
score = rate × liquidity × (1 − utilization/2) × (1 − min(0.5, deviation/rate))
```

- **rate** — the smoothed supply rate, not the spot rate (see below).
- **liquidity** — free cash over held balance. A venue that cannot pay out scores nothing.
- **utilization** — high utilization means high rates *and* thin exit liquidity, so it discounts
  rather than disqualifies: at full utilization the score is halved, never zeroed.
- **volatility** — the smoothed mean absolute deviation of the rate, relative to the rate itself.
  A pool that swings between one and thirteen percent scores below a steady one paying seven,
  capped at a halving so volatility can never dominate the other terms.

The four factors are multiplied without dividing back down. Only ratios between scores matter, and
dividing at each step would floor a low-rate venue's score to zero and silently drop it from the
book — a defect found by fuzzing rather than by reading, and now covered by a test.

A zero score is therefore meaningful: no rate, no free cash, or no ceiling. Such an adapter is not
funded, and its ceiling does not count toward the book's capacity.

### Rate statistics

Spot rates are noisy, and planning on them invites churn. The vault samples each adapter's rate
into an exponential moving average, weighting a new sample at twenty percent, and tracks the mean
absolute deviation alongside it. Sampling happens on every deploy and rebalance, and keepers can
call `pokeRates()` on its own to build history.

Planning uses the smoothed rate. A pool that spikes for one block does not attract the book.

### From scores to weights

Scores are normalized to ten thousand basis points, then capped: any adapter whose proportional
share exceeds its ceiling is fixed at the ceiling and the remainder redistributed among those with
room. The pass repeats until it converges, which it must within one pass per adapter.

Integer division leaves a few basis points unassigned. That dust goes only to adapters that were
actually scored, never past a ceiling, and if it cannot be placed the computation reverts rather
than fudging the total. The weights that come out sum to exactly ten thousand or the call fails —
verified by fuzzing five adapters against random rates and random ceilings.

When the scored adapters' ceilings cannot cover the whole book, the vault reverts rather than
overweighting what is left. The existing targets stay in force and the keeper logs a skip. Refusing
to produce a book is the correct answer to being unable to produce a safe one.

Scoring is **opt-in**. Until the owner enables it, target weights are set by the owner directly.
When enabled, a keeper may adopt the scored weights — but never past the ceilings, so the worst a
compromised keeper achieves is a legal reallocation inside limits the owner already approved.

## 6. Deployment and the idle buffer

Deposits do not move on-chain individually. They accumulate in an idle buffer and deploy in
batches, so the gas cost of entering a venue is shared across everyone in that batch rather than
shouldered alone. A small depositor gets a large depositor's economics.

The buffer targets six percent of total assets. `deploy()` pushes only the excess above that
target, distributed pro-rata to the target weights and clamped by each adapter's ceiling and its
own reported room.

The buffer's second job is withdrawals. Ordinary redemptions are served straight from it — no
venue is touched, no interest position is unwound, and the depositor pays nothing for the exit.

## 7. Rebalancing

A rebalance must clear four gates. Any one of them failing means the vault does nothing, which is
the correct default.

### Drift

The peak deviation between an adapter's current weight and its target must exceed the threshold,
fifty basis points by default. Smaller drift is allowed to sit; correcting it costs more than it
is worth.

### Cooldown

At least twenty-four hours must have passed since the last rebalance. This stops the vault
oscillating between two venues that keep trading places.

### Economics

This is the gate most vaults omit. Before touching any state, the vault builds a plan: what it
would pull from each over-weight adapter, what it would push to each under-weight one, and what
that does to expected yield over a thirty-day horizon.

```
expectedGain = Σ(push × rate_destination) − Σ(pull × rate_source), over the horizon
net          = expectedGain − assumedGasCost
floor        = −(assetsMoved × maxRebalanceDrag)
require net ≥ floor
```

Restoring target weights is a risk decision, not only a yield decision, so the vault does not
demand that every rebalance be yield-positive. It gives the move a budget: by default it may give
up half a percent of the value it moves, measured over the horizon. Anything worse must pay for
itself against the assumed gas cost. Setting the drag allowance to zero makes the rule strict —
every rebalance must be profitable net of gas.

The gas cost is quoted by the keeper from a real gas oracle, priced into USDG. Because that is a
hot key writing a number the profitability gate depends on, it is bounded: the owner sets a
ceiling, and a quote above it is rejected. A compromised keeper cannot price rebalancing out of
existence.

`previewRebalance()` exposes the whole calculation as a view — the drift, the assets moved, the net
expected change, the floor it must clear, and when the cooldown lifts. The dashboard and the keeper
read the same numbers the contract will act on.

### Execution

The plan never asks a venue for more than its free cash, so a shortfall means something genuinely
went wrong rather than something already known. Each unwind must land within ten basis points of
what was requested or the whole transaction reverts. Total assets before and after are compared
against the same bound, so the round trip cannot leak value even if the individual legs look fine.
Anything that could not be placed stays in the idle buffer, where it is still the depositors'.

## 8. Withdrawals and liquidity

Withdrawals are served from the buffer first. When the buffer is short, adapters are unwound in
registry order until the amount is covered.

There are no partial fills. A withdrawal either completes in full or reverts with the depositor's
shares untouched. To make that predictable rather than surprising, the vault reports the truth up
front: `withdrawalCapacity()` sums the buffer and, per adapter, only what the venue could actually
pay right now. Balances lent out to borrowers are excluded. `maxWithdraw` and `maxRedeem` are
bounded by that figure, so a wallet asking the standard ERC-4626 question gets an answer that
holds, and the dashboard tells a depositor what is available before they type an amount.

This is a promise the vault can keep, and it is asserted as an invariant: capacity never exceeds
what the vault holds, and an adapter never claims more available than it has.

## 9. Fees

The performance fee is ten percent, charged on yield only, capped in code at thirty percent.

It is tracked against a **high-water mark on price per share**. If the vault does not earn, no fee
applies. After a drawdown, no fee applies again until the previous peak is passed, so nobody is
charged twice for the same gain. The fee is never charged on principal, and that is enforced
rather than promised: the mark is monotonically non-decreasing, including in the edge case where
the fee rounds to zero shares — an early fuzz run found that a naive implementation could
re-charge that rounding-away gain later, which is a fee on principal by another name.

The fee is minted as shares to the fee recipient, not withdrawn as assets. It therefore dilutes
the price per share rather than removing assets from the vault, which is why the vault's asset
conservation invariant is stated on assets and not on share price.

Fees are accrued before every deposit, mint, withdraw and redeem, so a new depositor never buys
into an unaccrued gain and never pays for one they did not receive.

## 10. Failure modes

Anything describing a yield product without naming how it breaks is describing a brochure.

**A venue could fail.** Money supplied to a lending pool is exposed to that pool. This is why
allocation is spread and capped rather than concentrated, why no venue may exceed forty percent,
and why an adapter can be disabled individually without touching the rest.

**The vault's own contracts are a target.** The core is deliberately small and does not change;
complexity lives in adapters, which can be audited alone and removed alone. The owner can pause
deposits and deployment while leaving withdrawals open, and can pull any single adapter back to
idle in one call.

**The allocation model could misjudge.** Weight ceilings, the cooldown and the profitability gate
exist so that a wrong decision is survivable rather than catastrophic. The model cannot concentrate
the book, cannot churn it, and cannot spend more than the drag allowance to act on a bad reading.

**The keeper could fail or be compromised.** A stalled keeper degrades yield — capital sits idle,
weights drift — but cannot lose funds, and withdrawals never depend on it. A compromised keeper is
bounded by everything above: registered adapters only, ceilings enforced, cooldown enforced, gas
quote capped.

**Venue rounding costs dust.** Pools round a supplier's burn up, so unwinding one to serve a
withdrawal costs up to a wei per adapter touched. Share price is therefore not strictly monotonic.
This is stated plainly rather than papered over: it is bounded, it is measured in the invariant
suite, and grinding it would cost orders of magnitude more gas than it could ever extract.

## 11. Parameters

Every value below is owner-settable within the bounds shown, and every change emits an event.

| Parameter | Default | Bound |
| --- | --- | --- |
| Max weight per adapter | 40% | ≤ 100%, per adapter |
| Idle buffer target | 6% | ≤ 100% |
| Rebalance threshold | 0.5% | ≤ 100% |
| Rebalance cooldown | 24h | — |
| Rebalance yield horizon | 30 days | — |
| Max yield drag per rebalance | 0.5% of assets moved | ≤ 100% |
| Slippage bound | 0.1% | ≤ 100% |
| Assumed gas cost | 0 | keeper-quoted, ≤ owner ceiling |
| Performance fee | 10% of yield | ≤ 30%, hard-capped in code |
| Deposit cap | 2 000 000 USDG | — |
| Rate clamp | 1000% APY | constant |
| Rate EMA weight | 20% per sample | 0 < α ≤ 100% |
| On-chain scoring | off | owner-enabled |

## 12. Verification

The contracts carry sixty-three tests across three suites: unit tests for every path, property
fuzzing over deposit/withdraw round trips and the scoring engine, and seven invariants driven by a
handler that runs three depositors, a keeper, moving rates, borrowers draining pools and time
passing — 128 000 calls per invariant.

The invariants assert that the ledger always adds up, that the high-water mark never falls, that
capacity never exceeds assets, that shares are always fully backed, that assets leave only through
withdrawals apart from bounded venue dust, and that principal is never underwater.

Fuzzing has already earned its place. It found three defects that reading did not: a fee that could
touch principal when it rounded to zero, rounding dust that could fund an adapter the scorer had
rejected, and the score truncation described in section 5. All three are fixed and covered.

None of this is a substitute for an audit, which has not yet happened. The engineering notes,
trust model, invariant list and deployment checklist are maintained as the package an auditor
starts from.

## 13. What comes next

The USDG vault is the first fragment. Depth comes first — more adapters so the field widens, and
allocation logic tuned against real execution data rather than simulation. Then choice: a
conservative vault touching only the most established venues and an aggressive one reaching
further, the same machinery under different ceilings. After that the share itself becomes useful,
because a standard-compliant token representing a diversified yield position is something other
protocols can accept as collateral.

The long ambition is that idle stablecoins become the anomaly rather than the resting state, and
that "where do I put my USDG" has a boring, obvious answer.

Many fragments. One picture.
