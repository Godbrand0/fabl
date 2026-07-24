// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {FableToken} from "../src/FableToken.sol";
import {FableLeaderboard} from "../src/FableLeaderboard.sol";
import {FableGameSession} from "../src/FableGameSession.sol";
import {FableNFT} from "../src/FableNFT.sol";
import {FableMarket} from "../src/FableMarket.sol";
import {FableShop} from "../src/FableShop.sol";

/**
 * Deploys the full Avalanche contract suite in dependency order:
 * Token -> Leaderboard -> GameSession -> NFT -> Market -> Shop, wires
 * permissions, registers the Tavern weapon catalog, FableShop item/stat
 * prices, and the flat zone entry fee.
 *
 * Required env vars:
 *   PRIVATE_KEY         deployer key (becomes admin on every contract)
 *   GAME_SERVER_WALLET  server key that signs zone-clear attestations
 *                       for FableGameSession.clearZone
 *   TREASURY_WALLET     receives FableNFT/FableMarket AVAX revenue
 *
 * Usage:
 *   forge script script/DeployFable.s.sol:DeployFable \
 *     --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
 *     --broadcast --verify
 */
contract DeployFable is Script {
    // FableShop item IDs (potions/buffs) — kept in sync with lib/nft.ts's FABLE_ITEMS
    uint256 constant ITEM_MINOR_POTION   = 1;
    uint256 constant ITEM_GREATER_POTION = 2;
    uint256 constant ITEM_MEGA_ELIXIR    = 3;
    uint256 constant ITEM_POWER_SURGE    = 4;
    uint256 constant ITEM_IRON_WARD      = 5;

    // FableGameSession zone IDs — kept in sync with lib/nft.ts's ZONE_LEVEL_IDS
    uint256 constant ZONE_EMBER_FIELDS   = 1;
    uint256 constant ZONE_ASHWATER_MARSH = 2;
    uint256 constant ZONE_OBSIDIAN_PEAK  = 3;
    uint256 constant ZONE_SUNFALL_DUNES  = 4;
    uint256 constant ZONE_ENTRY_FEE      = 50 ether;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address gameServer = vm.envAddress("GAME_SERVER_WALLET");
        address treasury = vm.envAddress("TREASURY_WALLET");

        vm.startBroadcast(deployerKey);

        FableToken token = new FableToken(deployer);
        FableLeaderboard leaderboard = new FableLeaderboard(deployer);
        FableGameSession session = new FableGameSession(
            address(token),
            address(leaderboard),
            gameServer,
            deployer
        );
        FableNFT nft = new FableNFT(deployer, treasury);
        FableMarket market = new FableMarket(address(nft), treasury);
        FableShop shop = new FableShop(address(token), deployer);

        // Wire permissions: session/shop may mint or burn FABLE (FableNFT no
        // longer touches FABLE — it's AVAX-only), only the game session may
        // submit leaderboard scores. The deployer (== the app's
        // ADMIN_PRIVATE_KEY server signer) is also authorized directly, kept
        // for routes that mint without going through FableGameSession's
        // clearZone attestation flow.
        token.setGameContract(address(session), true);
        token.setGameContract(address(shop), true);
        token.setGameContract(deployer, true);
        leaderboard.setGameContract(address(session));

        // Flat 50 FABLE entry fee, every zone.
        session.setZoneCost(ZONE_EMBER_FIELDS, ZONE_ENTRY_FEE);
        session.setZoneCost(ZONE_ASHWATER_MARSH, ZONE_ENTRY_FEE);
        session.setZoneCost(ZONE_OBSIDIAN_PEAK, ZONE_ENTRY_FEE);
        session.setZoneCost(ZONE_SUNFALL_DUNES, ZONE_ENTRY_FEE);

        // Tavern weapon catalog — 6 individually priced NFTs, no rarity tiers.
        // weaponId order matches lib/nft.ts's TAVERN_WEAPONS list exactly.
        nft.registerWeapon("Iron Sword",          "Sword",   12, 12, 0.05 ether); // weaponId 1
        nft.registerWeapon("Ember Blade",         "Sword",   15, 15, 0.1  ether); // weaponId 2
        nft.registerWeapon("Obsidian Greatsword", "Sword",   60, 60, 0.3  ether); // weaponId 3
        nft.registerWeapon("Fire Nova",           "Ability", 0,  0,  0.6  ether); // weaponId 4
        nft.registerWeapon("Poison Cloak",        "Ability", 0,  0,  0.7  ether); // weaponId 5
        nft.registerWeapon("Stone Shield",        "Ability", 0,  0,  0.9  ether); // weaponId 6

        // FableShop consumables/buffs (FABLE-priced, no purchase cap — player chooses gear vs. spend)
        shop.setItemPrice(ITEM_MINOR_POTION, 25 ether);
        shop.setItemPrice(ITEM_GREATER_POTION, 50 ether);
        shop.setItemPrice(ITEM_MEGA_ELIXIR, 100 ether);
        shop.setItemPrice(ITEM_POWER_SURGE, 70 ether);
        shop.setItemPrice(ITEM_IRON_WARD, 60 ether);
        shop.setStatPointPrices(15 ether, 30 ether); // first point / every point after

        vm.stopBroadcast();

        console2.log("FableToken:       ", address(token));
        console2.log("FableLeaderboard: ", address(leaderboard));
        console2.log("FableGameSession: ", address(session));
        console2.log("FableNFT:         ", address(nft));
        console2.log("FableMarket:      ", address(market));
        console2.log("FableShop:        ", address(shop));
    }
}
