// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockLendingPool} from "../src/mocks/MockLendingPool.sol";
import {MockPoolAdapter} from "../src/mocks/MockPoolAdapter.sol";
import {MosaicVault} from "../src/MosaicVault.sol";
import {IPoolAdapter} from "../src/interfaces/IPoolAdapter.sol";

/// @notice Local (Anvil) deployment: mock USDG, 3 mock pools (9/7/5% APY), 3 adapters, vault.
/// Writes addresses to deployments/local.json for the frontend.
contract Deploy is Script {
    address constant ANVIL_ACCOUNT_1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    uint256 constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    string[3] NAMES = ["Turret", "Pool B", "Pool C"];
    uint16[3] APY = [uint16(900), 700, 500];
    uint16[3] WEIGHTS = [uint16(4000), 3500, 2500];

    MockUSDG usdg;
    MosaicVault vault;
    MockLendingPool[3] pools;
    MockPoolAdapter[3] adapters;

    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", ANVIL_KEY_0);
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        usdg = new MockUSDG();
        vault = new MosaicVault(IERC20(address(usdg)), deployer, deployer);
        uint16[] memory w = new uint16[](3);
        for (uint256 i; i < 3; ++i) {
            pools[i] = new MockLendingPool(IERC20(address(usdg)), NAMES[i], APY[i]);
            adapters[i] = new MockPoolAdapter(address(vault), pools[i]);
            vault.addAdapter(IPoolAdapter(address(adapters[i])));
            w[i] = WEIGHTS[i];
        }
        vault.setTargetWeights(w);
        usdg.mint(deployer, 1_000_000e6);
        usdg.mint(ANVIL_ACCOUNT_1, 1_000_000e6);
        vm.stopBroadcast();

        _writeJson(deployer);
        _log();
    }

    function _writeJson(address deployer) internal {
        string memory poolsJson = "[";
        for (uint256 i; i < 3; ++i) {
            poolsJson = string.concat(
                poolsJson,
                i == 0 ? "" : ",",
                '{"name":"', NAMES[i],
                '","pool":"', vm.toString(address(pools[i])),
                '","adapter":"', vm.toString(address(adapters[i])),
                '","targetWeightBps":', vm.toString(WEIGHTS[i]),
                ',"apyBps":', vm.toString(APY[i]), "}"
            );
        }
        poolsJson = string.concat(poolsJson, "]");
        string memory json = string.concat(
            '{"chainId":', vm.toString(block.chainid),
            ',"deployer":"', vm.toString(deployer),
            '","usdg":"', vm.toString(address(usdg)),
            '","vault":"', vm.toString(address(vault)),
            '","pools":', poolsJson, "}"
        );
        vm.writeFile("./deployments/local.json", json);
    }

    function _log() internal view {
        console.log("USDG  ", address(usdg));
        console.log("Vault ", address(vault));
        for (uint256 i; i < 3; ++i) {
            console.log(NAMES[i], address(pools[i]), "adapter", address(adapters[i]));
        }
    }
}
