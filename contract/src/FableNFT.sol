// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IFableToken.sol";

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external returns (bytes4);
}

/**
 * FableNFT — ERC-721 weapon NFTs for Fable RPG.
 *
 * Weapons are sold for native AVAX, priced by rarity tier — this is the
 * Tavern Shop's primary sale, paid straight to treasury. FABLE (the
 * soulbound in-game currency) is never spent on an NFT; once minted, the
 * NFT is a normal, fully tradeable ERC-721 that resells for AVAX on
 * FableMarket. mintWeapon() (FABLE-burn) is kept as a separate forge/sink
 * path for crafted weapons and is independent of the AVAX shop price.
 */
contract FableNFT {
    string public constant name   = "Fable Weapons";
    string public constant symbol = "FWEAP";

    IFableToken public fable;
    address public admin;
    address public treasury; // receives AVAX from mintWeaponWithAvax
    string public baseURI;   // e.g. https://playfable.xyz/api/nft-metadata/

    uint256 public nextTokenId = 1;

    enum Rarity { COMMON, RARE, EPIC, LEGENDARY }

    struct Weapon {
        string name;
        Rarity rarity;
        uint256 damage;
        uint256 dps;
        string weaponType;
    }

    mapping(Rarity => uint256) public mintCosts;     // FABLE burned on forge-mint (18 decimals)
    mapping(Rarity => uint256) public mintCostsAvax; // AVAX price for Tavern Shop mint (wei)
    mapping(uint256 => Weapon) public weapons;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event WeaponMinted(address indexed player, uint256 indexed tokenId, string name, Rarity rarity, uint256 fableBurned);
    event WeaponPurchased(address indexed player, uint256 indexed tokenId, string name, Rarity rarity, uint256 avaxPaid);
    event MintCostSet(Rarity indexed rarity, uint256 cost);
    event MintCostAvaxSet(Rarity indexed rarity, uint256 cost);
    event TreasurySet(address indexed treasury);

    modifier onlyAdmin() { require(msg.sender == admin, "FableNFT: not admin"); _; }

    constructor(address _fable, address _admin, address _treasury) {
        fable = IFableToken(_fable);
        admin = _admin;
        treasury = _treasury;

        mintCosts[Rarity.COMMON]    = 50   * 10 ** 18;
        mintCosts[Rarity.RARE]      = 150  * 10 ** 18;
        mintCosts[Rarity.EPIC]      = 400  * 10 ** 18;
        mintCosts[Rarity.LEGENDARY] = 1000 * 10 ** 18;

        // Tavern Shop AVAX prices, ascending by rarity
        mintCostsAvax[Rarity.COMMON]    = 0.05 ether;
        mintCostsAvax[Rarity.RARE]      = 0.2  ether;
        mintCostsAvax[Rarity.EPIC]      = 0.75 ether;
        mintCostsAvax[Rarity.LEGENDARY] = 3    ether;
    }

    function setMintCost(Rarity rarity, uint256 cost) external onlyAdmin {
        mintCosts[rarity] = cost;
        emit MintCostSet(rarity, cost);
    }

    function setMintCostAvax(Rarity rarity, uint256 cost) external onlyAdmin {
        mintCostsAvax[rarity] = cost;
        emit MintCostAvaxSet(rarity, cost);
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

    // Player pays FABLE (burned) → NFT minted to their wallet — forge/sink path
    function mintWeapon(
        string calldata weaponName,
        Rarity rarity,
        uint256 damage,
        uint256 dps,
        string calldata weaponType
    ) external returns (uint256) {
        uint256 cost = mintCosts[rarity];
        fable.burnFrom(msg.sender, cost);

        uint256 tokenId = _mintWeapon(msg.sender, weaponName, rarity, damage, dps, weaponType);
        emit WeaponMinted(msg.sender, tokenId, weaponName, rarity, cost);
        return tokenId;
    }

    // Player pays AVAX → NFT minted to their wallet — Tavern Shop primary sale
    function mintWeaponWithAvax(
        string calldata weaponName,
        Rarity rarity,
        uint256 damage,
        uint256 dps,
        string calldata weaponType
    ) external payable returns (uint256) {
        uint256 cost = mintCostsAvax[rarity];
        require(msg.value == cost, "FableNFT: wrong AVAX amount");

        uint256 tokenId = _mintWeapon(msg.sender, weaponName, rarity, damage, dps, weaponType);

        (bool ok, ) = payable(treasury).call{ value: msg.value }("");
        require(ok, "FableNFT: treasury payment failed");

        emit WeaponPurchased(msg.sender, tokenId, weaponName, rarity, cost);
        return tokenId;
    }

    function _mintWeapon(
        address to,
        string calldata weaponName,
        Rarity rarity,
        uint256 damage,
        uint256 dps,
        string calldata weaponType
    ) internal returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId);

        weapons[tokenId] = Weapon({
            name: weaponName,
            rarity: rarity,
            damage: damage,
            dps: dps,
            weaponType: weaponType
        });

        return tokenId;
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
