// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * FableToken — soulbound ERC-20 in-game currency for Fable RPG (Avalanche C-Chain).
 *
 * FABLE cannot be bought, sold, or transferred between players. It can only
 * move between a player wallet and the game contract (mint on reward, burn
 * on spend). This keeps progression skill/time-gated instead of pay-to-win.
 *
 * EARNING FABLE (server-verified):
 *   FableGameSession calls mintReward(player, amount) after a zone clear or
 *   a death-save, once the game server has confirmed the run server-side.
 *
 * SPENDING FABLE (trustless):
 *   FableGameSession / FableNFT call burnFrom(player, amount) when a player
 *   enters an elite zone, forges a weapon, or buys a stat upgrade.
 *
 * Deployment args:
 *   admin = deployer wallet (can grant/revoke gameContract access)
 */
contract FableToken {
    string public constant name     = "Fable";
    string public constant symbol   = "FABLE";
    uint8  public constant decimals = 18;

    uint256 public constant MAX_SUPPLY = 100_000_000 * 10 ** 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public admin;

    // Any number of contracts (game session, NFT, market) may move FABLE
    // in/out of a player's balance. Everything else is blocked.
    mapping(address => bool) public isGameContract;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event GameContractSet(address indexed gameContract, bool allowed);

    modifier onlyAdmin() { require(msg.sender == admin, "FableToken: not admin"); _; }
    modifier onlyGameContract() { require(isGameContract[msg.sender], "FableToken: not game contract"); _; }

    constructor(address _admin) {
        admin = _admin;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    function setGameContract(address gameContract, bool allowed) external onlyAdmin {
        isGameContract[gameContract] = allowed;
        emit GameContractSet(gameContract, allowed);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }

    // ── Reward / spend — game contracts only ────────────────────────────────────
    function mintReward(address player, uint256 amount) external onlyGameContract {
        require(totalSupply + amount <= MAX_SUPPLY, "FableToken: max supply");
        totalSupply += amount;
        balanceOf[player] += amount;
        emit Transfer(address(0), player, amount);
    }

    function burnFrom(address player, uint256 amount) external onlyGameContract {
        require(balanceOf[player] >= amount, "FableToken: insufficient balance");
        balanceOf[player] -= amount;
        totalSupply -= amount;
        emit Transfer(player, address(0), amount);
    }

    // ── ERC-20 — soulbound: only game contracts may move balances ──────────────
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "FableToken: allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(isGameContract[from] || isGameContract[to], "FableToken: non-transferable");
        require(balanceOf[from] >= amount, "FableToken: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
