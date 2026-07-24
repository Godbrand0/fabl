// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external returns (bytes4);
}

/**
 * FableNFT — ERC-721 weapon NFTs for Fable RPG.
 *
 * Each weapon is its own catalog entry with its own individual AVAX price —
 * no rarity tiers. Admin registers/prices catalog entries via
 * registerWeapon/setWeaponPrice, so new weapons can be added later without
 * a redeploy.
 *
 * mintWeaponWithAvax() is the Tavern Shop's only primary sale path — AVAX
 * goes straight to treasury. The resulting NFT is a normal, fully tradeable
 * ERC-721 that resells for AVAX on FableMarket.
 */
contract FableNFT {
    string public constant name   = "Fable Weapons";
    string public constant symbol = "FWEAP";

    address public admin;
    address public treasury; // receives AVAX from mintWeaponWithAvax
    string public baseURI;   // e.g. https://playfable.xyz/api/nft-metadata/

    uint256 public nextTokenId = 1;
    uint256 public nextWeaponId = 1;

    struct WeaponType {
        string name;
        string weaponType; // "Sword", "Ability", etc — descriptive category, not a price tier
        uint256 damage;
        uint256 dps;
        uint256 avaxCost;  // wei — 0 means not sold for AVAX
        bool active;
    }

    mapping(uint256 => WeaponType) public catalog;  // weaponId => definition
    mapping(uint256 => uint256) public weaponOf;     // tokenId => weaponId

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event WeaponRegistered(uint256 indexed weaponId, string name, uint256 avaxCost);
    event WeaponPriceSet(uint256 indexed weaponId, uint256 avaxCost);
    event WeaponPurchased(address indexed player, uint256 indexed tokenId, uint256 indexed weaponId, uint256 avaxPaid);
    event TreasurySet(address indexed treasury);

    modifier onlyAdmin() { require(msg.sender == admin, "FableNFT: not admin"); _; }

    constructor(address _admin, address _treasury) {
        admin = _admin;
        treasury = _treasury;
    }

    // ── Admin: catalog management ────────────────────────────────────────────
    function registerWeapon(
        string calldata weaponName,
        string calldata weaponType,
        uint256 damage,
        uint256 dps,
        uint256 avaxCost
    ) external onlyAdmin returns (uint256 weaponId) {
        weaponId = nextWeaponId++;
        catalog[weaponId] = WeaponType({
            name: weaponName,
            weaponType: weaponType,
            damage: damage,
            dps: dps,
            avaxCost: avaxCost,
            active: true
        });
        emit WeaponRegistered(weaponId, weaponName, avaxCost);
    }

    function setWeaponPrice(uint256 weaponId, uint256 avaxCost) external onlyAdmin {
        require(catalog[weaponId].active, "FableNFT: unknown weapon");
        catalog[weaponId].avaxCost = avaxCost;
        emit WeaponPriceSet(weaponId, avaxCost);
    }

    function setTreasury(address _treasury) external onlyAdmin {
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setBaseURI(string calldata newURI) external onlyAdmin {
        baseURI = newURI;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "FableNFT: nonexistent token");
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

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

    // Player pays AVAX → NFT minted to their wallet — Tavern Shop primary sale
    function mintWeaponWithAvax(uint256 weaponId) external payable returns (uint256) {
        WeaponType memory wt = catalog[weaponId];
        require(wt.active, "FableNFT: unknown weapon");
        require(wt.avaxCost > 0, "FableNFT: not sold for AVAX");
        require(msg.value == wt.avaxCost, "FableNFT: wrong AVAX amount");

        uint256 tokenId = _mintWeapon(msg.sender, weaponId);

        (bool ok, ) = payable(treasury).call{ value: msg.value }("");
        require(ok, "FableNFT: treasury payment failed");

        emit WeaponPurchased(msg.sender, tokenId, weaponId, wt.avaxCost);
        return tokenId;
    }

    function _mintWeapon(address to, uint256 weaponId) internal returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId);
        weaponOf[tokenId] = weaponId;
        return tokenId;
    }

    // Convenience getter joining a minted token back to its catalog display info
    function weapons(uint256 tokenId) external view returns (
        string memory weaponName, string memory weaponType, uint256 damage, uint256 dps
    ) {
        require(_owners[tokenId] != address(0), "FableNFT: nonexistent token");
        WeaponType memory wt = catalog[weaponOf[tokenId]];
        return (wt.name, wt.weaponType, wt.damage, wt.dps);
    }

    // ── ERC-721 read ─────────────────────────────────────────────────────────
    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "FableNFT: nonexistent token");
        return owner;
    }

    function balanceOf(address owner) public view returns (uint256) {
        require(owner != address(0), "FableNFT: zero address");
        return _balances[owner];
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "FableNFT: nonexistent token");
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner, address operator) public view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return interfaceId == 0x80ac58cd  // ERC-721
            || interfaceId == 0x01ffc9a7; // ERC-165
    }

    // ── ERC-721 write ────────────────────────────────────────────────────────
    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(msg.sender == owner || _operatorApprovals[owner][msg.sender], "FableNFT: not authorized");
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isAuthorized(msg.sender, tokenId), "FableNFT: not authorized");
        require(ownerOf(tokenId) == from, "FableNFT: not owner");
        require(to != address(0), "FableNFT: transfer to zero");

        delete _tokenApprovals[tokenId];
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        uint256 size;
        assembly { size := extcodesize(to) }
        if (size > 0) {
            bytes4 retval = IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data);
            require(retval == IERC721Receiver.onERC721Received.selector, "FableNFT: unsafe recipient");
        }
    }

    function _isAuthorized(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return spender == owner || spender == _tokenApprovals[tokenId] || _operatorApprovals[owner][spender];
    }

    function _mint(address to, uint256 tokenId) internal {
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }
}
