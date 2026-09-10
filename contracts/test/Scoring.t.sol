// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockLendingPool} from "../src/mocks/MockLendingPool.sol";
import {MockPoolAdapter} from "../src/mocks/MockPoolAdapter.sol";
import {MosaicVault} from "../src/MosaicVault.sol";
import {IPoolAdapter} from "../src/interfaces/IPoolAdapter.sol";

/// @notice Stress for computeTargetWeights(): the cap-and-redistribute loop is the only place
/// where a rounding or convergence slip would hand an adapter weight it may not hold.
contract ScoringTest is Test {
    uint256 constant N = 5;
    MockUSDG usdg;
    MosaicVault vault;
    MockLendingPool[N] pools;
    MockPoolAdapter[N] adapters;
    address keeper = makeAddr("keeper");

    function setUp() public {
        usdg = new MockUSDG();
        vault = new MosaicVault(IERC20(address(usdg)), address(this), address(this));
        for (uint256 i; i < N; ++i) {
            pools[i] = new MockLendingPool(IERC20(address(usdg)), "p", 500 + i * 100);
            adapters[i] = new MockPoolAdapter(address(vault), pools[i]);
            vault.addAdapter(IPoolAdapter(address(adapters[i])));
        }
        vault.setKeeper(keeper, true);
        vault.setScoringEnabled(true);
    }

    function testFuzz_weightsSumAndRespectCaps(uint16[N] memory rates, uint16[N] memory caps) public {
        for (uint256 i; i < N; ++i) {
            rates[i] = uint16(bound(rates[i], 0, 20_000));
            caps[i] = uint16(bound(caps[i], 0, 10_000));
            pools[i].setRateBps(rates[i]);
            vault.setAdapterMaxWeight(IPoolAdapter(address(adapters[i])), caps[i]);
        }

        // Only adapters the scorer would actually fund count towards the book's capacity.
        uint256 scoreSum;
        uint256 capSum;
        for (uint256 i; i < N; ++i) {
            uint256 sc = vault.scoreAdapter(i);
            if (sc == 0) continue;
            scoreSum += sc;
            capSum += caps[i];
        }

        if (scoreSum == 0) {
            vm.expectRevert(MosaicVault.NoScore.selector);
            vault.computeTargetWeights();
            return;
        }
        if (capSum < 10_000) {
            vm.expectRevert(MosaicVault.CapsBelowFull.selector);
            vault.computeTargetWeights();
            return;
        }

        (uint16[] memory w,) = vault.computeTargetWeights();
        uint256 sum;
        for (uint256 i; i < N; ++i) {
            assertLe(w[i], caps[i], "weight above its cap");
            if (vault.scoreAdapter(i) == 0) assertEq(w[i], 0, "unscored adapter funded");
            sum += w[i];
        }
        assertEq(sum, 10_000, "weights must sum to exactly 10000");

        // and the vault accepts what its own scorer produced
        vm.prank(keeper);
        vault.applyScoredWeights();
        assertEq(vault.totalTargetBps(), 10_000);
    }
}
