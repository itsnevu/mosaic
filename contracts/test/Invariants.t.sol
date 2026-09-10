// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockLendingPool} from "../src/mocks/MockLendingPool.sol";
import {MockPoolAdapter} from "../src/mocks/MockPoolAdapter.sol";
import {MosaicVault} from "../src/MosaicVault.sol";
import {IPoolAdapter} from "../src/interfaces/IPoolAdapter.sol";

/// @notice Drives the vault the way the world would: three depositors, a keeper, drifting rates,
/// borrowers draining pools, and time passing. Every action is allowed to revert — the point is
/// the state left behind, not that any single call succeeds.
contract Handler is Test {
    MosaicVault public vault;
    MockUSDG public usdg;
    MockLendingPool[3] public pools;
    address[3] public actors;

    uint256 public ghostDeposited;
    uint256 public ghostWithdrawn;

    constructor(MosaicVault vault_, MockUSDG usdg_, MockLendingPool[3] memory pools_, address[3] memory actors_) {
        vault = vault_;
        usdg = usdg_;
        pools = pools_;
        actors = actors_;
    }

    modifier useActor(uint256 seed) {
        address a = actors[seed % actors.length];
        vm.startPrank(a);
        _;
        vm.stopPrank();
    }

    function deposit(uint256 seed, uint256 amount) external useActor(seed) {
        amount = bound(amount, 0, 500_000e6);
        try vault.deposit(amount, actors[seed % actors.length]) {
            ghostDeposited += amount;
        } catch {}
    }

    function withdraw(uint256 seed, uint256 amount) external useActor(seed) {
        address a = actors[seed % actors.length];
        amount = bound(amount, 0, vault.maxWithdraw(a));
        try vault.withdraw(amount, a, a) {
            ghostWithdrawn += amount;
        } catch {}
    }

    function redeem(uint256 seed, uint256 shares) external useActor(seed) {
        address a = actors[seed % actors.length];
        shares = bound(shares, 0, vault.maxRedeem(a));
        try vault.redeem(shares, a, a) returns (uint256 assets) {
            ghostWithdrawn += assets;
        } catch {}
    }

    function transferShares(uint256 seed, uint256 shares) external useActor(seed) {
        address from = actors[seed % actors.length];
        address to = actors[(seed + 1) % actors.length];
        shares = bound(shares, 0, vault.balanceOf(from));
        try vault.transfer(to, shares) {} catch {}
    }

    function deployIdle() external {
        try vault.deploy() {} catch {}
    }

    function rebalance() external {
        try vault.rebalance() {} catch {}
    }

    function accrueFee() external {
        try vault.accrueFee() {} catch {}
    }

    function pokeRates() external {
        try vault.pokeRates() {} catch {}
    }

    function setWeights(uint16 w0, uint16 w1) external {
        w0 = uint16(bound(w0, 0, 4000));
        w1 = uint16(bound(w1, 0, 4000));
        if (uint256(w0) + w1 < 6000) return; // the third is capped at 40% too
        uint16[] memory w = new uint16[](3);
        w[0] = w0;
        w[1] = w1;
        w[2] = uint16(10_000 - w0 - w1);
        try vault.setTargetWeights(w) {} catch {}
    }

    function setRate(uint256 seed, uint16 apyBps) external {
        pools[seed % 3].setRateBps(bound(apyBps, 0, 30_000));
    }

    function borrow(uint256 seed, uint256 amount) external {
        MockLendingPool p = pools[seed % 3];
        amount = bound(amount, 0, p.availableLiquidity());
        try p.simulateBorrow(amount) {} catch {}
    }

    function repay(uint256 seed, uint256 amount) external {
        MockLendingPool p = pools[seed % 3];
        amount = bound(amount, 0, p.borrowed());
        usdg.mint(address(this), amount);
        usdg.approve(address(p), amount);
        try p.repay(amount) {} catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1 hours, 30 days));
    }
}

