// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The verbs every lending venue is translated into, plus the asset it speaks.
/// @dev The three view verbs below the four core ones let the vault price liquidity and
/// risk on-chain: capacity checks, withdrawal quotes and allocation scoring all read them.
interface IPoolAdapter {
    /// @notice Pull `assets` from the vault (via transferFrom) and supply them to the pool.
    function deposit(uint256 assets) external;

    /// @notice Withdraw up to `assets` from the pool and send them to the vault.
    /// @return withdrawn The amount actually withdrawn (may be < assets if the pool is illiquid).
    function withdraw(uint256 assets) external returns (uint256 withdrawn);

    /// @notice Current value (principal + accrued interest) held in the pool by this adapter.
    function totalAssets() external view returns (uint256);

    /// @notice Current supply rate the pool is paying, annualized, in basis points.
    function currentRateBps() external view returns (uint256);

    /// @notice The underlying asset (USDG).
    function asset() external view returns (address);

    /// @notice What this adapter could actually withdraw right now, i.e.
    /// min(its own balance, the pool's free cash). Never greater than `totalAssets()`.
    function availableLiquidity() external view returns (uint256);

    /// @notice Room left to supply into the pool. `type(uint256).max` when uncapped.
    function maxDeposit() external view returns (uint256);

    /// @notice Pool utilization (borrowed / supplied) in basis points. 0 when the venue has no concept of it.
    function utilizationBps() external view returns (uint256);
}
