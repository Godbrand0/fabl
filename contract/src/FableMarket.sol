// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFableNFT {
    function transferFrom(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * FableMarket — peer-to-peer marketplace for Fable weapon NFTs.
 *
 * Listings are always priced and settled in native AVAX. FABLE is
 * soulbound and cannot leave a player's wallet to pay for anything here —
 * NFTs are earned assets that are then traded for real value (AVAX),
 * never for the non-tradeable progression token.
 */
contract FableMarket {
    IFableNFT public fableNFT;
    address public royaltyRecipient; // Fable treasury — feeds the weekly AVAX prize pool
    uint256 public royaltyBps = 500; // 5%, in basis points out of 10000

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 priceInAvax; // wei
        bool active;
    }

    mapping(uint256 => Listing) public listings;
    uint256[] private _activeTokenIds;
    mapping(uint256 => uint256) private _activeIndex; // tokenId => index in _activeTokenIds

    bool private _locked;

    event Listed(address indexed seller, uint256 indexed tokenId, uint256 priceInAvax);
    event Sold(address indexed buyer, address indexed seller, uint256 indexed tokenId, uint256 priceInAvax);
    event Unlisted(uint256 indexed tokenId);
    event RoyaltyRecipientSet(address indexed recipient);

    modifier nonReentrant() {
        require(!_locked, "FableMarket: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address _fableNFT, address _royaltyRecipient) {
        fableNFT = IFableNFT(_fableNFT);
        royaltyRecipient = _royaltyRecipient;
    }

    // Seller lists NFT for a price in AVAX — NFT moves to escrow (this contract)
    function listNFT(uint256 tokenId, uint256 priceInAvax) external {
        require(priceInAvax > 0, "FableMarket: price must be > 0");
        require(!listings[tokenId].active, "FableMarket: already listed");

        fableNFT.transferFrom(msg.sender, address(this), tokenId);

        listings[tokenId] = Listing({
            seller: msg.sender,
            tokenId: tokenId,
            priceInAvax: priceInAvax,
            active: true
        });
        _addActive(tokenId);

        emit Listed(msg.sender, tokenId, priceInAvax);
    }

    // Buyer pays AVAX — seller receives (100% - royalty), treasury gets the royalty
    function buyNFT(uint256 tokenId) external payable nonReentrant {
        Listing storage l = listings[tokenId];
        require(l.active, "FableMarket: not listed");
        require(msg.value == l.priceInAvax, "FableMarket: wrong AVAX amount");

        address seller = l.seller;
        uint256 price = l.priceInAvax;

        l.active = false;
        _removeActive(tokenId);

        uint256 royalty = (price * royaltyBps) / 10000;
        uint256 sellerAmount = price - royalty;

        fableNFT.transferFrom(address(this), msg.sender, tokenId);

        (bool sellerOk, ) = payable(seller).call{ value: sellerAmount }("");
        require(sellerOk, "FableMarket: seller payout failed");
        (bool treasuryOk, ) = payable(royaltyRecipient).call{ value: royalty }("");
        require(treasuryOk, "FableMarket: royalty payout failed");

        emit Sold(msg.sender, seller, tokenId, price);
    }

    // Seller can unlist and reclaim their NFT
    function unlistNFT(uint256 tokenId) external {
        Listing storage l = listings[tokenId];
        require(l.active, "FableMarket: not listed");
        require(l.seller == msg.sender, "FableMarket: not your listing");

        l.active = false;
        _removeActive(tokenId);

        fableNFT.transferFrom(address(this), msg.sender, tokenId);
        emit Unlisted(tokenId);
    }

    function setRoyaltyRecipient(address recipient) external {
        require(msg.sender == royaltyRecipient, "FableMarket: not treasury");
        royaltyRecipient = recipient;
        emit RoyaltyRecipientSet(recipient);
    }

    function getListings() external view returns (Listing[] memory) {
        Listing[] memory result = new Listing[](_activeTokenIds.length);
        for (uint256 i = 0; i < _activeTokenIds.length; i++) {
            result[i] = listings[_activeTokenIds[i]];
        }
        return result;
    }

    function _addActive(uint256 tokenId) internal {
        _activeIndex[tokenId] = _activeTokenIds.length;
        _activeTokenIds.push(tokenId);
    }

    function _removeActive(uint256 tokenId) internal {
        uint256 idx = _activeIndex[tokenId];
        uint256 lastIdx = _activeTokenIds.length - 1;
        uint256 lastTokenId = _activeTokenIds[lastIdx];

        _activeTokenIds[idx] = lastTokenId;
        _activeIndex[lastTokenId] = idx;
        _activeTokenIds.pop();
        delete _activeIndex[tokenId];
    }
}
