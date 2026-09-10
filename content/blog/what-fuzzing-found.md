---
title: Three Bugs Reading the Code Never Found
summary: Every defect we shipped a fix for this month was caught by a machine throwing random numbers at the contract, not by a person looking at it. Here is each one, and what it taught us about where to point the fuzzer.
date: 2026-09-10
---

There is a comfortable story engineers tell about correctness, which is that careful people writing
careful code produce correct code, and testing confirms it. The uncomfortable version, which is the
true one, is that testing is where you find out what you were wrong about. This month every defect
we fixed in the Mosaic vault was found by a machine throwing random inputs at it. Not one was found
by a person reading the code, and all three had been read many times.

They are worth writing down, because the pattern in them is more useful than any of them
individually.

## One: a fee that could touch principal

Mosaic charges ten percent on yield, tracked against a high-water mark on the share price. The rule
is simple to state — no fee below the previous peak, so the same gain is never charged twice, and
principal is never touched. The implementation looked simple too. Compute the gain above the mark,
take ten percent of it, mint that many shares to the fee recipient, move the mark up.

The fuzzer found a case where the fee, converted into shares, rounded down to zero. On a very small
gain against a large supply, ten percent of it is worth less than one share unit. The code did the
sensible-looking thing: no shares to mint, so return early and leave the mark where it was.

That early return is the bug. The gain happened. Nobody was charged for it, which is fine. But the
mark did not move, so that same gain sat below the mark waiting to be counted again — and the next
time the price rose enough to mint a whole share, the fee was computed from a base that included
value the vault had already earned and already declined to charge for. Do that repeatedly, in the
right conditions, and you are charging a fee against capital rather than against yield. It is the
exact thing the high-water mark exists to make impossible.

The fix is one line and reads like a comment: when the fee rounds away, ratchet the mark anyway.

```solidity
if (feeShares == 0) {
    // Fee rounds to zero: still ratchet the mark so this gain is never re-counted
    // against later depositors (that would be a fee on principal).
    highWaterMarkPps = pps;
    return;
}
```

No human reading that function would have flagged the early return, because the early return is
obviously correct in the thing it is thinking about — you cannot mint zero shares. It is wrong in
the thing it is not thinking about.

## Two: rounding dust funding a pool we had rejected

The allocation engine scores each venue, normalizes the scores into weights that sum to exactly ten
thousand basis points, and caps any venue at its ceiling, redistributing the overflow. Integer
division being what it is, the weights come out a few basis points short, and that dust has to go
somewhere.

The original code handed it to whichever adapter still had room. Reasonable. Except that "still has
room" includes adapters the scorer had given a score of zero — a venue paying nothing, or one with
no free cash to withdraw from. The scoring engine's entire job is to decide where money should go,
and the last three lines were quietly overriding it with whatever happened to fit.

The amount is tiny. That is not the point. The point is that a function whose contract is "produce
weights that respect the score" was producing weights that did not, and no amount of staring at it
made that visible, because each individual line does what it says.

What made it visible was a fuzz test written against the *contract of the function* rather than
against its implementation: five adapters, random rates, random ceilings, and one assertion per
property — the weights sum to ten thousand, no weight exceeds its ceiling, and **no unscored adapter
is ever funded**. That last assertion failed on run seventeen.

The fix walks only scored adapters, never past a ceiling, and reverts if the dust cannot be placed
rather than fudging the total.

## Three: a divide that erased small pools

The score multiplies four factors — rate, liquidity, an inverse-utilization term and a volatility
term — each of them expressed in basis points. The obvious implementation divides back down to basis
points after each multiplication, so the number stays in a familiar range:

```solidity
score = (((rate * liqBps) / BPS) * utilBps / BPS) * volBps / BPS;
```

That is wrong for a reason that is only obvious once you see it fail. For a venue paying a few basis
points, the first division floors the intermediate result to zero, and zero times anything is zero.
The venue does not score badly. It scores *nothing*, which in this engine means "unfundable" — the
same status as a pool that has no cash at all. It drops out of the book entirely and its ceiling
stops counting toward capacity, which can cascade into the whole allocation refusing to compute.

The fix is to not divide. Only the ratios between scores matter, so the four factors are multiplied
and left alone. The product is bounded well inside a `uint256`, and precision is preserved exactly.

```solidity
score = rate * liqBps * utilBps * volBps;
```

The fuzzer found this one indirectly: an older test started failing after the second fix, on an
input where a bounded-low rate met a partially drained pool. The failure was a revert with the wrong
error, which is the kind of signal that is easy to dismiss as a test needing an update. It wasn't.

## The pattern

All three share a shape. Each individual line is correct. Each function is correct in the cases the
author was thinking about. The defect lives in the interaction between a rounding decision and a
piece of state that outlives the call — the mark that did not move, the dust that had to go
somewhere, the intermediate that hit the floor.

That is precisely the class of bug that reading is worst at and randomized testing is best at,
because reading follows the path the author already had in mind, and a fuzzer does not know what the
author had in mind.

Two practical things came out of this.

**Assert the contract, not the implementation.** The scoring test that caught the second bug does
not check any particular weight. It checks three properties that must hold for any input. Tests
written against what the code does can only ever confirm what it already does.

**Put the fuzzer where state persists.** We now run seven invariants against a handler that drives
three depositors, a keeper, moving rates, borrowers draining pools and time passing — a hundred and
twenty-eight thousand calls each. They assert that the ledger always adds up, that the mark never
falls, that capacity never exceeds assets, that shares stay fully backed, and that assets leave only
through withdrawals.

That last one is instructive in its own right. Our first version asserted that the share price never
falls, and it failed immediately — twice, for two different reasons that were both us being wrong
rather than the vault. The performance fee is minted as shares, so it dilutes the price by design.
And venues round a supplier's burn up, so unwinding one to serve a withdrawal costs a wei per venue
touched. Neither is a leak. Both look exactly like one if your invariant is sloppy.

The honest invariant states the thing that actually must hold — assets leave only through
withdrawals, and anything else is dust bounded at a hundredth of a cent per run — and it says out
loud that the share price is not strictly monotonic and why. An invariant you had to weaken is worth
more than one you had to delete, as long as you write down what you learned when you weakened it.

## Where this leaves us

Three bugs, all fixed, all covered by tests that would catch them again. Sixty-three tests across
unit, property and invariant suites.

None of that is an audit, and we are not going to pretend otherwise — an audit is a prerequisite for
mainnet here, not a nice-to-have. But the package an auditor starts from is better for this month:
the trust model is written down, the invariants are enumerated and implemented, and the known gaps
are listed as gaps rather than left for someone else to discover.

The most valuable output of a fuzzing campaign is not the bug count. It is knowing, specifically,
which parts of your system you were wrong about — and the allocation engine is now the part of
Mosaic we point auditors at first.
