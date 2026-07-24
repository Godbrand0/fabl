// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IFableToken.sol";

/**
 * FableShop — spends FABLE on consumables, buffs, and stat points.
 *
 * Unlike earning FABLE (which needs a game-server attestation to prove a
 * run really happened), spending needs no server involvement at all: a
 * player burning their own balance against a fixed on-chain price is
 * trustless by construction. Every purchase is one player-signed tx.
 *
 * Items (potions/buffs) are flat-priced by itemId. Stat points use a
 * two-tier price — the first point a player ever buys is cheaper, every
 * point after is a flat higher price — mirroring the previous Gold-based
 * stat system. The per-level cap on how many points can be bought is
 * enforced off-chain by the game client against zone progress; this
 * contract only guarantees correct pricing and an honest burn.
 */
contract FableShop {
    IFableToken public fable;
    address public admin;

    mapping(uint256 => uint256) public itemPrices; // itemId => FABLE cost (18 decimals)

    uint256 public statPointFirstCost;
    uint256 public statPointCost;
    mapping(address => uint256) public statPointsBought;

    event ItemPriceSet(uint256 indexed itemId, uint256 cost);
    event ItemPurchased(address indexed player, uint256 indexed itemId, uint256 cost);
    event StatPointPriceSet(uint256 firstCost, uint256 cost);
    event StatPointBought(address indexed player, uint256 cost, uint256 totalBought);

    modifier onlyAdmin() { require(msg.sender == admin, "FableShop: not admin"); _; }

    constructor(address _fable, address _admin) {
        fable = IFableToken(_fable);
        admin = _admin;
    }

    function setItemPrice(uint256 itemId, uint256 cost) external onlyAdmin {
        itemPrices[itemId] = cost;
        emit ItemPriceSet(itemId, cost);
    }

    function setStatPointPrices(uint256 firstCost, uint256 cost) external onlyAdmin {
        statPointFirstCost = firstCost;
        statPointCost = cost;
        emit StatPointPriceSet(firstCost, cost);
    }

    function buyItem(uint256 itemId) external {
        uint256 cost = itemPrices[itemId];
        require(cost > 0, "FableShop: unknown item");
        fable.burnFrom(msg.sender, cost);
        emit ItemPurchased(msg.sender, itemId, cost);
    }

    function buyStatPoint() external {
        uint256 cost = statPointsBought[msg.sender] == 0 ? statPointFirstCost : statPointCost;
        fable.burnFrom(msg.sender, cost);
        statPointsBought[msg.sender] += 1;
        emit StatPointBought(msg.sender, cost, statPointsBought[msg.sender]);
    }
}
