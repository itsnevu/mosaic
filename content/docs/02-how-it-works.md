---
title: How it works
summary: The buffer, the allocation engine, the rebalance gates and the fee, in the order capital meets them.
order: 2
---

This page follows a deposit through the system in the order it actually encounters each mechanism.

## The idle buffer

The vault keeps six percent of total assets in USDG, held directly and not supplied anywhere. It
does two jobs.

It **batches deployment**. Deposits accumulate rather than moving on-chain one at a time, so the gas
of entering a venue is split across everyone in that batch.

It **serves withdrawals**. An ordinary redemption is paid from the buffer without touching a single
venue, so exiting costs nothing beyond the transaction itself and nobody's interest position is
disturbed to fund someone else's exit.

`deploy()` pushes only what sits above the buffer target, distributed pro-rata to target weights and
clamped by each adapter's ceiling and by the room the venue itself reports.

## Allocation

### Scoring

Each venue gets a score from four terms:

```
score = rate × liquidity × (1 − utilization/2) × (1 − min(0.5, deviation/rate))
```

- **Rate** is the *smoothed* supply rate, not the spot rate. The vault keeps an exponential moving
  average, weighting each new sample at twenty percent, so a one-block spike does not attract the
  book.
- **Liquidity** is free cash over held balance. A venue that cannot pay out right now scores zero.
- **Utilization** discounts rather than disqualifies. High utilization means both high rates and
  thin exit liquidity, so at full utilization the score is halved — never zeroed.
- **Volatility** is the smoothed mean absolute deviation of the rate against the rate itself, capped
  at a halving. A pool swinging between one and thirteen percent scores below a steady seven.

### From scores to weights

Scores normalize to ten thousand basis points. Any venue whose proportional share exceeds its
ceiling is fixed at the ceiling and the remainder redistributed to those with room, repeating until
it settles. The weights sum to exactly ten thousand or the call reverts — there is no "close enough".

If the scored venues' ceilings cannot cover the whole book, the vault refuses to produce weights
rather than overweighting what is left. Existing targets stay in force.

Scoring is **off by default**. Until an owner enables it, weights are set by the owner directly.
Once enabled, a keeper may adopt scored weights — but never past the ceilings the owner set.

## Rebalancing

Four gates, all of which must pass. Any failure means the vault does nothing.

| Gate | Rule |
| --- | --- |
| **Drift** | peak deviation from target must exceed 0.5% |
| **Cooldown** | at least 24 hours since the last rebalance |
| **Economics** | expected yield change over 30 days, net of gas, must clear the drag floor |
| **Execution** | every unwind within 0.1% of what was asked, and the round trip too |

### The economics gate

Before touching any state, the vault builds a plan — what it would pull, what it would push, and
what that does to expected yield over a thirty-day horizon:

```
net   = expectedYieldChange − assumedGasCost
floor = −(assetsMoved × maxRebalanceDrag)      // default 0.5%
require net ≥ floor
```

Restoring weights is partly a risk decision, so the vault does not insist every move be
yield-positive. It gives the move a budget. Anything worse than that budget must pay for itself.
Set the drag allowance to zero and the rule becomes strict: every rebalance must be profitable net
of gas.

The gas figure is quoted by the keeper from a real oracle and priced into USDG. Because that is a
hot key writing a number the gate depends on, the owner sets a ceiling above which quotes are
rejected — a compromised keeper cannot price rebalancing out of existence.

You can read the whole calculation yourself: `previewRebalance()` returns the drift, the assets that
would move, the net expected change, the floor it must clear and when the cooldown lifts. The
dashboard shows exactly these numbers.

### Execution safety

The plan never asks a venue for more than its free cash, so a shortfall means something genuinely
went wrong rather than something already known. Each unwind must land within ten basis points of the
request. Total assets before and after are checked against the same bound, so the round trip cannot
leak value even if each leg looks fine on its own. Anything that could not be placed stays in the
buffer.

## Withdrawals

Buffer first; if it is short, adapters unwind in registry order until the amount is covered.

There are **no partial fills** — a withdrawal completes in full or reverts with your shares
untouched. To keep that predictable, `withdrawalCapacity()` reports what the vault could actually
pay right now, counting only cash the venues can hand over. `maxWithdraw` and `maxRedeem` are
bounded by it, so the standard ERC-4626 answer is one that holds.

## Fees

Ten percent of yield, capped in code at thirty, tracked against a high-water mark on price per
share.

If the vault does not earn, there is no fee. After a drawdown there is no fee again until the
previous peak is passed, so the same gain is never charged twice. The fee is never charged on
principal — the mark only ratchets upward, including in the edge case where the fee rounds to zero
shares.

The fee is minted as shares to the fee recipient rather than withdrawn as assets, so it dilutes the
share price instead of removing money from the vault. It is accrued before every deposit, mint,
withdraw and redeem, so you never buy into an unaccrued gain or pay for one you did not receive.
