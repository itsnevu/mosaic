// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {MosaicVault} from "../src/MosaicVault.sol";
import {IPoolAdapter} from "../src/interfaces/IPoolAdapter.sol";
import {ERC4626PoolAdapter} from "../src/adapters/ERC4626PoolAdapter.sol";

/// @notice Robinhood Chain deployment: the vault plus one ERC4626PoolAdapter per real Morpho
///         vault. Adapters need the vault address at construction, so both go in one broadcast.
///
///   USDG_ADDRESS=0x… VAULT_OWNER=0x… FEE_RECIPIENT=0x… \
///   POOLS=0x…,0x… POOL_NAMES="Steakhouse USDG,Ethena x Steakhouse USDG" WEIGHTS_BPS=6000,4000 \
///   forge script script/DeployRobinhood.s.sol:DeployRobinhood --rpc-url $RPC_URL --broadcast
contract DeployRobinhood is Script {
    function _wire(MosaicVault vault, address usdg, address[] memory pools, string[] memory names, uint256[] memory weights)
        internal
        returns (address[] memory adapters, uint16[] memory w)
    {
        adapters = new address[](pools.length);
        w = new uint16[](pools.length);
        for (uint256 i; i < pools.length; ++i) {
            ERC4626PoolAdapter a = new ERC4626PoolAdapter(address(vault), IERC4626(pools[i]), IERC20(usdg), names[i]);
            adapters[i] = address(a);
            vault.addAdapter(IPoolAdapter(address(a)));
            w[i] = uint16(weights[i]);
        }
        vault.setTargetWeights(w);
    }

    function _configure(MosaicVault vault, address deployer, address owner, address keeper, uint256 depositCap, uint256 bufferBps, uint256 feeBps) internal {
        if (keeper != address(0)) vault.setKeeper(keeper, true);
        if (depositCap != 0) vault.setDepositCap(depositCap);
        if (bufferBps != 0) vault.setBufferTargetBps(uint16(bufferBps));
        if (feeBps != 0) vault.setPerformanceFeeBps(uint16(feeBps));
        vault.pokeRates();
        if (owner != deployer) vault.transferOwnership(owner);
    }

    function _writeJson(MosaicVault vault, address deployer, address usdg, address[] memory pools, string[] memory names, address[] memory adapters, uint16[] memory w) internal {
        string memory poolsJson = "[";
        for (uint256 i; i < pools.length; ++i) {
            poolsJson = string.concat(poolsJson, i == 0 ? "" : ",", _poolJson(names[i], pools[i], adapters[i], w[i]));
        }
        poolsJson = string.concat(poolsJson, "]");
        vm.writeFile(
            "./deployments/production.json",
            string.concat(
                '{"chainId":', vm.toString(block.chainid),
                ',"block":', vm.toString(block.number),
                ',"deployer":"', vm.toString(deployer),
                '","usdg":"', vm.toString(usdg),
                '","vault":"', vm.toString(address(vault)),
                '","pools":', poolsJson, "}"
            )
        );
    }

    function _poolJson(string memory name, address pool, address adapter, uint16 w) internal pure returns (string memory) {
        return string.concat(
            '{"name":"', name, '","pool":"', vm.toString(pool), '","adapter":"', vm.toString(adapter),
            '","targetWeightBps":', vm.toString(w), ',"apyBps":0}'
        );
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address usdg = vm.envAddress("USDG_ADDRESS");
        address owner = vm.envAddress("VAULT_OWNER");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address[] memory pools = vm.envAddress("POOLS", ",");
        string[] memory names = vm.envString("POOL_NAMES", ",");
        uint256[] memory weights = vm.envUint("WEIGHTS_BPS", ",");
        require(pools.length == weights.length && pools.length == names.length, "POOLS/NAMES/WEIGHTS length mismatch");
        require(pools.length > 0, "no pools");

        address keeper = vm.envOr("KEEPER", address(0));
        uint256 depositCap = vm.envOr("DEPOSIT_CAP", uint256(0));
        uint256 bufferBps = vm.envOr("BUFFER_TARGET_BPS", uint256(0));
        uint256 feeBps = vm.envOr("PERFORMANCE_FEE_BPS", uint256(0));

        require(IERC20Metadata(usdg).decimals() == 6, "USDG_ADDRESS: unexpected decimals");
        for (uint256 i; i < pools.length; ++i) {
            require(IERC4626(pools[i]).asset() == usdg, "pool asset is not USDG");
        }

        vm.startBroadcast(pk);
        MosaicVault vault = new MosaicVault(IERC20(usdg), deployer, feeRecipient);
        (address[] memory adapters, uint16[] memory w) = _wire(vault, usdg, pools, names, weights);
        _configure(vault, deployer, owner, keeper, depositCap, bufferBps, feeBps);
        vm.stopBroadcast();

        _writeJson(vault, deployer, usdg, pools, names, adapters, w);
        console.log("Vault", address(vault));
    }
}
