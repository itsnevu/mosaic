// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolAdapter} from "../interfaces/IPoolAdapter.sol";
import {MockLendingPool} from "./MockLendingPool.sol";

/// @notice Adapter translating MockLendingPool into the four vault verbs. Vault-only.
contract MockPoolAdapter is IPoolAdapter {
    using SafeERC20 for IERC20;

    address public immutable vault;
    MockLendingPool public immutable pool;
    IERC20 internal immutable _asset;

    error NotVault();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(address vault_, MockLendingPool pool_) {
        vault = vault_;
        pool = pool_;
        _asset = pool_.asset();
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function deposit(uint256 assets) external onlyVault {
        _asset.safeTransferFrom(vault, address(this), assets);
        _asset.forceApprove(address(pool), assets);
        pool.deposit(assets);
    }

    function withdraw(uint256 assets) external onlyVault returns (uint256 withdrawn) {
        uint256 bal = pool.balanceOf(address(this));
        if (assets > bal) assets = bal;
        if (assets == 0) return 0;
        withdrawn = pool.withdraw(assets);
        if (withdrawn > 0) _asset.safeTransfer(vault, withdrawn);
    }

    function totalAssets() external view returns (uint256) {
        return pool.balanceOf(address(this));
    }

    function currentRateBps() external view returns (uint256) {
        return pool.currentRateBps();
    }

    function availableLiquidity() external view returns (uint256) {
        uint256 held = pool.balanceOf(address(this));
        uint256 cash = pool.availableLiquidity();
        return cash < held ? cash : held;
    }

    /// @dev The mock pool takes any size; a real venue would report its supply cap here.
    function maxDeposit() external pure returns (uint256) {
        return type(uint256).max;
    }

    function utilizationBps() external view returns (uint256) {
        return pool.utilization();
    }
}
