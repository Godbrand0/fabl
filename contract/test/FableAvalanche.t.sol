// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FableToken.sol";
import "../src/FableLeaderboard.sol";
import "../src/FableGameSession.sol";
import "../src/FableNFT.sol";
import "../src/FableMarket.sol";
import "../src/FableShop.sol";

contract FableAvalancheTest is Test {
    FableToken       token;
    FableLeaderboard leaderboard;
    FableGameSession session;
    FableNFT         nft;
    FableMarket      market;
    FableShop        shop;

    address admin      = makeAddr("admin");
    uint256 gameServerKey = 0xA11CE;
    address gameServer  = vm.addr(gameServerKey);
    address treasury    = makeAddr("treasury");
    address player1     = makeAddr("player1");
    address player2     = makeAddr("player2");

    uint256 IRON_SWORD; // weaponId, registered in setUp

    function setUp() public {
        vm.startPrank(admin);
        token = new FableToken(admin);
        leaderboard = new FableLeaderboard(admin);
        session = new FableGameSession(address(token), address(leaderboard), gameServer, admin);
        nft = new FableNFT(admin, treasury);
        market = new FableMarket(address(nft), treasury);
        shop = new FableShop(address(token), admin);

        token.setGameContract(address(session), true);
        token.setGameContract(address(shop), true);
        leaderboard.setGameContract(address(session));

        IRON_SWORD = nft.registerWeapon("Iron Sword", "Sword", 12, 12, 0.05 ether);

        shop.setItemPrice(1, 25 ether); // minor potion
        shop.setStatPointPrices(15 ether, 30 ether);

        session.setZoneReward(1, 500 ether); // fixed FABLE reward, zone 1
        session.setContinueFee(30 ether);
        vm.stopPrank();
    }

    // ── FableToken: soulbound ────────────────────────────────────────────────
    function test_TokenIsSoulbound() public {
        vm.prank(address(session));
        token.mintReward(player1, 100 ether);

        vm.prank(player1);
        vm.expectRevert("FableToken: non-transferable");
        token.transfer(player2, 10 ether);
    }

    function test_OnlyGameContractCanMintOrBurn() public {
        vm.prank(player1);
        vm.expectRevert("FableToken: not game contract");
        token.mintReward(player1, 1 ether);
    }

    // ── FableGameSession: enter + server-attested score ──────────────────────
    uint8 constant ACTION_CLEAR      = 1;
    uint8 constant ACTION_CHECKPOINT = 2;
    uint8 constant ACTION_CONTINUE   = 3;

    function _sign(uint8 action, address player, uint256 zoneId, uint256 score, uint256 deadline)
        internal view returns (bytes memory)
    {
        bytes32 hash = keccak256(
            abi.encodePacked(address(session), block.chainid, action, player, zoneId, score, deadline)
        );
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(gameServerKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function _signClear(address player, uint256 zoneId, uint256 score, uint256 deadline)
        internal view returns (bytes memory)
    {
        return _sign(ACTION_CLEAR, player, zoneId, score, deadline);
    }

    function test_FullZoneClearMintsFixedRewardAndSubmitsScore() public {
        vm.prank(player1);
        session.enterZone(1); // free zone

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signClear(player1, 1, 130, deadline); // 130 = sum of enemy points killed

        vm.prank(player1);
        session.clearZone(1, 130, deadline, sig);

        assertEq(token.balanceOf(player1), 500 ether); // fixed zone reward, not the score
        assertEq(leaderboard.playerBestScore(leaderboard.currentWeek(), player1), 130);
    }

    function test_ClearZoneRejectsBadSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, keccak256("wrong"));
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(player1);
        vm.expectRevert("FableGameSession: bad attestation");
        session.clearZone(1, 130, deadline, sig);
    }

    function test_ClearZoneRejectsExpiredAttestation() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signClear(player1, 1, 130, deadline);

        vm.warp(deadline + 1);
        vm.prank(player1);
        vm.expectRevert("FableGameSession: attestation expired");
        session.clearZone(1, 130, deadline, sig);
    }

    function test_ClearZoneIsRepeatableButRewardMintsOnce() public {
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(player1);
        session.clearZone(1, 130, deadline, _signClear(player1, 1, 130, deadline));
        assertEq(token.balanceOf(player1), 500 ether);

        // Replay the zone for a better score — no server involvement needed
        // to re-verify anything on-chain beyond the signature itself.
        vm.prank(player1);
        session.clearZone(1, 210, deadline, _signClear(player1, 1, 210, deadline));

        assertEq(token.balanceOf(player1), 500 ether); // reward did NOT mint a second time
        assertEq(leaderboard.playerBestScore(leaderboard.currentWeek(), player1), 210); // best score updated
    }

    function test_SubmitCheckpointBanksScoreWithNoFable() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ACTION_CHECKPOINT, player1, 1, 60, deadline);

        vm.prank(player1);
        session.submitCheckpoint(1, 60, deadline, sig);

        assertEq(token.balanceOf(player1), 0); // no FABLE for a checkpoint
        assertEq(leaderboard.playerBestScore(leaderboard.currentWeek(), player1), 60);
        assertFalse(session.claimed(player1, 1)); // zone still not "cleared"
    }

    function test_ContinueRunBurnsFeeAndBanksScore() public {
        vm.prank(address(session));
        token.mintReward(player1, 30 ether);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ACTION_CONTINUE, player1, 1, 40, deadline);

        vm.prank(player1);
        session.continueRun(1, 40, deadline, sig);

        assertEq(token.balanceOf(player1), 0); // 30 FABLE continue fee burned
        assertEq(leaderboard.playerBestScore(leaderboard.currentWeek(), player1), 40);
    }

    function test_ContinueRunRejectsInsufficientFable() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ACTION_CONTINUE, player1, 1, 40, deadline);

        vm.prank(player1);
        vm.expectRevert("FableToken: insufficient balance");
        session.continueRun(1, 40, deadline, sig);
    }

    // A signature issued for one action (e.g. a checkpoint on death) must never
    // be replayable into clearZone — that would mint a zone's FABLE reward for
    // a run that never actually killed the boss.
    function test_CheckpointSignatureCannotBeReplayedAsClear() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory checkpointSig = _sign(ACTION_CHECKPOINT, player1, 1, 130, deadline);

        vm.prank(player1);
        vm.expectRevert("FableGameSession: bad attestation");
        session.clearZone(1, 130, deadline, checkpointSig);
    }

    function test_ClearSignatureCannotBeReplayedAsContinue() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory clearSig = _sign(ACTION_CLEAR, player1, 1, 130, deadline);

        vm.prank(address(session));
        token.mintReward(player1, 30 ether);

        vm.prank(player1);
        vm.expectRevert("FableGameSession: bad attestation");
        session.continueRun(1, 130, deadline, clearSig);
    }

    function test_EnterZoneChargesFeeOnceThenFreeOnReplay() public {
        vm.prank(admin);
        session.setZoneCost(2, 10 ether);

        vm.prank(address(session));
        token.mintReward(player1, 10 ether);

        vm.prank(player1);
        session.enterZone(2);
        assertEq(token.balanceOf(player1), 0); // one-off fee charged

        vm.prank(player1);
        session.enterZone(2); // replay — no balance to burn, must not revert
        assertEq(token.balanceOf(player1), 0);
    }

    // ── FableNFT + FableMarket: trades settle in AVAX only ──────────────────
    function test_BuyThenSellWeaponForAvax() public {
        vm.deal(player1, 1 ether);

        vm.prank(player1);
        uint256 tokenId = nft.mintWeaponWithAvax{ value: 0.05 ether }(IRON_SWORD);

        assertEq(nft.ownerOf(tokenId), player1);

        // List for 2 AVAX
        vm.startPrank(player1);
        nft.approve(address(market), tokenId);
        market.listNFT(tokenId, 2 ether);
        vm.stopPrank();

        // Buyer pays AVAX, not FABLE
        vm.deal(player2, 2 ether);
        vm.prank(player2);
        market.buyNFT{ value: 2 ether }(tokenId);

        assertEq(nft.ownerOf(tokenId), player2);
        assertEq(player1.balance, 0.95 ether + 1.9 ether); // 1 AVAX - 0.05 mint cost, + 95% resale
        assertEq(treasury.balance, 0.05 ether + 0.1 ether); // mint price + 5% resale royalty
    }

    function test_TavernShopMintsWeaponForAvaxToTreasury() public {
        vm.deal(player1, 1 ether);

        vm.prank(player1);
        uint256 tokenId = nft.mintWeaponWithAvax{ value: 0.05 ether }(IRON_SWORD);

        assertEq(nft.ownerOf(tokenId), player1);
        assertEq(treasury.balance, 0.05 ether);
        assertEq(token.balanceOf(player1), 0); // no FABLE touched
    }

    function test_TavernShopRejectsWrongAvaxAmount() public {
        vm.deal(player1, 1 ether);
        vm.prank(player1);
        vm.expectRevert("FableNFT: wrong AVAX amount");
        nft.mintWeaponWithAvax{ value: 0.01 ether }(IRON_SWORD);
    }

    function test_MintWeaponRejectsUnknownWeaponId() public {
        vm.deal(player1, 1 ether);
        vm.prank(player1);
        vm.expectRevert("FableNFT: unknown weapon");
        nft.mintWeaponWithAvax{ value: 0.05 ether }(999);
    }

    function test_BuyNFTRejectsWrongAvaxAmount() public {
        vm.deal(player1, 1 ether);
        vm.prank(player1);
        uint256 tokenId = nft.mintWeaponWithAvax{ value: 0.05 ether }(IRON_SWORD);

        vm.startPrank(player1);
        nft.approve(address(market), tokenId);
        market.listNFT(tokenId, 2 ether);
        vm.stopPrank();

        vm.deal(player2, 1 ether);
        vm.prank(player2);
        vm.expectRevert("FableMarket: wrong AVAX amount");
        market.buyNFT{ value: 1 ether }(tokenId);
    }

    // ── FableShop: spend FABLE on consumables + stat points ─────────────────
    function test_BuyItemBurnsFable() public {
        vm.prank(address(session));
        token.mintReward(player1, 25 ether);

        vm.prank(player1);
        shop.buyItem(1); // minor potion

        assertEq(token.balanceOf(player1), 0);
    }

    function test_BuyItemRejectsUnknownItem() public {
        vm.prank(address(session));
        token.mintReward(player1, 100 ether);

        vm.prank(player1);
        vm.expectRevert("FableShop: unknown item");
        shop.buyItem(999);
    }

    function test_StatPointFirstCheaperThanSubsequent() public {
        vm.prank(address(session));
        token.mintReward(player1, 100 ether);

        vm.prank(player1);
        shop.buyStatPoint(); // costs 15
        assertEq(token.balanceOf(player1), 85 ether);

        vm.prank(player1);
        shop.buyStatPoint(); // costs 30
        assertEq(token.balanceOf(player1), 55 ether);

        assertEq(shop.statPointsBought(player1), 2);
    }

    // ── FableLeaderboard: weekly payout ──────────────────────────────────────
    function test_WeeklyPrizeDistribution() public {
        vm.prank(address(session));
        leaderboard.submitScore(player1, 100 ether, 1);
        vm.prank(address(session));
        leaderboard.submitScore(player2, 50 ether, 1);

        uint256 week = leaderboard.currentWeek();
        vm.warp(block.timestamp + 8 days);

        vm.deal(admin, 10 ether);
        vm.prank(admin);
        leaderboard.distributeWeeklyPrizes{ value: 10 ether }(week);

        assertEq(player1.balance, 1.2 ether); // rank 1 = 1200 bps
        assertEq(player2.balance, 0.8 ether); // rank 2 = 800 bps
    }
}
