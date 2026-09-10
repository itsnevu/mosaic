---
title: Contracts and parameters
summary: The adapter interface, the functions worth knowing, every parameter with its bound, and the events to index.
order: 4
---

## MosaicVault

An ERC-4626 vault over USDG. Shares are `mUSDG`, twelve decimals.

### Views worth knowing

| Function | Returns |
| --- | --- |
| `totalAssets()` | idle plus everything held at every venue |
| `idleAssets()` / `deployedAssets()` | the two halves of the above |
| `pricePerShare()` | 1e18-scaled, starts at exactly `1e18` |
| `withdrawalCapacity()` | what could actually be paid out right now |
| `liquidityByAdapter()` | per venue: held, and how much of it is free |
| `allocation(i)` | adapter, assets, current weight, target weight, current rate |
| `previewRebalance()` | `(ok, drift, assetsMoved, netGain, floor, readyAt)` |
| `scoreAdapter(i)` | the on-chain allocation score for one venue |
| `computeTargetWeights()` | the weights the scorer would set, and the raw scores |
| `pendingFeeAssets()` | fee that would accrue if called right now |
| `effectiveRateBps(adapter)` | the smoothed rate used for planning |

`maxWithdraw` and `maxRedeem` are overridden to be bounded by real liquidity, so the standard
ERC-4626 questions return answers that hold.

### Keeper functions

| Function | Effect |
| --- | --- |
| `deploy()` | push idle above the buffer target into venues, pro-rata to targets |
| `rebalance()` | move between venues when all four gates pass |
| `pokeRates()` | sample every venue's rate into its moving average |
| `setRebalanceCostAssets(x)` | quote the gas cost of a rebalance, in USDG; bounded by an owner ceiling |
| `applyScoredWeights()` | adopt the scored weights, when the owner has enabled scoring |

A keeper decides **when**, never **where**. It cannot send funds outside registered adapters,
cannot exceed a weight ceiling, and cannot bypass the cooldown.

### Owner functions

Registry: `addAdapter`, `removeAdapter` (only when empty and unweighted), `setAdapterCap`,
`setAdapterMaxWeight`, `setTargetWeights`.

Parameters: `setBufferTargetBps`, `setRebalanceThresholdBps`, `setRebalanceCooldown`,
`setRebalanceHorizon`, `setMaxRebalanceDragBps`, `setMaxSlippageBps`, `setMaxRebalanceCostAssets`,
`setPerformanceFeeBps`, `setFeeRecipient`, `setDepositCap`, `setScoringEnabled`,
`setRateEmaAlphaBps`, `setKeeper`.

Safety: `pause` / `unpause` (deposits and deployment stop; **withdrawals stay open**), and
`emergencyWithdraw(adapter)` to pull one venue's balance back to idle.

## IPoolAdapter

Every venue is reduced to this. Writing a new adapter means implementing seven functions; the vault
itself never changes.

```solidity
interface IPoolAdapter {
    function deposit(uint256 assets) external;
    function withdraw(uint256 assets) external returns (uint256 withdrawn);
    function totalAssets() external view returns (uint256);
    function currentRateBps() external view returns (uint256);
    function asset() external view returns (address);
    function availableLiquidity() external view returns (uint256);
    function maxDeposit() external view returns (uint256);
    function utilizationBps() external view returns (uint256);
}
```

Rules an adapter must respect:

- `asset()` must match the vault's, checked at registration.
- `availableLiquidity()` must never exceed `totalAssets()`.
- `withdraw` returns what was **actually** received, which may be less than requested.
- Only the vault may call `deposit` and `withdraw`.

`utilizationBps()` may return zero where a venue has no such concept; the score simply loses that
term's discount.

## Parameters

| Parameter | Default | Bound |
| --- | --- | --- |
| Max weight per adapter | 40% | ≤ 100%, per adapter |
| Per-adapter asset cap | none | owner-set |
| Idle buffer target | 6% | ≤ 100% |
| Rebalance threshold | 0.5% | ≤ 100% |
| Rebalance cooldown | 24h | — |
| Rebalance yield horizon | 30 days | — |
| Max yield drag per rebalance | 0.5% of assets moved | ≤ 100% |
| Slippage bound | 0.1% | ≤ 100% |
| Assumed gas cost | 0 | keeper-quoted, ≤ owner ceiling |
| Performance fee | 10% of yield | ≤ 30%, hard cap in code |
| Deposit cap | 2 000 000 USDG | — |
| Rate clamp | 1000% APY | constant, not settable |
| Rate EMA weight | 20% per sample | 0 < α ≤ 100% |
| On-chain scoring | off | owner-enabled |

## Events

Indexable history. The dashboard reads the first five directly from logs.

`Deployed(totalDeployed)` · `Rebalanced(deployedAssets, maxDeviationBps, timestamp)` ·
`FeeAccrued(feeAssets, feeShares, newHighWaterMarkPps)` · `TargetWeightsSet(weightsBps)` ·
`ScoredWeightsApplied(weightsBps, scores)` · `AdapterDeposit(adapter, assets)` ·
`AdapterWithdraw(adapter, requested, received)` · `RatesRecorded(timestamp)` ·
`EmergencyWithdraw(adapter, received)` · plus an event for every parameter change.

## Errors

The ones you are most likely to meet:

| Error | Meaning |
| --- | --- |
| `ERC4626ExceededMaxWithdraw` | more than current liquidity — check `withdrawalCapacity()` |
| `InsufficientLiquidity` | the deeper safety net, if an adapter overstated its liquidity |
| `DeviationBelowThreshold` | drift is too small to be worth correcting |
| `CooldownActive(readyAt)` | too soon since the last rebalance |
| `RebalanceNotProfitable(net, floor)` | the move would cost more than it is worth |
| `SlippageExceeded(requested, received)` | an unwind came up short beyond the bound |
| `CapsBelowFull` | the scored venues' ceilings cannot cover the whole book |
| `WeightExceedsMax(i, weight, max)` | a target above that adapter's ceiling |