contract InvariantsTest is StdInvariant, Test {
    MockUSDG usdg;
    MosaicVault vault;
    MockLendingPool[3] pools;
    MockPoolAdapter[3] adapters;
    Handler handler;

    address[3] actors;
    uint256 lastHwm;
    uint256 lastTotalAssets;
    uint256 lastWithdrawn;
    /// @dev Every unexplained drop in total assets across the run, summed.
    uint256 cumulativeDustWei;

    function setUp() public {
        usdg = new MockUSDG();
        vault = new MosaicVault(IERC20(address(usdg)), address(this), makeAddr("fees"));
        for (uint256 i; i < 3; ++i) {
            pools[i] = new MockLendingPool(IERC20(address(usdg)), "p", 500 + i * 200);
            adapters[i] = new MockPoolAdapter(address(vault), pools[i]);
            vault.addAdapter(IPoolAdapter(address(adapters[i])));
        }
        uint16[] memory w = new uint16[](3);
        (w[0], w[1], w[2]) = (4000, 3500, 2500);
        vault.setTargetWeights(w);
        vault.setDepositCap(type(uint256).max);

        actors = [makeAddr("alice"), makeAddr("bob"), makeAddr("carol")];
        handler = new Handler(vault, usdg, pools, actors);
        for (uint256 i; i < 3; ++i) {
            usdg.mint(actors[i], 5_000_000e6);
            vm.prank(actors[i]);
            usdg.approve(address(vault), type(uint256).max);
        }
        // pools transfer ownership of the borrow simulation to the handler
        for (uint256 i; i < 3; ++i) pools[i].transferOwnership(address(handler));
        vault.setKeeper(address(handler), true);

        lastHwm = vault.highWaterMarkPps();
        lastTotalAssets = vault.totalAssets();
        targetContract(address(handler));
    }

    /// @notice The ledger adds up: nothing is held anywhere the vault does not account for.
    function invariant_totalAssetsIsIdlePlusDeployed() public view {
        uint256 sum = usdg.balanceOf(address(vault));
        for (uint256 i; i < 3; ++i) sum += adapters[i].totalAssets();
        assertEq(vault.totalAssets(), sum);
    }

    /// @notice The performance fee is never charged on principal: the mark only ever ratchets up.
    function invariant_highWaterMarkNeverFalls() public {
        uint256 hwm = vault.highWaterMarkPps();
        // the mark resets to par only when the vault is empty and nobody can be charged
        if (vault.totalSupply() != 0) assertGe(hwm, lastHwm, "high-water mark fell");
        lastHwm = hwm;
    }

    /// @notice Assets leave the vault only through withdrawals — everything else is dust.
    /// @dev Stated on assets rather than share price on purpose: the performance fee is paid in
    /// shares, so it dilutes the price without touching this, and interest only ever adds. What
    /// is left is the venue-side rounding — pools round a supplier's burn up, so unwinding one to
    /// serve a withdrawal costs up to a wei per adapter touched, exactly as a real venue would.
    /// The whole run is allowed 0.01 USDG of that against a book in the millions; a genuine leak
    /// blows through it immediately.
    function invariant_assetsOnlyLeaveThroughWithdrawals() public {
        uint256 ta = vault.totalAssets();
        uint256 withdrawn = handler.ghostWithdrawn();
        uint256 paidSinceLast = withdrawn - lastWithdrawn;
        if (ta + paidSinceLast < lastTotalAssets) {
            cumulativeDustWei += lastTotalAssets - (ta + paidSinceLast);
            assertLt(cumulativeDustWei, 10_000, "assets are leaking, not rounding");
        }
        lastTotalAssets = ta;
        lastWithdrawn = withdrawn;
    }

    /// @notice Capacity is a promise the vault can keep: it never claims more than it holds.
    function invariant_capacityNeverExceedsAssets() public view {
        assertLe(vault.withdrawalCapacity(), vault.totalAssets());
        for (uint256 i; i < 3; ++i) {
            assertLe(adapters[i].availableLiquidity(), adapters[i].totalAssets());
        }
    }

    /// @notice What every holder could redeem never exceeds what the vault owns.
    function invariant_sharesAreFullyBacked() public view {
        uint256 supply = vault.totalSupply();
        if (supply == 0) return;
        assertLe(vault.convertToAssets(supply), vault.totalAssets(), "shares claim more than exists");
    }

    /// @notice Targets are either unset or a complete book — never a partial one deploy() would act on.
    function invariant_targetsSumToFullOrZero() public view {
        uint256 t = vault.totalTargetBps();
        assertTrue(t == 0 || t == 10_000, "partial target book");
    }

    /// @notice The vault holds at least the principal that has not been withdrawn yet. Interest
    /// can only push it higher; it can never sit below what depositors still have in.
    function invariant_principalIsNeverUnderwater() public view {
        uint256 deposited = handler.ghostDeposited();
        uint256 withdrawn = handler.ghostWithdrawn();
        if (withdrawn >= deposited) return; // everything in has come back out, plus earnings
        assertGe(vault.totalAssets() + 10_000, deposited - withdrawn, "principal is missing");
    }
}
