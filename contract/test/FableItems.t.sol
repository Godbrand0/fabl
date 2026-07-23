// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FableItems.sol";

// ── Mock G$ token ─────────────────────────────────────────────────────────────
contract MockGToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    // Simulate transferAndCall → calls onTokenTransfer on target
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "insufficient");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        FableItems(to).onTokenTransfer(msg.sender, value, data);
        return true;
    }
}

// ── Mock GoodDollar Identity ──────────────────────────────────────────────────
contract MockIdentity {
    mapping(address => bool) public whitelisted;
    function whitelist(address user) external { whitelisted[user] = true; }
    function getWhitelistedRoot(address user) external view returns (address) {
        return whitelisted[user] ? user : address(0);
    }
}

// ── ERC-1155 receiver (accepts) ───────────────────────────────────────────────
contract AcceptingReceiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external pure returns (bytes4)
    { return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)")); }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure returns (bytes4)
    { return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)")); }
}

// ── Main test suite ───────────────────────────────────────────────────────────
contract FableItemsTest is Test {
    FableItems  items;
    MockGToken  gToken;
    MockIdentity identity;

    address admin    = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address player1  = makeAddr("player1");
    address player2  = makeAddr("player2");
    address stranger = makeAddr("stranger");

    string constant BASE_URI = "ipfs://testCID/";
    uint256 constant PRICE   = 2193 ether; // 2193 G$ (18 decimals)
    uint256 constant REWARD  = 500 ether;  // 500 G$

    event ItemPurchased(address indexed buyer, uint256 indexed tokenId, uint256 price);
    event LevelRewardClaimed(address indexed player, uint256 indexed levelId, uint256 amount);
    event PriceSet(uint256 indexed tokenId, uint256 price);
    event LevelRewardSet(uint256 indexed levelId, uint256 amount);

    function setUp() public {
        gToken   = new MockGToken();
        identity = new MockIdentity();

        items = new FableItems(admin, address(gToken), treasury, BASE_URI, address(identity));

        // Set price for token 1
        vm.prank(admin);
        items.setPrice(1, PRICE);

        // Set level 1 reward and fund contract
        vm.prank(admin);
        items.setLevelReward(1, REWARD);
        gToken.mint(address(items), REWARD * 10); // fund reward pool
    }

    // ── Deployment ──────────────────────────────────────────────────────────────

    function test_deployment() public view {
        assertEq(items.admin(),            admin);
        assertEq(items.gToken(),           address(gToken));
        assertEq(items.treasury(),         treasury);
        assertEq(items.identityContract(), address(identity));
        assertEq(items.uri(1),             string.concat(BASE_URI, "1.json"));
        assertEq(items.uri(6),             string.concat(BASE_URI, "6.json"));
    }

    // ── onTokenTransfer (buy item) ──────────────────────────────────────────────

    function test_buy_mintsNFTAndForwardsPayment() public {
        gToken.mint(player1, PRICE);
        bytes memory data = abi.encode(uint256(1));

        vm.expectEmit(true, true, false, true);
        emit ItemPurchased(player1, 1, PRICE);

        vm.prank(player1);
        gToken.transferAndCall(address(items), PRICE, data);

        assertEq(items.balanceOf(player1, 1), 1);
        assertEq(gToken.balanceOf(treasury),  PRICE);
        assertEq(gToken.balanceOf(player1),   0);
    }

    function test_buy_revert_wrongCaller() public {
        vm.prank(stranger);
        vm.expectRevert("FableItems: only G$ accepted");
        items.onTokenTransfer(player1, PRICE, abi.encode(uint256(1)));
    }

    function test_buy_revert_priceNotSet() public {
        gToken.mint(player1, PRICE);
        vm.prank(player1);
        vm.expectRevert("FableItems: price not set");
        gToken.transferAndCall(address(items), PRICE, abi.encode(uint256(2))); // token 2 has no price
    }

    function test_buy_revert_insufficientPayment() public {
        gToken.mint(player1, PRICE - 1);
        vm.prank(player1);
        vm.expectRevert("FableItems: insufficient G$");
        gToken.transferAndCall(address(items), PRICE - 1, abi.encode(uint256(1)));
    }

    function test_buy_revert_unknownTokenId() public {
        gToken.mint(player1, PRICE);
        vm.prank(player1);
        vm.expectRevert("FableItems: unknown tokenId");
        gToken.transferAndCall(address(items), PRICE, abi.encode(uint256(7)));
    }

    function test_buy_multiplePlayers() public {
        gToken.mint(player1, PRICE);
        gToken.mint(player2, PRICE);
        vm.prank(player1);
        gToken.transferAndCall(address(items), PRICE, abi.encode(uint256(1)));
        vm.prank(player2);
        gToken.transferAndCall(address(items), PRICE, abi.encode(uint256(1)));
        assertEq(items.balanceOf(player1, 1), 1);
        assertEq(items.balanceOf(player2, 1), 1);
        assertEq(gToken.balanceOf(treasury),  PRICE * 2);
    }

    // ── grantLevelReward ────────────────────────────────────────────────────────

    function test_grantLevelReward_transfersAndMarksAsClaimed() public {
        identity.whitelist(player1);

        vm.expectEmit(true, true, false, true);
        emit LevelRewardClaimed(player1, 1, REWARD);

        vm.prank(admin);
        items.grantLevelReward(player1, 1);

        assertEq(gToken.balanceOf(player1),        REWARD);
        assertTrue(items.levelClaimed(player1, 1));
    }

    function test_grantLevelReward_revert_alreadyClaimed() public {
        identity.whitelist(player1);
        vm.prank(admin);
        items.grantLevelReward(player1, 1);

        vm.prank(admin);
        vm.expectRevert("FableItems: already claimed");
        items.grantLevelReward(player1, 1);
    }

    function test_grantLevelReward_revert_notAdmin() public {
        identity.whitelist(player1);
        vm.prank(stranger);
        vm.expectRevert("FableItems: not admin");
        items.grantLevelReward(player1, 1);
    }

    function test_grantLevelReward_revert_noRewardSet() public {
        identity.whitelist(player1);
        vm.prank(admin);
        vm.expectRevert("FableItems: no reward set for level");
        items.grantLevelReward(player1, 99);
    }

    function test_grantLevelReward_revert_notVerified() public {
        // player1 is NOT whitelisted in identity
        vm.prank(admin);
        vm.expectRevert("FableItems: not GoodDollar verified");
        items.grantLevelReward(player1, 1);
    }

    function test_grantLevelReward_skipsIdentityCheckWhenUnset() public {
        // Deploy a fresh contract with no identity contract
        FableItems noIdentity = new FableItems(admin, address(gToken), treasury, BASE_URI, address(0));
        gToken.mint(address(noIdentity), REWARD);
        vm.prank(admin);
        noIdentity.setLevelReward(1, REWARD);

        // Should succeed even without identity check
        vm.prank(admin);
        noIdentity.grantLevelReward(player1, 1);
        assertEq(gToken.balanceOf(player1), REWARD);
    }

    function test_grantLevelReward_differentPlayersCanClaimSameLevel() public {
        identity.whitelist(player1);
        identity.whitelist(player2);
        vm.prank(admin);
        items.grantLevelReward(player1, 1);
        vm.prank(admin);
        items.grantLevelReward(player2, 1);
        assertEq(gToken.balanceOf(player1), REWARD);
        assertEq(gToken.balanceOf(player2), REWARD);
    }

    // ── Admin functions ─────────────────────────────────────────────────────────

    function test_setPrice_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit PriceSet(2, 4386 ether);
        vm.prank(admin);
        items.setPrice(2, 4386 ether);
        assertEq(items.itemPrice(2), 4386 ether);
    }

    function test_setPrice_revert_notAdmin() public {
        vm.prank(stranger);
        vm.expectRevert("FableItems: not admin");
        items.setPrice(1, 100 ether);
    }

    function test_setLevelReward_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit LevelRewardSet(2, 1000 ether);
        vm.prank(admin);
        items.setLevelReward(2, 1000 ether);
        assertEq(items.levelReward(2), 1000 ether);
    }

    function test_setIdentityContract() public {
        MockIdentity newId = new MockIdentity();
        vm.prank(admin);
        items.setIdentityContract(address(newId));
        assertEq(items.identityContract(), address(newId));
    }

    function test_setIdentityContract_revert_notAdmin() public {
        vm.prank(stranger);
        vm.expectRevert("FableItems: not admin");
        items.setIdentityContract(address(identity));
    }

    function test_setTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(admin);
        items.setTreasury(newTreasury);
        assertEq(items.treasury(), newTreasury);
    }

    function test_transferAdmin() public {
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        items.transferAdmin(newAdmin);
        assertEq(items.admin(), newAdmin);

        vm.prank(admin);
        vm.expectRevert("FableItems: not admin");
        items.setPrice(1, 1 ether);
    }

    // ── ERC-1155 ────────────────────────────────────────────────────────────────

    function test_balanceOf_zeroAddress_reverts() public {
        vm.expectRevert("FableItems: zero address");
        items.balanceOf(address(0), 1);
    }

    function test_safeTransferFrom() public {
        gToken.mint(player1, PRICE);
        vm.prank(player1);
        gToken.transferAndCall(address(items), PRICE, abi.encode(uint256(1)));

        vm.prank(player1);
        items.safeTransferFrom(player1, player2, 1, 1, "");
        assertEq(items.balanceOf(player1, 1), 0);
        assertEq(items.balanceOf(player2, 1), 1);
    }

    function test_safeTransferFrom_revert_notAuthorized() public {
        gToken.mint(player1, PRICE);
        vm.prank(player1);
        gToken.transferAndCall(address(items), PRICE, abi.encode(uint256(1)));

        vm.prank(stranger);
        vm.expectRevert("FableItems: not authorized");
        items.safeTransferFrom(player1, player2, 1, 1, "");
    }

    function test_withdrawRewardPool() public {
        uint256 poolBefore = gToken.balanceOf(address(items));
        vm.prank(admin);
        items.withdrawRewardPool(poolBefore);
        assertEq(gToken.balanceOf(admin),          poolBefore);
        assertEq(gToken.balanceOf(address(items)), 0);
    }

    function test_withdrawRewardPool_revert_notAdmin() public {
        vm.prank(stranger);
        vm.expectRevert("FableItems: not admin");
        items.withdrawRewardPool(1 ether);
    }

    function test_supportsInterface() public view {
        assertTrue(items.supportsInterface(0xd9b67a26));  // ERC-1155
        assertTrue(items.supportsInterface(0x0e89341c));  // ERC-1155 Metadata
        assertTrue(items.supportsInterface(0x01ffc9a7));  // ERC-165
        assertFalse(items.supportsInterface(0xdeadbeef));
    }
}
