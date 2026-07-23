// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {FableToken} from "../src/FableToken.sol";
import {FableLeaderboard} from "../src/FableLeaderboard.sol";
import {FableGameSession} from "../src/FableGameSession.sol";
import {FableNFT} from "../src/FableNFT.sol";
import {FableMarket} from "../src/FableMarket.sol";

/**
 * Deploys the full Avalanche contract suite in dependency order:
 * Token -> Leaderboard -> GameSession -> NFT -> Market, then wires
 * the token/leaderboard permissions to the new GameSession address.
 *
 * Required env vars:
 *   PRIVATE_KEY      deployer key (becomes admin on every contract)
 *   GAME_SERVER_WALLET  Privy server wallet that signs checkpoints
 *   TREASURY_WALLET     receives FableMarket's 5% AVAX royalty
 *
 * Usage:
 *   forge script script/DeployFable.s.sol:DeployFable \
 *     --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
 *     --broadcast --verify
 */
contract DeployFable is Script {
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
        FableNFT nft = new FableNFT(address(token), deployer, treasury);
        FableMarket market = new FableMarket(address(nft), treasury);

        // Wire permissions: the game session and NFT contract may mint/burn
        // FABLE, only the game session may submit leaderboard scores. The
        // deployer (== the app's ADMIN_PRIVATE_KEY server signer) is also
        // authorized so the /api/claim-rewards route can mint FABLE for
        // verified zone clears without a full session lifecycle.
        token.setGameContract(address(session), true);
        token.setGameContract(address(nft), true);
        token.setGameContract(deployer, true);
        leaderboard.setGameContract(address(session));

        vm.stopBroadcast();

        console2.log("FableToken:       ", address(token));
        console2.log("FableLeaderboard: ", address(leaderboard));
        console2.log("FableGameSession: ", address(session));
        console2.log("FableNFT:         ", address(nft));
        console2.log("FableMarket:      ", address(market));
    }
}
