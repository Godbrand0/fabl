// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * FableItems — ERC-1155 NFT items + G$ level rewards for Fable RPG.
 *
 * BUYING items (trustless):
 *   gToken.transferAndCall(fableItemsAddress, price, abi.encode(tokenId))
 *   → G$ forwarded to treasury, NFT minted to buyer atomically.
 *
 * EARNING G$ (server-verified):
 *   Admin calls grantLevelReward(player, levelId) after server confirms
 *   the player completed a level for the first time.
 *   → levelClaimed[player][levelId] prevents double-claiming.
 *   → Adding new levels never requires redeployment; just call setLevelReward.
 *
 * Token IDs:   1=Iron Sword  2=Ember Blade  3=Obsidian Greatsword
 *              4=Fire Nova   5=Poison Cloak  6=Stone Shield
 * Level IDs:   1=Ember Fields  2=Ashwater Marsh  3=Obsidian Peak
 *
 * Deployment args:
 *   admin    = deployer wallet
 *   gToken   = 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A (Celo mainnet)
 *   treasury = wallet that receives item purchase G$
 *   baseURI  = "ipfs://bafybeianypngy35lzwcl6myqx6fzbghknu6iire3ezj4jwsieuy6jlbaxu/"
 *
 * After deploy:
 *   1. setPrice for each of the 6 items
 *   2. setLevelReward for each level
 *   3. Fund contract with G$ for reward pool (plain gToken.transfer to this address)
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IIdentity {
    // Returns the root whitelisted address — works for primary AND connected wallets.
    // Returns address(0) if not verified. More reliable than isWhitelisted().
    function getWhitelistedRoot(address account) external view returns (address);
}

interface IERC1155Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4);
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external returns (bytes4);
}

