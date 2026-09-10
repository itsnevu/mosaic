// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockLendingPool} from "../src/mocks/MockLendingPool.sol";
import {MockPoolAdapter} from "../src/mocks/MockPoolAdapter.sol";
import {MosaicVault} from "../src/MosaicVault.sol";
import {IPoolAdapter} from "../src/interfaces/IPoolAdapter.sol";

contract MosaicVaultTest is Test {
    MockUSDG usdg;
    MockLendingPool p0;
    MockLendingPool p1;
    MockLendingPool p2;
    MockPoolAdapter a0;
    MockPoolAdapter a1;
    MockPoolAdapter a2;
    MosaicVault vault;

    address owner = address(this);
    address feeRecipient = makeAddr("fees");
    address keeper = makeAddr("keeper");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant ONE = 1e6;
    uint256 constant SH = 1e12; // shares per 1 USDG at pps = 1 (6 asset decimals + 6 offset)

    function setUp() public {
        usdg = new MockUSDG();
        p0 = new MockLendingPool(IERC20(address(usdg)), "Turret", 900);
        p1 = new MockLendingPool(IERC20(address(usdg)), "Pool B", 700);
        p2 = new MockLendingPool(IERC20(address(usdg)), "Pool C", 500);
        vault = new MosaicVault(IERC20(address(usdg)), owner, feeRecipient);
        a0 = new MockPoolAdapter(address(vault), p0);
        a1 = new MockPoolAdapter(address(vault), p1);
        a2 = new MockPoolAdapter(address(vault), p2);
        vault.addAdapter(IPoolAdapter(address(a0)));
        vault.addAdapter(IPoolAdapter(address(a1)));
        vault.addAdapter(IPoolAdapter(address(a2)));
        _setWeights(4000, 3500, 2500);
        vault.setKeeper(keeper, true);

        usdg.mint(alice, 10_000_000 * ONE);
        usdg.mint(bob, 10_000_000 * ONE);
        vm.prank(alice);
        usdg.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdg.approve(address(vault), type(uint256).max);
    }

    // ---------------- helpers ----------------

    function _setWeights(uint16 w0, uint16 w1, uint16 w2) internal {
        uint16[] memory w = new uint16[](3);
        w[0] = w0;
        w[1] = w1;
        w[2] = w2;
        vault.setTargetWeights(w);
    }

    function _deposit(address who, uint256 amt) internal returns (uint256 shares) {
        vm.prank(who);
        shares = vault.deposit(amt, who);
    }

    function _deployAll() internal {
        vm.prank(keeper);
        vault.deploy();
    }

    // ---------------- deposit / withdraw share math ----------------

    function test_firstDepositMintsOneToOne() public {
        uint256 shares = _deposit(alice, 1000 * ONE);
        assertEq(shares, 1000 * SH);
        assertEq(vault.decimals(), 12);
        assertEq(vault.totalAssets(), 1000 * ONE);
        assertEq(vault.pricePerShare(), 1e18);
    }

    function test_secondDepositPricedAtCurrentPps() public {
        _deposit(alice, 900_000 * ONE);
        // simulate yield landing in idle: 100k
        usdg.mint(address(vault), 100_000 * ONE);
        // pps = 1,000,000 / 900,000 = 1.111..
        // fee accrues first (10% of 100k = 10k to feeRecipient), so bob pays pps ~1.111 on 1M assets
        uint256 shares = _deposit(bob, 10_000 * ONE);
        // after fee: supply = 900k + feeShares, ta = 1,000,000. pps = 1,000,000/(900k+feeShares)
        uint256 expected = (10_000 * ONE) * vault.totalSupply() / vault.totalAssets(); // approx (post-deposit ratio)
        assertApproxEqRel(shares, expected, 1e14);
        // alice's claim is not diluted by bob's deposit
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(alice)), 990_000 * ONE, 2);
    }

    function test_withdrawFromIdle() public {
        _deposit(alice, 1000 * ONE);
        vm.prank(alice);
        uint256 shares = vault.withdraw(400 * ONE, alice, alice);
        assertEq(shares, 400 * SH);
        assertEq(usdg.balanceOf(alice), 10_000_000 * ONE - 600 * ONE);
        assertEq(vault.balanceOf(alice), 600 * SH);
    }

    function test_redeemAll() public {
        uint256 shares = _deposit(alice, 12_345 * ONE);
        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);
        assertEq(assets, 12_345 * ONE);
        assertEq(vault.totalSupply(), 0);
    }

    function testFuzz_depositWithdrawRoundTrip(uint96 rawAmt, uint96 rawOther) public {
        uint256 amt = bound(uint256(rawAmt), 1, 1_000_000 * ONE);
        uint256 other = bound(uint256(rawOther), 1, 900_000 * ONE);
        _deposit(bob, other); // pre-existing depositor to make pps non-trivial
        usdg.mint(address(vault), other / 7); // some yield
        uint256 before = usdg.balanceOf(alice);
        uint256 shares = _deposit(alice, amt);
        vm.prank(alice);
        vault.redeem(shares, alice, alice);
        uint256 afterBal = usdg.balanceOf(alice);
        assertLe(afterBal, before);
        assertGe(afterBal + 1, before); // <= 1 wei loss
    }

    // ---------------- buffer + deploy ----------------

    function test_deployKeepsBufferAndDistributesProRata() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        uint256 buffer = 1_000_000 * ONE * 600 / 10_000; // 60k
        assertEq(vault.idleAssets(), buffer);
        uint256 excess = 940_000 * ONE;
        assertEq(a0.totalAssets(), excess * 4000 / 10_000);
        assertEq(a1.totalAssets(), excess * 3500 / 10_000);
        assertEq(a2.totalAssets(), excess * 2500 / 10_000);
        assertEq(vault.totalAssets(), 1_000_000 * ONE);
    }

    function test_deployRevertsWhenIdleBelowBuffer() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        vm.prank(keeper);
        vm.expectRevert(MosaicVault.NothingToDeploy.selector);
        vault.deploy();
    }

    function test_deployOnlyKeeper() public {
        _deposit(alice, 1_000_000 * ONE);
        vm.prank(alice);
        vm.expectRevert(MosaicVault.NotKeeper.selector);
        vault.deploy();
    }

    function test_deployRespectsAdapterCap() public {
        vault.setAdapterCap(IPoolAdapter(address(a0)), 100_000 * ONE);
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        assertEq(a0.totalAssets(), 100_000 * ONE);
        // uncapped others get their pro-rata share
        assertEq(a1.totalAssets(), 940_000 * ONE * 3500 / 10_000);
    }

    function test_smallWithdrawServedFromIdleWithoutTouchingPools() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        uint256 a0Before = a0.totalAssets();
        vm.prank(alice);
        vault.withdraw(50_000 * ONE, alice, alice);
        assertEq(a0.totalAssets(), a0Before);
        assertEq(vault.idleAssets(), 10_000 * ONE);
    }

    function test_largeWithdrawUnwindsAdaptersInOrder() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        // need 300k: idle 60k + 240k from a0 (has 376k). a1 untouched.
        uint256 a1Before = a1.totalAssets();
        vm.prank(alice);
        vault.withdraw(300_000 * ONE, alice, alice);
        assertEq(vault.idleAssets(), 0);
        assertEq(a0.totalAssets(), 376_000 * ONE - 240_000 * ONE);
        assertEq(a1.totalAssets(), a1Before);
        assertEq(vault.totalAssets(), 700_000 * ONE);
    }

    function test_noPartialFillRevertsWhenPoolsIlliquid() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        // lock most liquidity in every pool
        p0.simulateBorrow(p0.availableLiquidity() - 1000 * ONE);
        p1.simulateBorrow(p1.availableLiquidity() - 1000 * ONE);
        p2.simulateBorrow(p2.availableLiquidity() - 1000 * ONE);
        // available: 60k idle + 3k = 63k, and withdrawalCapacity() says so up front.
        assertEq(vault.withdrawalCapacity(), 63_000 * ONE);
        assertEq(vault.maxWithdraw(alice), 63_000 * ONE);
        // Ask for 100k -> revert at the ERC-4626 max check, keep shares.
        uint256 sharesBefore = vault.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxWithdraw.selector, alice, 100_000 * ONE, 63_000 * ONE)
        );
        vault.withdraw(100_000 * ONE, alice, alice);
        assertEq(vault.balanceOf(alice), sharesBefore);
        // but 63k works
        vm.prank(alice);
        vault.withdraw(63_000 * ONE, alice, alice);
    }

    // ---------------- liquidity-aware capacity ----------------

    function test_withdrawalCapacityExcludesBorrowedLiquidity() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        assertEq(vault.withdrawalCapacity(), vault.totalAssets(), "all liquid before borrowing");
        p0.simulateBorrow(300_000 * ONE);
        uint256 cap = vault.withdrawalCapacity();
        assertApproxEqAbs(cap, vault.totalAssets() - 300_000 * ONE, 10);
        (uint256[] memory held, uint256[] memory avail) = vault.liquidityByAdapter();
        assertApproxEqAbs(held[0] - avail[0], 300_000 * ONE, 10);
        assertEq(held[1], avail[1]);
    }

    function test_maxRedeemBoundedByLiquidity() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        p0.simulateBorrow(300_000 * ONE);
        uint256 maxShares = vault.maxRedeem(alice);
        assertLt(maxShares, vault.balanceOf(alice));
        // the bound is honest: redeeming exactly that much succeeds
        vm.prank(alice);
        vault.redeem(maxShares, alice, alice);
    }

    // ---------------- rebalance economics ----------------

    function test_previewRebalanceMirrorsExecution() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        _setWeights(2500, 3500, 4000);
        vm.warp(block.timestamp + 25 hours);

        (bool ok, uint256 dev, uint256 moved, int256 net, int256 minNet,) = vault.previewRebalance();
        assertTrue(ok);
        assertGt(dev, vault.rebalanceThresholdBps());
        assertGt(moved, 0);
        assertGe(net, minNet);
        assertLt(net, int256(0), "moving 9% -> 5% gives up yield, within the drag allowance");

        vm.prank(keeper);
        vault.rebalance();
        (bool okAfter,,,,,) = vault.previewRebalance();
        assertFalse(okAfter, "cooldown and flat weights close the window");
    }

    function test_rebalanceRevertsWhenGasCostOutweighsGain() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        vault.setMaxRebalanceDragBps(0); // every rebalance must pay for itself
        _setWeights(2500, 3500, 4000); // moves money from the 9% pool into the 5% pool
        vm.warp(block.timestamp + 25 hours);

        (bool ok,,, int256 net, int256 minNet,) = vault.previewRebalance();
        assertFalse(ok);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MosaicVault.RebalanceNotProfitable.selector, net, minNet));
        vault.rebalance();
    }

    function test_rebalanceProceedsWhenGainClearsCost() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        vault.setMaxRebalanceDragBps(0);
        vault.setAdapterMaxWeight(IPoolAdapter(address(a0)), 6000);
        _setWeights(5500, 3500, 1000); // pull from the 5% pool into the 9% pool
        vm.warp(block.timestamp + 25 hours);

        (bool ok,,, int256 net,,) = vault.previewRebalance();
        assertTrue(ok);
        assertGt(net, int256(0), "moving 5% -> 9% earns over the horizon");

        // ...until the estimated gas cost eats the whole gain
        vm.prank(keeper);
        vault.setRebalanceCostAssets(uint256(net) + 1);
        (bool ok2,,,,,) = vault.previewRebalance();
        assertFalse(ok2);

        vm.prank(keeper);
        vault.setRebalanceCostAssets(0);
        vm.prank(keeper);
        vault.rebalance();
        assertApproxEqRel(a0.totalAssets(), vault.deployedAssets() * 5500 / 10_000, 1e15);
    }

    function test_rebalancePullsOnlyWhatVenuesCanPay() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        // p0 is over-weight but has lent almost everything out
        vault.setAdapterMaxWeight(IPoolAdapter(address(a2)), 5000);
        _setWeights(1000, 4000, 5000);
        uint256 held0 = a0.totalAssets();
        p0.simulateBorrow(p0.availableLiquidity() - 10_000 * ONE);
        vm.warp(block.timestamp + 25 hours);

        (, , uint256 moved,,,) = vault.previewRebalance();
        assertApproxEqAbs(moved, 10_000 * ONE, 1e9, "plan is capped by free cash, not by the target gap");

        uint256 taBefore = vault.totalAssets();
        vm.prank(keeper);
        vault.rebalance();
        assertApproxEqAbs(vault.totalAssets(), taBefore, 10, "no value lost on a partial unwind");
        assertGt(a0.totalAssets(), held0 - 20_000 * ONE, "the illiquid part stayed put");
    }

    function test_rebalanceRevertsOnNothingToMove() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        vault.setAdapterMaxWeight(IPoolAdapter(address(a2)), 5000);
        _setWeights(1000, 4000, 5000);
        vm.warp(block.timestamp + 25 hours);
        p0.simulateBorrow(p0.availableLiquidity()); // over-weight pool is fully illiquid
        vm.prank(keeper);
        vm.expectRevert(MosaicVault.NothingToMove.selector);
        vault.rebalance();
    }

    function test_setMaxSlippageBounds() public {
        vault.setMaxSlippageBps(25);
        assertEq(vault.maxSlippageBps(), 25);
        vm.expectRevert(MosaicVault.InvalidBps.selector);
        vault.setMaxSlippageBps(10_001);
    }

    // ---------------- rate statistics ----------------

    function test_rateEmaTracksSpotAndVolatility() public {
        vm.prank(keeper);
        vault.pokeRates();
        (uint64 ema, uint64 dev, uint32 at) = vault.rateStat(address(a0));
        assertEq(ema, 900, "first sample seeds the EMA");
        assertEq(dev, 0);
        assertEq(at, uint32(block.timestamp));

        p0.setRateBps(1900);
        vm.warp(block.timestamp + 1 days);
        vm.prank(keeper);
        vault.pokeRates();
        (ema, dev,) = vault.rateStat(address(a0));
        assertEq(ema, 900 + (1000 * 2000) / 10_000, "20% of the way to the new rate");
        assertEq(dev, (1000 * 2000) / 10_000);
        assertEq(vault.effectiveRateBps(IPoolAdapter(address(a0))), ema, "planning uses the smoothed rate");
    }

    function test_pokeRatesOnlyKeeper() public {
        vm.prank(alice);
        vm.expectRevert(MosaicVault.NotKeeper.selector);
        vault.pokeRates();
    }

    // ---------------- allocation scoring ----------------

    function test_scoreFavoursHigherRate() public view {
        assertGt(vault.scoreAdapter(0), vault.scoreAdapter(1));
        assertGt(vault.scoreAdapter(1), vault.scoreAdapter(2));
    }

    function test_scorePenalisesIlliquidityAndUtilization() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        uint256 before = vault.scoreAdapter(0);
        p0.simulateBorrow((p0.availableLiquidity() * 8) / 10);
        assertLt(vault.scoreAdapter(0), before, "lent-out capital scores worse at the same rate");
    }

    function test_scorePenalisesVolatileRates() public {
        // a1 and a2 both settle at 700bps, but a1 got there by swinging
        p2.setRateBps(700);
        vm.prank(keeper);
        vault.pokeRates();
        for (uint256 i; i < 6; ++i) {
            p1.setRateBps(i % 2 == 0 ? 100 : 1300);
            vm.warp(block.timestamp + 1 days);
            vm.prank(keeper);
            vault.pokeRates();
        }
        p1.setRateBps(700);
        vm.warp(block.timestamp + 1 days);
        vm.prank(keeper);
        vault.pokeRates();

        (uint64 ema1,,) = vault.rateStat(address(a1));
        (uint64 ema2, uint64 dev2,) = vault.rateStat(address(a2));
        assertEq(dev2, 0, "steady pool has no deviation");
        assertApproxEqAbs(ema1, ema2, 200, "similar smoothed rates");
        assertLt(vault.scoreAdapter(1), vault.scoreAdapter(2), "volatility discounts the score");
    }

    function test_applyScoredWeightsRequiresEnabling() public {
        vm.prank(keeper);
        vm.expectRevert(MosaicVault.ScoringDisabled.selector);
        vault.applyScoredWeights();

        vault.setScoringEnabled(true);
        vm.prank(alice);
        vm.expectRevert(MosaicVault.NotKeeper.selector);
        vault.applyScoredWeights();
    }

    function test_applyScoredWeightsSumsTo10000AndRespectsCaps() public {
        vault.setScoringEnabled(true);
        vm.prank(keeper);
        uint16[] memory w = vault.applyScoredWeights();
        uint256 sum;
        for (uint256 i; i < w.length; ++i) {
            (, , uint16 max,) = vault.adapterConfig(address(vault.adapters(i)));
            assertLe(w[i], max, "never past the owner's cap");
            sum += w[i];
        }
        assertEq(sum, 10_000);
        assertEq(vault.totalTargetBps(), 10_000);
        // 9% pool is capped at 40%, so the rest spills into the others by score
        assertEq(w[0], 4000);
        assertGt(w[1], w[2]);
        // and the targets are live: deploy follows them
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        (, , uint256 cur0, uint16 t0,) = vault.allocation(0);
        assertApproxEqAbs(cur0, t0, 2);
    }

    function testFuzz_scoredWeightsAlwaysSumTo10000(uint16 r0, uint16 r1, uint16 r2, uint96 borrow) public {
        r0 = uint16(bound(r0, 1, 5000));
        r1 = uint16(bound(r1, 1, 5000));
        r2 = uint16(bound(r2, 1, 5000));
        p0.setRateBps(r0);
        p1.setRateBps(r1);
        p2.setRateBps(r2);
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        p0.simulateBorrow(bound(borrow, 0, p0.availableLiquidity()));

        vault.setScoringEnabled(true);
        // Draining a pool of every last dollar makes it unfundable; with its 40% cap out of the
        // picture the remaining two cannot carry the book, and the scorer says so rather than
        // quietly overweighting them.
        uint256 scoredCap;
        for (uint256 i; i < 3; ++i) {
            if (vault.scoreAdapter(i) != 0) scoredCap += 4000;
        }
        if (scoredCap < 10_000) {
            vm.prank(keeper);
            vm.expectRevert(MosaicVault.CapsBelowFull.selector);
            vault.applyScoredWeights();
            return;
        }
        vm.prank(keeper);
        uint16[] memory w = vault.applyScoredWeights();
        uint256 sum;
        for (uint256 i; i < w.length; ++i) {
            (,, uint16 max,) = vault.adapterConfig(address(vault.adapters(i)));
            assertLe(w[i], max);
            sum += w[i];
        }
        assertEq(sum, 10_000);
    }

    function test_computeTargetWeightsRevertsWhenCapsCannotCoverBook() public {
        vault.setAdapterMaxWeight(IPoolAdapter(address(a0)), 1000);
        vault.setAdapterMaxWeight(IPoolAdapter(address(a1)), 1000);
        vault.setAdapterMaxWeight(IPoolAdapter(address(a2)), 1000);
        vm.expectRevert(MosaicVault.CapsBelowFull.selector);
        vault.computeTargetWeights();
    }

    // ---------------- hardening ----------------

    function test_rateIsClampedSoAdaptersCannotOverflowPlanning() public {
        p0.setRateBps(type(uint128).max); // adapter reports an absurd rate
        assertEq(vault.effectiveRateBps(IPoolAdapter(address(a0))), 100_000, "clamped to 1000% APY");
        vm.prank(keeper);
        vault.pokeRates();
        (uint64 ema,,) = vault.rateStat(address(a0));
        assertEq(ema, 100_000);

        // planning still produces sane, non-overflowed numbers
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        _setWeights(2500, 3500, 4000);
        vm.warp(block.timestamp + 25 hours);
        (, , uint256 moved, int256 net,,) = vault.previewRebalance();
        assertGt(moved, 0);
        assertLt(net, int256(0), "leaving the top-paying pool still reads as giving up yield");
    }

    function test_zeroCapAdapterIsExcludedFromScoring() public {
        vault.setAdapterMaxWeight(IPoolAdapter(address(a2)), 0);
        assertEq(vault.scoreAdapter(2), 0, "an adapter capped at zero cannot be scored into the book");
        // the two that are left must be allowed to carry the whole book
        vault.setAdapterMaxWeight(IPoolAdapter(address(a0)), 6000);
        vault.setAdapterMaxWeight(IPoolAdapter(address(a1)), 6000);

        vault.setScoringEnabled(true);
        vm.prank(keeper);
        uint16[] memory w = vault.applyScoredWeights();
        assertEq(w[2], 0);
        assertEq(uint256(w[0]) + w[1], 10_000);
    }

    function test_keeperCannotPriceRebalanceOutOfExistence() public {
        vault.setMaxRebalanceCostAssets(100 * ONE);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MosaicVault.CostAboveCeiling.selector, 101 * ONE, 100 * ONE));
        vault.setRebalanceCostAssets(101 * ONE);

        vm.prank(keeper);
        vault.setRebalanceCostAssets(100 * ONE);
        assertEq(vault.rebalanceCostAssets(), 100 * ONE);

        // lowering the ceiling pulls the live estimate down with it
        vault.setMaxRebalanceCostAssets(10 * ONE);
        assertEq(vault.rebalanceCostAssets(), 10 * ONE);
    }

    function test_setRebalanceCostOnlyKeeper() public {
        vm.prank(alice);
        vm.expectRevert(MosaicVault.NotKeeper.selector);
        vault.setRebalanceCostAssets(1);
    }

    // ---------------- registry ----------------

    function test_addAdapterRejectsAssetMismatch() public {
        MockUSDG other = new MockUSDG();
        MockLendingPool px = new MockLendingPool(IERC20(address(other)), "X", 100);
        MockPoolAdapter ax = new MockPoolAdapter(address(vault), px);
        vm.expectRevert(MosaicVault.AssetMismatch.selector);
        vault.addAdapter(IPoolAdapter(address(ax)));
    }

    function test_addAdapterRejectsDuplicate() public {
        vm.expectRevert(MosaicVault.AdapterAlreadyRegistered.selector);
        vault.addAdapter(IPoolAdapter(address(a0)));
    }

    function test_removeAdapterRequiresEmptyAndZeroWeight() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        vm.expectRevert(MosaicVault.AdapterNotEmpty.selector);
        vault.removeAdapter(IPoolAdapter(address(a2)));

        vault.emergencyWithdraw(IPoolAdapter(address(a2)));
        vm.expectRevert(MosaicVault.AdapterHasWeight.selector);
        vault.removeAdapter(IPoolAdapter(address(a2)));

        vault.setAdapterMaxWeight(IPoolAdapter(address(a0)), 6000);
        _setWeights(6000, 4000, 0);
        vault.removeAdapter(IPoolAdapter(address(a2)));
        assertEq(vault.adaptersLength(), 2);
        assertEq(address(vault.adapters(1)), address(a1));
    }

    function test_setTargetWeightsMustSumTo10000() public {
        uint16[] memory w = new uint16[](3);
        w[0] = 4000;
        w[1] = 3000;
        w[2] = 2000;
        vm.expectRevert(MosaicVault.WeightsMustSumTo10000.selector);
        vault.setTargetWeights(w);
    }

    function test_setTargetWeightsLengthMismatch() public {
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        vm.expectRevert(MosaicVault.LengthMismatch.selector);
        vault.setTargetWeights(w);
    }

    function test_weightCapEnforced() public {
        uint16[] memory w = new uint16[](3);
        w[0] = 5000;
        w[1] = 3000;
        w[2] = 2000;
        vm.expectRevert(abi.encodeWithSelector(MosaicVault.WeightExceedsMax.selector, 0, 5000, 4000));
        vault.setTargetWeights(w);
        // raise the cap and it passes
        vault.setAdapterMaxWeight(IPoolAdapter(address(a0)), 5000);
        vault.setTargetWeights(w);
    }

    function test_onlyOwnerAdmin() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.setDepositCap(1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.emergencyWithdraw(IPoolAdapter(address(a0)));
        vm.stopPrank();
    }

    function test_adapterOnlyVault() public {
        vm.expectRevert(MockPoolAdapter.NotVault.selector);
        a0.deposit(1);
        vm.expectRevert(MockPoolAdapter.NotVault.selector);
        a0.withdraw(1);
    }

    // ---------------- rebalance ----------------

    function test_rebalanceRevertsBelowThreshold() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        vm.warp(block.timestamp + 25 hours);
        vm.prank(keeper);
        vm.expectPartialRevert(MosaicVault.DeviationBelowThreshold.selector);
        vault.rebalance();
    }

    function test_rebalanceRevertsDuringCooldown() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        _setWeights(2500, 3500, 4000); // creates deviation
        vm.warp(block.timestamp + 25 hours);
        vm.prank(keeper);
        vault.rebalance();
        uint256 readyAt = block.timestamp + 24 hours;
        _setWeights(4000, 3500, 2500);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MosaicVault.CooldownActive.selector, readyAt));
        vault.rebalance();
    }

    function test_rebalanceMovesToTargets() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        _setWeights(2500, 3500, 4000);
        vm.warp(block.timestamp + 25 hours);
        // pools accrued some interest by now; allow small tolerance
        uint256 deployed = vault.deployedAssets();
        vm.prank(keeper);
        vm.expectEmit(false, false, false, false);
        emit MosaicVault.Rebalanced(0, 0, 0);
        vault.rebalance();
        assertApproxEqRel(a0.totalAssets(), deployed * 2500 / 10_000, 1e15);
        assertApproxEqRel(a1.totalAssets(), deployed * 3500 / 10_000, 1e15);
        assertApproxEqRel(a2.totalAssets(), deployed * 4000 / 10_000, 1e15);
        assertEq(vault.lastRebalance(), block.timestamp);
        // total value preserved (only rounding)
        assertApproxEqAbs(vault.totalAssets(), 1_000_000 * ONE + (deployed - 940_000 * ONE), 10);
    }

    function test_rebalanceDriftFromDifferentRatesEventuallyClearsThreshold() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        vm.warp(block.timestamp + 365 days);
        // 9% vs 5% over a year drifts weights by > 0.5%
        vm.prank(keeper);
        vault.rebalance();
        (,, uint256 cur0, uint16 t0,) = vault.allocation(0);
        assertApproxEqAbs(cur0, t0, 2);
    }

    // ---------------- fee ----------------

    function test_noFeeWithoutYield() public {
        _deposit(alice, 1_000_000 * ONE);
        vault.accrueFee();
        assertEq(vault.balanceOf(feeRecipient), 0);
        vm.prank(alice);
        vault.withdraw(500_000 * ONE, alice, alice);
        assertEq(vault.balanceOf(feeRecipient), 0);
    }

    function test_feeOnlyOnYieldViaHighWaterMark() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        vm.warp(block.timestamp + 365 days);
        uint256 ta = vault.totalAssets();
        uint256 yieldAmt = ta - 1_000_000 * ONE;
        // expected ~ 940k * (0.4*9% + 0.35*7% + 0.25*5%) = 940k * 7.3% = 68,620
        assertApproxEqRel(yieldAmt, 68_620 * ONE, 1e15);
        vault.accrueFee();
        uint256 feeShares = vault.balanceOf(feeRecipient);
        assertGt(feeShares, 0);
        uint256 feeValue = vault.convertToAssets(feeShares);
        assertApproxEqAbs(feeValue, yieldAmt / 10, 2);
        // alice keeps 90% of yield
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(alice)), 1_000_000 * ONE + yieldAmt * 9 / 10, 2);
        // second accrue with no new yield mints nothing
        vault.accrueFee();
        assertEq(vault.balanceOf(feeRecipient), feeShares);
    }

    function test_feeNotChargedAgainAfterDrawdown() public {
        _deposit(alice, 1_000_000 * ONE);
        usdg.mint(address(vault), 100_000 * ONE); // +10% yield
        vault.accrueFee();
        uint256 feeShares = vault.balanceOf(feeRecipient);
        uint256 hwm = vault.highWaterMarkPps();
        // simulate a loss: burn 50k idle
        vm.prank(address(vault));
        usdg.transfer(address(0xdead), 50_000 * ONE);
        assertLt(vault.pricePerShare(), hwm);
        vault.accrueFee();
        assertEq(vault.balanceOf(feeRecipient), feeShares);
        // recover 30k: still below hwm -> no fee
        usdg.mint(address(vault), 30_000 * ONE);
        vault.accrueFee();
        assertEq(vault.balanceOf(feeRecipient), feeShares);
        // recover past hwm by 20k+: fee only on the part above hwm
        usdg.mint(address(vault), 40_000 * ONE);
        uint256 excessAssets = vault.totalAssets() - hwm * vault.totalSupply() / (1e18 * 1e6);
        vault.accrueFee();
        uint256 newFee = vault.convertToAssets(vault.balanceOf(feeRecipient) - feeShares);
        assertApproxEqAbs(newFee, excessAssets / 10, 2);
    }

    function test_feeAccruesBeforeDepositSoNewDepositorIsNotCharged() public {
        _deposit(alice, 1_000_000 * ONE);
        usdg.mint(address(vault), 100_000 * ONE);
        uint256 bobShares = _deposit(bob, 100_000 * ONE);
        // bob can withdraw ~exactly what he put in
        assertApproxEqAbs(vault.convertToAssets(bobShares), 100_000 * ONE, 2);
    }

    function test_setPerformanceFeeBounds() public {
        vm.expectRevert(MosaicVault.FeeTooHigh.selector);
        vault.setPerformanceFeeBps(3001);
        vault.setPerformanceFeeBps(0);
        _deposit(alice, 1_000 * ONE);
        usdg.mint(address(vault), 100 * ONE);
        vault.accrueFee();
        assertEq(vault.balanceOf(feeRecipient), 0);
    }

    // ---------------- emergency / pause / cap ----------------

    function test_emergencyWithdrawPullsAdapterToIdle() public {
        _deposit(alice, 1_000_000 * ONE);
        _deployAll();
        uint256 held = a0.totalAssets();
        uint256 idle = vault.idleAssets();
        vault.emergencyWithdraw(IPoolAdapter(address(a0)));
        assertEq(a0.totalAssets(), 0);
        assertEq(vault.idleAssets(), idle + held);
        assertEq(vault.totalAssets(), 1_000_000 * ONE);
    }

    function test_pauseBlocksDepositsAndDeployButAllowsWithdraw() public {
        _deposit(alice, 1000 * ONE);
        vault.pause();
        assertEq(vault.maxDeposit(alice), 0);
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(1 * ONE, alice);
        vm.prank(keeper);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deploy();
        vm.prank(alice);
        vault.withdraw(500 * ONE, alice, alice);
        vault.unpause();
        _deposit(alice, 1 * ONE);
    }

    function test_depositCapEnforced() public {
        assertEq(vault.maxDeposit(alice), 2_000_000 * ONE);
        _deposit(alice, 1_500_000 * ONE);
        assertEq(vault.maxDeposit(alice), 500_000 * ONE);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                ERC4626.ERC4626ExceededMaxDeposit.selector, alice, 500_001 * ONE, 500_000 * ONE
            )
        );
        vault.deposit(500_001 * ONE, alice);
        vault.setDepositCap(3_000_000 * ONE);
        _deposit(alice, 500_001 * ONE);
    }

    // ---------------- mock pool sanity ----------------

    function test_mockPoolAccruesInterestAndReportsRate() public {
        assertEq(p0.currentRateBps(), 900);
        assertEq(p0.utilization(), 0);
        vm.prank(alice);
        usdg.approve(address(p0), type(uint256).max);
        vm.prank(alice);
        p0.deposit(100_000 * ONE);
        vm.warp(block.timestamp + 365 days);
        assertApproxEqRel(p0.balanceOf(alice), 109_000 * ONE, 1e15);
        p0.simulateBorrow(50_000 * ONE);
        assertApproxEqAbs(p0.utilization(), 4587, 5); // 50k / 109k
    }

    function test_totalAssetsIsIdlePlusAdapters() public {
        _deposit(alice, 500_000 * ONE);
        _deployAll();
        assertEq(vault.totalAssets(), vault.idleAssets() + a0.totalAssets() + a1.totalAssets() + a2.totalAssets());
    }
}
