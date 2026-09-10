# Mosaic — security notes and pre-audit package

Written for whoever audits this before mainnet. It states what the vault assumes, what it
deliberately does not defend against, and what changed in the keeper/economics work.

## Trust model

| Role | Held by | Can do | Cannot do |
| --- | --- | --- | --- |
| `owner` | multisig (set at deploy, ownership is transferred in `DeployProduction`) | register/remove adapters, set weights, caps, fee (≤30%), buffer, thresholds, pause, emergency-withdraw an adapter to idle | take user funds directly; the fee is minted as shares and only on yield above the high-water mark |
| keeper | hot key run by `scripts/keeper.mjs` | `deploy()`, `rebalance()`, `pokeRates()`, `setRebalanceCostAssets()` (bounded by `maxRebalanceCostAssets`), `applyScoredWeights()` when the owner enabled scoring | move funds anywhere but between registered adapters; exceed a per-adapter `maxWeightBps`; price rebalancing out of existence |
| adapter | contract per venue | receive and return assets; report balance, rate, liquidity, utilization | be added without matching `asset()`; be removed while holding anything or carrying weight |

Adapters are trusted code — a malicious adapter can steal what was deployed to it. That is why
`addAdapter` is owner-only and why `maxWeightBps` (default 40%) bounds the blast radius. What the
vault does *not* trust is the *numbers* an adapter reports: rates are clamped
(`MAX_RATE_BPS`, 1000% APY) before they touch planning or the EMA, liquidity claims only ever
shrink what the vault attempts, and every deposit path re-checks its own caps.

## Invariants (implemented in `test/Invariants.t.sol`)

Seven invariants run against a handler that drives three depositors, a keeper, moving rates,
borrowers draining pools and time passing — 128 000 calls per invariant.

1. `totalAssets() == idleAssets() + Σ adapter.totalAssets()`.
2. Round-tripping a deposit through a withdraw never returns more than was put in (rounding is
   always in the vault's favour; the 6-decimal share offset keeps the loss ≤ 1 wei).
3. The performance fee is never charged on principal: `highWaterMarkPps` is monotonically
   non-decreasing, including when the fee rounds to zero shares.
4. Scored weights always sum to exactly 10 000, never exceed any `maxWeightBps`, and are never
   given to an adapter the scorer rejected (`test/Scoring.t.sol`, five adapters with random rates
   and random caps — this is where the two bugs below were caught).
5. A rebalance never reduces `totalAssets()` by more than `maxSlippageBps`.
6. `withdrawalCapacity()` never overstates what can actually be paid out, given honest adapters.
7. Assets leave only through withdrawals. Share price is *not* strictly monotonic and the suite
   does not pretend otherwise: pools round a supplier's burn up, so unwinding one to serve a
   withdrawal costs up to a wei per adapter touched, exactly as a real venue would. The run is
   allowed 0.01 USDG of that dust in total; a genuine leak blows through it immediately.
8. Principal is never underwater: what the vault holds covers what depositors have not taken out.

## Deliberate design choices

- **No partial fills.** A withdrawal either completes or reverts. `maxWithdraw`/`maxRedeem` now
  report the liquidity-bounded truth, so the revert normally happens at the ERC-4626 max check;
  `InsufficientLiquidity` remains as the deeper safety net if an adapter overstated its liquidity.
- **Withdrawals stay open while paused.** Pausing blocks deposits and deployment only.
- **Rebalancing is allowed to lose a little yield.** Restoring target weights is a risk decision,
  not a yield decision, so `maxRebalanceDragBps` (default 0.5% of the assets moved, over a 30-day
  horizon) is the budget for it. Anything worse must pay for itself against `rebalanceCostAssets`.
  Set the drag to 0 to require every rebalance to be yield-positive net of gas.
- **Unwinds are planned against real liquidity.** `_plan()` never asks a venue for more than its
  free cash, so the slippage guard fires on genuine shortfalls rather than on known illiquidity.

## Fixed during review — worth re-checking in the audit

Both were found by fuzzing `computeTargetWeights()` with five adapters and random caps, not by
reading the code, so treat this function as the highest-risk surface here.

- **Rounding dust could fund a rejected adapter.** The leftover from integer division was handed to
  whichever adapter had room, including one that scored zero. It now walks only scored adapters,
  never past a cap, and reverts if the dust cannot be placed.
- **Sequential division floored low-rate pools out of the book.** `rate x liq / BPS x util / BPS x
  vol / BPS` rounded to zero for a pool paying a few bps, silently excluding it. The factors are now
  multiplied without dividing back down (only the ratio between scores matters), so a zero score
  means genuinely unfundable: no rate, no free cash, or no cap.

A consequence worth stating: when the scored adapters' caps cannot cover the whole book,
`computeTargetWeights()` reverts with `CapsBelowFull` rather than overweighting what is left. The
existing targets stay in force and the keeper logs a skip.

## Known gaps before mainnet

- No third-party audit yet. This document plus `forge test` (63 tests: 56 unit/fuzz plus 7 invariants) is the
  starting package, not a substitute.
- No formal verification of the fee/high-water-mark math.
- The keeper is a single hot key with no redundancy; a stalled keeper degrades yield (idle capital,
  drifting weights) but cannot lose funds. Withdrawals never depend on it.
- `previewRebalance()` is a view, so it plans on the stored rate EMA, while `rebalance()` samples
  fresh rates first. Near the threshold the two can disagree; the keeper simulates every call
  before sending, so it never spends gas on the difference, but the UI number can be marginally
  stale.
- With `SCORING=1` the keeper overwrites manual `setTargetWeights` on its next tick. That is the
  point of enabling scoring, but it means the two ways of setting weights should not be mixed.
- Scoring reads spot liquidity and utilization; a venue could window-dress those in the block the
  keeper calls `applyScoredWeights()`. The per-adapter cap bounds what that could achieve.
- `emergencyWithdraw` is owner-only and unilateral by design — it is the break-glass path and
  should sit behind the multisig's own timelock policy.

## Deployment checklist

- [ ] `VAULT_OWNER` is a multisig, and `owner()` on the deployed vault matches it.
- [ ] `FEE_RECIPIENT` set and verified.
- [ ] `maxWeightBps` per adapter reviewed (default 40%); `maxAssets` set where the venue is thin.
- [ ] `DEPOSIT_CAP` set to a launch-sized number, then raised as confidence grows.
- [ ] `setMaxRebalanceCostAssets` set to a few multiples of a real rebalance's gas.
- [ ] `NATIVE_USD` configured for the keeper so the gas gate uses real prices.
- [ ] Keeper key funded, rotated off the deployer key, and registered via `setKeeper`.
- [ ] `pokeRates()` has run at least once so the first rebalance plans on smoothed rates.
