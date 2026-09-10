// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MosaicVault} from "../src/MosaicVault.sol";
import {IPoolAdapter} from "../src/interfaces/IPoolAdapter.sol";

/// @notice Production deployment against a real USDG and real, already-deployed pool adapters.
/// Nothing here is mocked and no venue is assumed: the adapters are supplied by address, so this
/// script is the same whether the venue is Turret or anything else that speaks IPoolAdapter.
///
///   USDG_ADDRESS=0x… VAULT_OWNER=0x… FEE_RECIPIENT=0x… \
///   ADAPTERS=0x…,0x… WEIGHTS_BPS=6000,4000 \
///   forge script script/DeployProduction.s.sol:DeployProduction --rpc-url $RPC_URL --broadcast --verify
///
/// The deployer holds ownership only long enough to register adapters and weights, then hands it
/// to VAULT_OWNER (use a multisig). Addresses are written to deployments/production.json.
contract DeployProduction is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address usdg = vm.envAddress("USDG_ADDRESS");
        address owner = vm.envAddress("VAULT_OWNER");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address[] memory adapters = vm.envAddress("ADAPTERS", ",");
        uint256[] memory weights = vm.envUint("WEIGHTS_BPS", ",");
        require(adapters.length == weights.length, "ADAPTERS/WEIGHTS_BPS length mismatch");
        require(adapters.length > 0, "no adapters");

        address keeper = vm.envOr("KEEPER", address(0));
        uint256 depositCap = vm.envOr("DEPOSIT_CAP", uint256(0));
        uint256 bufferBps = vm.envOr("BUFFER_TARGET_BPS", uint256(0));
        uint256 feeBps = vm.envOr("PERFORMANCE_FEE_BPS", uint256(0));

        require(IERC20Metadata(usdg).decimals() == 6, "USDG_ADDRESS: unexpected decimals");

        vm.startBroadcast(pk);
        // Own it through configuration, then hand over.
        MosaicVault vault = new MosaicVault(IERC20(usdg), deployer, feeRecipient);

        uint16[] memory w = new uint16[](adapters.length);
        for (uint256 i; i < adapters.length; ++i) {
            require(IPoolAdapter(adapters[i]).asset() == usdg, "adapter asset mismatch");
            vault.addAdapter(IPoolAdapter(adapters[i]));
            w[i] = uint16(weights[i]);
        }
        vault.setTargetWeights(w);

        if (keeper != address(0)) vault.setKeeper(keeper, true);
        if (depositCap != 0) vault.setDepositCap(depositCap);
        if (bufferBps != 0) vault.setBufferTargetBps(uint16(bufferBps));
        if (feeBps != 0) vault.setPerformanceFeeBps(uint16(feeBps));
        // Seed the rate history so the first rebalance plans on real numbers.
        vault.pokeRates();

        if (owner != deployer) vault.transferOwnership(owner);
        vm.stopBroadcast();

        _writeJson(vault, usdg, owner, adapters, w);
        console.log("Vault  ", address(vault));
        console.log("Owner  ", owner);
        console.log("USDG   ", usdg);
    }

    function _writeJson(
        MosaicVault vault,
        address usdg,
        address owner,
        address[] memory adapters,
        uint16[] memory w
    ) internal {
        string memory pools = "[";
        for (uint256 i; i < adapters.length; ++i) {
            pools = string.concat(
                pools,
                i == 0 ? "" : ",",
                '{"name":"Pool ', vm.toString(i + 1),
                '","pool":"', vm.toString(adapters[i]),
                '","adapter":"', vm.toString(adapters[i]),
                '","targetWeightBps":', vm.toString(w[i]),
                ',"apyBps":', vm.toString(IPoolAdapter(adapters[i]).currentRateBps()), "}"
            );
        }
        pools = string.concat(pools, "]");
        vm.writeFile(
            "./deployments/production.json",
            string.concat(
                '{"chainId":', vm.toString(block.chainid),
                ',"deployer":"', vm.toString(owner),
                '","usdg":"', vm.toString(usdg),
                '","vault":"', vm.toString(address(vault)),
                '","pools":', pools, "}"
            )
        );
    }
}
