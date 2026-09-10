---
title: Running a keeper
summary: What the keeper does on each tick, how to run it, and what it is structurally unable to do.
order: 5
---

The keeper is the only moving part outside the contracts. It decides *when* the vault acts. It
cannot decide *where* capital goes.

## What a tick does

The keeper simulates every call before sending it, so a call the vault would reject costs nothing
but an RPC round trip.

1. **Sample rates** if the stored statistics are stale, so planning uses smoothed rates rather than
   whatever the last block happened to show.
2. **Apply scored weights**, when `SCORING=1` and the owner has enabled scoring on-chain.
3. **Deploy** idle capital above the buffer target.
4. **Quote gas** — estimate a rebalance, price it into USDG using the native token price, apply a
   safety margin, and write it on-chain, but only when it has moved more than ten percent, so noise
   does not burn gas.
5. **Preview and rebalance** — read `previewRebalance()` and send only when the vault itself says
   the move clears drift, cooldown and economics.

Each step logs what it did or why it skipped, using the contract's own error names.

## Running it

```bash
RPC_URL=https://…  KEEPER_PRIVATE_KEY=0x…  NATIVE_USD=3000  npm run keeper
```

Against a local chain, `npm run keeper:local` uses Anvil's default account.

| Variable | Meaning |
| --- | --- |
| `RPC_URL` | required |
| `KEEPER_PRIVATE_KEY` | required unless `DRY_RUN=1` |
| `DEPLOYMENT` | path to a deployments json (default: local) |
| `INTERVAL_MS` | poll interval, default 60 000 |
| `POKE_INTERVAL_MS` | max age of a rate sample before poking, default 1h |
| `NATIVE_USD` | native token price in USD — **without it the gas gate stays at whatever is on-chain** |
| `COST_MARGIN` | multiplier on the gas estimate, default 1.5 |
| `SCORING` | `1` to push scored target weights |
| `DRY_RUN` | `1` to simulate everything and send nothing |
| `ONCE` | `1` for a single tick, then exit |

Start with `DRY_RUN=1` against the real chain. It exercises every read and simulation without
spending anything, and the log tells you exactly what it would have done.

## What it cannot do

This matters more than what it can.

- **Cannot move funds anywhere but registered adapters.** The destination set is owner-controlled.
- **Cannot exceed a weight ceiling.** Scored weights are checked against each adapter's ceiling on
  the way in, twice — once in the scorer, once when they are written.
- **Cannot bypass the cooldown or the threshold.** Both are contract state.
- **Cannot price rebalancing out of existence.** Its gas quote is capped by an owner-set ceiling.
- **Cannot take custody.** It never holds vault assets.

A keeper that stops running degrades yield — capital sits idle, weights drift — but cannot lose
funds. Withdrawals never depend on it.

## Operating notes

**Run it as a service.** A crashed keeper is silent. Use a supervisor that restarts it and alerts
on repeated failures; the tick log is designed to be greppable.

**Do not mix weight-setting modes.** With `SCORING=1` the keeper overwrites manual
`setTargetWeights` on its next tick. Pick one.

**Keep the key funded and separate.** The keeper key should not be the deployer key and should hold
only enough native token for gas.

**Set `NATIVE_USD` from a real feed.** Without it the profitability gate works from a stale
on-chain number, which makes the economics check less meaningful than it looks.

**Watch the ceiling.** `setMaxRebalanceCostAssets` should be a few multiples of a real rebalance.
Too low and legitimate quotes are rejected; unset, and a compromised key can stall rebalancing.
