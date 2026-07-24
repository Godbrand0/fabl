// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IFableToken.sol";

interface IFableLeaderboard {
    function submitScore(address player, uint256 score, uint256 zoneId) external;
}

/**
 * FableGameSession — two player-signed transactions per level: one to
 * enter a zone, one to claim its reward on clear. Kill counts, loot, and
 * run progress stay in the game's off-chain database; the only on-chain
 * state is "did this player already claim this zone's reward."
 *
 * enterZone is signed by the player directly — no server involvement.
 *
 * clearZone is also signed by the player, but only succeeds if it carries
 * a valid signature from the trusted `gameServer` key attesting
 * (player, zoneId, amount, deadline). The game server issues that
 * signature once its own zone-clear check (Supabase-backed) passes,
 * without ever holding a session on-chain or paying the gas itself.
 */
contract FableGameSession {
    IFableToken       public fable;
    IFableLeaderboard public leaderboard;
    address public admin;
    address public gameServer; // signs zone-clear attestations off-chain

    mapping(uint256 => uint256) public zoneCosts; // zoneId => FABLE entry cost
    mapping(address => mapping(uint256 => bool)) public claimed; // player => zoneId => claimed

    event ZoneEntered(address indexed player, uint256 indexed zoneId);
    event ZoneCleared(address indexed player, uint256 indexed zoneId, uint256 fableEarned);
    event ZoneCostSet(uint256 indexed zoneId, uint256 cost);
    event GameServerSet(address indexed gameServer);

    modifier onlyAdmin() { require(msg.sender == admin, "FableGameSession: not admin"); _; }

    constructor(address _fable, address _leaderboard, address _gameServer, address _admin) {
        fable = IFableToken(_fable);
        leaderboard = IFableLeaderboard(_leaderboard);
        gameServer = _gameServer;
        admin = _admin;
        // Actual per-zone costs are set post-deploy via setZoneCost (see DeployFable.s.sol)
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    function setZoneCost(uint256 zoneId, uint256 cost) external onlyAdmin {
        zoneCosts[zoneId] = cost;
        emit ZoneCostSet(zoneId, cost);
    }

    function setGameServer(address _gameServer) external onlyAdmin {
        gameServer = _gameServer;
        emit GameServerSet(_gameServer);
    }

    // ── USER SIGNS: start a run, burning the zone entry fee if any ─────────────
    function enterZone(uint256 zoneId) external {
        uint256 cost = zoneCosts[zoneId];
        if (cost > 0) {
            fable.burnFrom(msg.sender, cost);
        }
        emit ZoneEntered(msg.sender, zoneId);
    }

    // ── USER SIGNS: claim a zone's reward using the server's attestation ───────
    function clearZone(uint256 zoneId, uint256 amount, uint256 deadline, bytes calldata signature) external {
        require(block.timestamp <= deadline, "FableGameSession: attestation expired");
        require(!claimed[msg.sender][zoneId], "FableGameSession: already claimed");

        bytes32 hash = keccak256(
            abi.encodePacked(address(this), block.chainid, msg.sender, zoneId, amount, deadline)
        );
        require(_recoverSigner(hash, signature) == gameServer, "FableGameSession: bad attestation");

        claimed[msg.sender][zoneId] = true;

        if (amount > 0) fable.mintReward(msg.sender, amount);
        leaderboard.submitScore(msg.sender, amount, zoneId);

        emit ZoneCleared(msg.sender, zoneId, amount);
    }

    // ── EIP-191 personal_sign recovery (no external deps) ───────────────────────
    function _recoverSigner(bytes32 hash, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "FableGameSession: bad signature length");

        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;

        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        return ecrecover(ethSignedHash, v, r, s);
    }
}
