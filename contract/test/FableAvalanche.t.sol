// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FableToken.sol";
import "../src/FableLeaderboard.sol";
import "../src/FableGameSession.sol";
import "../src/FableNFT.sol";
import "../src/FableMarket.sol";

contract FableAvalancheTest is Test {
    FableToken       token;
    FableLeaderboard leaderboard;
    FableGameSession session;
    FableNFT         nft;
    FableMarket      market;

    address admin      = makeAddr("admin");
    address gameServer  = makeAddr("gameServer");
    address treasury    = makeAddr("treasury");
    address player1     = makeAddr("player1");
    address player2     = makeAddr("player2");

    function setUp() public {
        vm.startPrank(admin);
        token = new FableToken(admin);
        leaderboard = new FableLeaderboard(admin);
        session = new FableGameSession(address(token), address(leaderboard), gameServer, admin);
        nft = new FableNFT(address(token), admin, treasury);
        market = new FableMarket(address(nft), treasury);

        token.setGameContract(address(session), true);
        token.setGameContract(address(nft), true);
        leaderboard.setGameContract(address(session));
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

    // ── FableGameSession: full run lifecycle ────────────────────────────────
    function test_FullZoneClearMintsFableAndSubmitsScore() public {
        vm.prank(player1);
        bytes32 sessionId = session.enterZone(1); // free zone

        vm.prank(gameServer);
        session.checkpoint(sessionId, 50, 20 ether);

        vm.prank(gameServer);
        session.checkpoint(sessionId, 80, 45 ether);

        vm.prank(player1);
        session.clearZone(sessionId);

        assertEq(token.balanceOf(player1), 45 ether);
        assertEq(leaderboard.playerBestScore(leaderboard.currentWeek(), player1), 45 ether);
    }

    function test_DeathSavesHalfEarnedFable() public {
        vm.prank(player1);
        bytes32 sessionId = session.enterZone(1);

        vm.prank(gameServer);
        session.checkpoint(sessionId, 40, 20 ether);

        vm.prank(player1);
        session.sessionAborted(sessionId);

        assertEq(token.balanceOf(player1), 10 ether);
    }

    function test_EliteZoneEntryBurnsFable() public {
        vm.prank(admin);
        session.setZoneCost(2, 10 ether);

        vm.prank(address(session));
        token.mintReward(player1, 10 ether);

        vm.prank(player1);
        session.enterZone(2);

        assertEq(token.balanceOf(player1), 0);
    }

    // ── FableNFT + FableMarket: trades settle in AVAX, never FABLE ─────────────
    function test_ForgeThenSellWeaponForAvax() public {
        // Player earns and forges a common weapon (burns 50 FABLE)
        vm.prank(address(session));
        token.mintReward(player1, 50 ether);

        vm.prank(player1);
        uint256 tokenId = nft.mintWeapon("Iron Sword", FableNFT.Rarity.COMMON, 12, 10, "Sword");

        assertEq(nft.ownerOf(tokenId), player1);
        assertEq(token.balanceOf(player1), 0);

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
        assertEq(player1.balance, 1.9 ether);   // 95% to seller
        assertEq(treasury.balance, 0.1 ether);  // 5% royalty
    }

    function test_TavernShopMintsWeaponForAvaxToTreasury() public {
        vm.deal(player1, 1 ether);

        vm.prank(player1);
        uint256 tokenId = nft.mintWeaponWithAvax{ value: 0.05 ether }(
            "Iron Sword", FableNFT.Rarity.COMMON, 12, 10, "Sword"
        );

        assertEq(nft.ownerOf(tokenId), player1);
        assertEq(treasury.balance, 0.05 ether);
        assertEq(token.balanceOf(player1), 0); // no FABLE touched
    }

    function test_TavernShopRejectsWrongAvaxAmount() public {
        vm.deal(player1, 1 ether);
        vm.prank(player1);
        vm.expectRevert("FableNFT: wrong AVAX amount");
        nft.mintWeaponWithAvax{ value: 0.01 ether }("Iron Sword", FableNFT.Rarity.COMMON, 12, 10, "Sword");
    }

    function test_BuyNFTRejectsWrongAvaxAmount() public {
        vm.prank(address(session));
        token.mintReward(player1, 50 ether);
        vm.prank(player1);
        uint256 tokenId = nft.mintWeapon("Iron Sword", FableNFT.Rarity.COMMON, 12, 10, "Sword");

        vm.startPrank(player1);
        nft.approve(address(market), tokenId);
        market.listNFT(tokenId, 2 ether);
        vm.stopPrank();

        vm.deal(player2, 1 ether);
        vm.prank(player2);
        vm.expectRevert("FableMarket: wrong AVAX amount");
        market.buyNFT{ value: 1 ether }(tokenId);
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
