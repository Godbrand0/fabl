// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IFableToken.sol";

interface IFableLeaderboard {
    function submitScore(address player, uint256 score, uint256 zoneId) external;
}

/**
 * FableGameSession — two player-signed transactions per level: one to
 * enter a zone, one to submit its score on clear.
 *
 * enterZone is signed by the player directly — no server involvement. The
 * FABLE entry fee is a one-off unlock: it's charged the first time a
 * player ever enters a given zone, and free every time after (including
 * retries after dying, and replays after clearing).
 *
 * clearZone is also signed by the player, but only succeeds if it carries
 * a valid signature from the trusted `gameServer` key attesting
 * (player, zoneId, score, deadline) — the run's score is the sum of every
 * enemy's point value killed that run, tallied client-side and countersigned
 * by the game server once its own zone-clear check passes. Score submission
 * is repeatable (every clear, first or replay, posts to the leaderboard);
 * the zone's FABLE reward is fixed on-chain and only ever minted once.
 */
contract FableGameSession {
    IFableToken       public fable;
    IFableLeaderboard public leaderboard;
    address public admin;
    address public gameServer; // signs zone-clear score attestations off-chain

    mapping(uint256 => uint256) public zoneCosts;   // zoneId => one-off FABLE entry fee
    mapping(uint256 => uint256) public zoneRewards; // zoneId => fixed FABLE reward, minted once per player

    mapping(address => mapping(uint256 => bool)) public entered; // player => zoneId => entry fee already paid
    mapping(address => mapping(uint256 => bool)) public claimed; // player => zoneId => reward already minted

    event ZoneEntered(address indexed player, uint256 indexed zoneId);
    event ZoneCleared(address indexed player, uint256 indexed zoneId, uint256 score, uint256 fableEarned);
    event ZoneCostSet(uint256 indexed zoneId, uint256 cost);
    event ZoneRewardSet(uint256 indexed zoneId, uint256 reward);
    event GameServerSet(address indexed gameServer);

    modifier onlyAdmin() { require(msg.sender == admin, "FableGameSession: not admin"); _; }

    constructor(address _fable, address _leaderboard, address _gameServer, address _admin) {
        fable = IFableToken(_fable);
        leaderboard = IFableLeaderboard(_leaderboard);
        gameServer = _gameServer;
        admin = _admin;
        // Actual per-zone costs/rewards are set post-deploy via setZoneCost/setZoneReward (see DeployFable.s.sol)
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    function setZoneCost(uint256 zoneId, uint256 cost) external onlyAdmin {
        zoneCosts[zoneId] = cost;
        emit ZoneCostSet(zoneId, cost);
    }

    function setZoneReward(uint256 zoneId, uint256 reward) external onlyAdmin {
        zoneRewards[zoneId] = reward;
        emit ZoneRewardSet(zoneId, reward);
    }

    function setGameServer(address _gameServer) external onlyAdmin {
        gameServer = _gameServer;
        emit GameServerSet(_gameServer);
    }

    // ── USER SIGNS: start a run. One-off FABLE fee the first time only ──────────
    function enterZone(uint256 zoneId) external {
        if (!entered[msg.sender][zoneId]) {
            entered[msg.sender][zoneId] = true;
            uint256 cost = zoneCosts[zoneId];
            if (cost > 0) fable.burnFrom(msg.sender, cost);
        }
        emit ZoneEntered(msg.sender, zoneId);
    }

    // ── USER SIGNS: submit this run's score using the server's attestation.
    // Repeatable — every clear posts a score. The zone's fixed FABLE reward
    // only mints the first time this player clears it.
    function clearZone(uint256 zoneId, uint256 score, uint256 deadline, bytes calldata signature) external {
        require(block.timestamp <= deadline, "FableGameSession: attestation expired");

        bytes32 hash = keccak256(
            abi.encodePacked(address(this), block.chainid, msg.sender, zoneId, score, deadline)
        );
        require(_recoverSigner(hash, signature) == gameServer, "FableGameSession: bad attestation");

        uint256 fableEarned;
        if (!claimed[msg.sender][zoneId]) {
            claimed[msg.sender][zoneId] = true;
            fableEarned = zoneRewards[zoneId];
            if (fableEarned > 0) fable.mintReward(msg.sender, fableEarned);
        }

        leaderboard.submitScore(msg.sender, score, zoneId);

        emit ZoneCleared(msg.sender, zoneId, score, fableEarned);
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
