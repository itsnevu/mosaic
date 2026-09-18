// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {MosaicVault} from "../src/MosaicVault.sol";
import {IPoolAdapter} from "../src/interfaces/IPoolAdapter.sol";
import {ERC4626PoolAdapter} from "../src/adapters/ERC4626PoolAdapter.sol";

/// @notice Replace every registered (empty) adapter with a fresh ERC4626PoolAdapter over the same
///         Morpho vault, keeping the weights, then deploy the idle buffer. Rewrites production.json.
contract SwapAdapters is Script {
    function _writeJson(string memory file, string memory json, MosaicVault vault, address usdg, address[] memory pools, string[] memory names, address[] memory fresh, uint16[] memory w) internal {
        string memory poolsJson = "[";
        for (uint256 i; i < pools.length; ++i) {
            poolsJson = string.concat(poolsJson, i == 0 ? "" : ",", _poolJson(names[i], pools[i], fresh[i], w[i]));
        }
        poolsJson = string.concat(poolsJson, "]");
        string memory head = string.concat('{"chainId":', vm.toString(block.chainid), ',"block":', vm.toString(vm.parseJsonUint(json, "$.block")));
        head = string.concat(head, ',"deployer":"', vm.toString(vm.parseJsonAddress(json, "$.deployer")), '","usdg":"', vm.toString(usdg));
        vm.writeFile(file, string.concat(head, '","vault":"', vm.toString(address(vault)), '","pools":', poolsJson, "}"));
    }

    function _poolJson(string memory name, address pool, address adapter, uint16 w) internal pure returns (string memory) {
        return string.concat('{"name":"', name, '","pool":"', vm.toString(pool), '","adapter":"', vm.toString(adapter), '","targetWeightBps":', vm.toString(w), ',"apyBps":0}');
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        string memory file = "./deployments/production.json";
        string memory json = vm.readFile(file);
        MosaicVault vault = MosaicVault(vm.parseJsonAddress(json, "$.vault"));
        address usdg = vm.parseJsonAddress(json, "$.usdg");
        uint256 n = vault.adaptersLength();

        address[] memory pools = new address[](n);
        string[] memory names = new string[](n);
        uint16[] memory w = new uint16[](n);
        address[] memory old = new address[](n);
        for (uint256 i; i < n; ++i) {
            old[i] = address(vault.adapters(i));
            pools[i] = address(ERC4626PoolAdapter(old[i]).pool());
            names[i] = ERC4626PoolAdapter(old[i]).name();
            (, uint16 t, , ) = vault.adapterConfig(old[i]);
            w[i] = t;
        }

        vm.startBroadcast(pk);
        address[] memory fresh = new address[](n);
        for (uint256 i; i < n; ++i) {
            fresh[i] = address(new ERC4626PoolAdapter(address(vault), IERC4626(pools[i]), IERC20(usdg), names[i]));
            vault.addAdapter(IPoolAdapter(fresh[i]));
        }
        uint16[] memory all = new uint16[](2 * n);
        for (uint256 i; i < n; ++i) all[n + i] = w[i];
        vault.setTargetWeights(all);
        for (uint256 i; i < n; ++i) vault.removeAdapter(IPoolAdapter(old[i]));
        vault.deploy();
        vault.pokeRates();
        vm.stopBroadcast();

        _writeJson(file, json, vault, usdg, pools, names, fresh, w);
        console.log("deployed idle; totalAssets", vault.totalAssets(), "idle", vault.idleAssets());
    }
}