contract FableItems {
    // ── ERC-1155 storage ──────────────────────────────────────────────────────
    mapping(uint256 => mapping(address => uint256)) private _balances;
    mapping(address => mapping(address => bool))    private _operatorApprovals;
    string private _uri;

    // ── Access control ────────────────────────────────────────────────────────
    address public admin;

    // ── Item shop ─────────────────────────────────────────────────────────────
    address public gToken;
    address public treasury;
    mapping(uint256 => uint256) public itemPrice; // tokenId => G$ (18 decimals)

    // ── Level rewards ─────────────────────────────────────────────────────────
    mapping(uint256 => uint256) public levelReward;                       // levelId => G$ (18 decimals)
    mapping(address => mapping(uint256 => bool)) public levelClaimed;     // player => levelId => claimed
    address public identityContract;                                      // GoodDollar IdentityV2 on Celo

    // ── Events ────────────────────────────────────────────────────────────────
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);
    event ItemPurchased(address indexed buyer, uint256 indexed tokenId, uint256 price);
    event LevelRewardClaimed(address indexed player, uint256 indexed levelId, uint256 amount);
    event PriceSet(uint256 indexed tokenId, uint256 price);
    event LevelRewardSet(uint256 indexed levelId, uint256 amount);
    event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury);
    event IdentityContractSet(address indexed identity);

    modifier onlyAdmin() { require(msg.sender == admin, "FableItems: not admin"); _; }

    constructor(address _admin, address _gToken, address _treasury, string memory baseURI, address _identity) {
        admin             = _admin;
        gToken            = _gToken;
        treasury          = _treasury;
        _uri              = baseURI;
        identityContract  = _identity;
    }

    // ── Buy item — user calls gToken.transferAndCall(this, price, abi.encode(tokenId)) ──
    function onTokenTransfer(address from, uint256 value, bytes calldata data) external returns (bool) {
        require(msg.sender == gToken, "FableItems: only G$ accepted");

        uint256 tokenId = abi.decode(data, (uint256));
        require(tokenId >= 1 && tokenId <= 6, "FableItems: unknown tokenId");

        uint256 price = itemPrice[tokenId];
        require(price > 0,      "FableItems: price not set");
        require(value >= price, "FableItems: insufficient G$");

        require(IERC20(gToken).transfer(treasury, value), "FableItems: treasury transfer failed");

        _balances[tokenId][from] += 1;
        emit TransferSingle(address(this), address(0), from, tokenId, 1);
        emit ItemPurchased(from, tokenId, value);

        uint256 size;
        assembly { size := extcodesize(from) }
        if (size > 0) {
            bytes4 retval = IERC1155Receiver(from).onERC1155Received(
                address(this), address(0), tokenId, 1, ""
            );
            require(retval == IERC1155Receiver.onERC1155Received.selector, "FableItems: ERC1155Receiver rejected");
        }
        return true;
    }

    // ── Grant level reward — server calls this after verifying completion ─────
    function grantLevelReward(address player, uint256 levelId) external onlyAdmin {
        require(!levelClaimed[player][levelId], "FableItems: already claimed");
        uint256 amount = levelReward[levelId];
        require(amount > 0, "FableItems: no reward set for level");

        // Require GoodDollar identity verification if identity contract is set
        if (identityContract != address(0)) {
            require(
                IIdentity(identityContract).getWhitelistedRoot(player) != address(0),
                "FableItems: not GoodDollar verified"
            );
        }

        levelClaimed[player][levelId] = true;
        require(IERC20(gToken).transfer(player, amount), "FableItems: reward transfer failed");
        emit LevelRewardClaimed(player, levelId, amount);
    }

    // ── ERC-1155 read functions ───────────────────────────────────────────────
    function balanceOf(address account, uint256 id) public view returns (uint256) {
        require(account != address(0), "FableItems: zero address");
        return _balances[id][account];
    }

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        public view returns (uint256[] memory)
    {
        require(accounts.length == ids.length, "FableItems: length mismatch");
        uint256[] memory batchBalances = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; ++i) {
            batchBalances[i] = _balances[ids[i]][accounts[i]];
        }
        return batchBalances;
    }

    function uri(uint256 tokenId) public view returns (string memory) {
        return string(abi.encodePacked(_uri, _toString(tokenId), ".json"));
    }

    function isApprovedForAll(address account, address operator) public view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return
            interfaceId == 0xd9b67a26 || // ERC-1155
            interfaceId == 0x0e89341c || // ERC-1155 Metadata
            interfaceId == 0x01ffc9a7;   // ERC-165
    }

    // ── ERC-1155 write functions ──────────────────────────────────────────────
    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external {
        require(from == msg.sender || _operatorApprovals[from][msg.sender], "FableItems: not authorized");
        require(to != address(0), "FableItems: transfer to zero");
        require(_balances[id][from] >= amount, "FableItems: insufficient balance");
        _balances[id][from] -= amount;
        _balances[id][to]   += amount;
        emit TransferSingle(msg.sender, from, to, id, amount);
    }

    // ── Admin functions ───────────────────────────────────────────────────────
    function setPrice(uint256 tokenId, uint256 price) external onlyAdmin {
        require(tokenId >= 1 && tokenId <= 6, "FableItems: unknown tokenId");
        itemPrice[tokenId] = price;
        emit PriceSet(tokenId, price);
    }

    // No upper bound on levelId — new levels never require redeployment
    function setLevelReward(uint256 levelId, uint256 amount) external onlyAdmin {
        levelReward[levelId] = amount;
        emit LevelRewardSet(levelId, amount);
    }

    function setTreasury(address newTreasury) external onlyAdmin {
        emit TreasuryChanged(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setBaseURI(string calldata newURI) external onlyAdmin {
        _uri = newURI;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }

    function setIdentityContract(address _identity) external onlyAdmin {
        identityContract = _identity;
        emit IdentityContractSet(_identity);
    }

    // Withdraw unspent G$ from the reward pool back to admin
    function withdrawRewardPool(uint256 amount) external onlyAdmin {
        require(IERC20(gToken).transfer(admin, amount), "FableItems: withdraw failed");
    }

    // ── Utility ───────────────────────────────────────────────────────────────
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
