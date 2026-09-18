// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPoolAdapter} from "../interfaces/IPoolAdapter.sol";

/// @notice Adapter translating any ERC-4626 vault (Morpho Vault V2 on Robinhood Chain) into the
///         verbs MosaicVault speaks. Vault-only for the mutating verbs.
///
/// Morpho Vault V2 returns 0 from `maxDeposit`/`maxWithdraw` by design (it cannot compute them),
/// so this adapter never reads them: deposits are attempted at full size and a withdrawal that
/// the vault cannot fill simply returns 0, which MosaicVault already treats as "illiquid for now".
///
/// The supply rate is not something an ERC-4626 vault exposes, so it is *measured*: the adapter
/// checkpoints the vault's share price and reports the annualised growth since the checkpoint.
/// Zero until real time has elapsed — never an assumed number.
contract ERC4626PoolAdapter is IPoolAdapter {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    uint256 private constant YEAR = 365 days;
    uint256 private constant PPS_UNIT = 1e18;
    /// Below this the sample is too short to annualise meaningfully.
    uint256 private constant MIN_SAMPLE = 1 hours;

    address public immutable vault;
    IERC4626 public immutable pool;
    IERC20 internal immutable _asset;
    string public name;

    uint256 public checkpointPps;
    uint256 public checkpointAt;
    uint256 public lastRateBps;

    error NotVault();
    error AssetMismatch();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(address vault_, IERC4626 pool_, IERC20 asset_, string memory name_) {
        if (pool_.asset() != address(asset_)) revert AssetMismatch();
        vault = vault_;
        pool = pool_;
        _asset = asset_;
        name = name_;
        checkpointPps = _pps();
        checkpointAt = block.timestamp;
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function deposit(uint256 assets) external onlyVault {
        _asset.safeTransferFrom(vault, address(this), assets);
        _asset.forceApprove(address(pool), assets);
        pool.deposit(assets, address(this));
        _checkpoint();
    }

    function withdraw(uint256 assets) external onlyVault returns (uint256 withdrawn) {
        uint256 held = totalAssets();
        if (assets > held) assets = held;
        if (assets == 0) return 0;
        uint256 before = _asset.balanceOf(address(this));
        // Redeem shares rather than withdraw assets so rounding never asks for one wei more
        // than the position holds.
        uint256 shares = pool.previewWithdraw(assets);
        uint256 have = pool.balanceOf(address(this));
        if (shares > have) shares = have;
        try pool.redeem(shares, address(this), address(this)) {} catch {
            return 0;
        }
        withdrawn = _asset.balanceOf(address(this)) - before;
        if (withdrawn > 0) _asset.safeTransfer(vault, withdrawn);
        _checkpoint();
    }

    /// @notice Anyone may refresh the measured rate.
    function poke() external {
        _checkpoint();
    }

    function totalAssets() public view returns (uint256) {
        return pool.convertToAssets(pool.balanceOf(address(this)));
    }

    /// @inheritdoc IPoolAdapter
    function currentRateBps() external view returns (uint256) {
        uint256 elapsed = block.timestamp - checkpointAt;
        if (elapsed < MIN_SAMPLE) return lastRateBps;
        uint256 pps = _pps();
        if (pps <= checkpointPps || checkpointPps == 0) return 0;
        return Math.mulDiv((pps - checkpointPps) * BPS, YEAR, checkpointPps * elapsed);
    }

    /// @dev Vault V2 cannot quote withdrawable liquidity; report the position and let a
    ///      withdrawal that cannot be filled return 0.
    function availableLiquidity() external view returns (uint256) {
        return totalAssets();
    }

    /// @dev Vault V2 reports 0 for maxDeposit by design; caps live in Mosaic's own adapter config.
    function maxDeposit() external pure returns (uint256) {
        return type(uint256).max;
    }

    /// @dev An ERC-4626 vault has no on-chain notion of utilisation.
    function utilizationBps() external pure returns (uint256) {
        return 0;
    }

    function _pps() internal view returns (uint256) {
        return pool.convertToAssets(PPS_UNIT);
    }

    function _checkpoint() internal {
        uint256 elapsed = block.timestamp - checkpointAt;
        if (elapsed < MIN_SAMPLE) return;
        uint256 pps = _pps();
        lastRateBps = (pps > checkpointPps && checkpointPps != 0)
            ? Math.mulDiv((pps - checkpointPps) * BPS, YEAR, checkpointPps * elapsed)
            : 0;
        checkpointPps = pps;
        checkpointAt = block.timestamp;
    }
}
