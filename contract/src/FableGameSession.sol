// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IFableToken.sol";

interface IFableLeaderboard {
    function submitScore(address player, uint256 score, uint256 zoneId) external;
}

/**
 * FableGameSession — tracks a zone run and pays out FABLE at its end.
 *
 * enterZone / clearZone / sessionAborted are signed by the player.
 * checkpoint is signed by the game server (Privy delegate) with no
 * user popup, so kills mid-run don't interrupt gameplay.
 */
contract FableGameSession {
    IFableToken       public fable;
    IFableLeaderboard public leaderboard;
    address public admin;
    address public gameServer; // Privy server wallet — signs checkpoints only

    mapping(uint256 => uint256) public zoneCosts; // zoneId => FABLE entry cost

    struct Session {
        address player;
        uint256 zoneId;
        uint256 startTime;
        uint256 earned;
        uint256 checkpointProgress; // 0-100
        bool active;
    }

    mapping(bytes32 => Session) public sessions;

    event SessionStarted(bytes32 indexed sessionId, address indexed player, uint256 zoneId);
    event Checkpoint(bytes32 indexed sessionId, uint256 progress, uint256 earned);
    event ZoneCleared(bytes32 indexed sessionId, address indexed player, uint256 fableEarned);
    event SessionAborted(bytes32 indexed sessionId, address indexed player, uint256 fableSaved);
    event ZoneCostSet(uint256 indexed zoneId, uint256 cost);
    event GameServerSet(address indexed gameServer);

    modifier onlyGameServer() { require(msg.sender == gameServer, "FableGameSession: only game server"); _; }
    modifier onlyAdmin() { require(msg.sender == admin, "FableGameSession: not admin"); _; }

    constructor(address _fable, address _leaderboard, address _gameServer, address _admin) {
        fable = IFableToken(_fable);
        leaderboard = IFableLeaderboard(_leaderboard);
        gameServer = _gameServer;
        admin = _admin;
        zoneCosts[1] = 0; // Ember Fields (Lv1-2): free entry
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
    function enterZone(uint256 zoneId) external returns (bytes32) {
        uint256 cost = zoneCosts[zoneId];
        if (cost > 0) {
            fable.burnFrom(msg.sender, cost);
        }

        bytes32 sessionId = keccak256(abi.encodePacked(msg.sender, zoneId, block.timestamp, block.prevrandao));

        sessions[sessionId] = Session({
            player: msg.sender,
            zoneId: zoneId,
            startTime: block.timestamp,
            earned: 0,
            checkpointProgress: 0,
            active: true
        });

        emit SessionStarted(sessionId, msg.sender, zoneId);
        return sessionId;
    }

    // ── GAME SERVER SIGNS: silent mid-run progress + earned FABLE update ───────
    function checkpoint(bytes32 sessionId, uint256 progress, uint256 totalEarned) external onlyGameServer {
        Session storage s = sessions[sessionId];
        require(s.active, "FableGameSession: session not active");
        require(progress > s.checkpointProgress, "FableGameSession: progress must increase");
        require(progress <= 100, "FableGameSession: progress max 100");

        s.earned = totalEarned;
        s.checkpointProgress = progress;

        emit Checkpoint(sessionId, progress, totalEarned);
    }

    // ── USER SIGNS: zone cleared — mints earned FABLE, submits leaderboard score ─
    function clearZone(bytes32 sessionId) external {
        Session storage s = sessions[sessionId];
        require(s.player == msg.sender, "FableGameSession: not your session");
        require(s.active, "FableGameSession: session not active");
        require(s.checkpointProgress >= 75, "FableGameSession: zone not cleared");

        s.active = false;
        if (s.earned > 0) fable.mintReward(msg.sender, s.earned);
        leaderboard.submitScore(msg.sender, s.earned, s.zoneId);

        emit ZoneCleared(sessionId, msg.sender, s.earned);
    }

    // ── USER SIGNS: death — saves 50% of earned FABLE ───────────────────────────
    function sessionAborted(bytes32 sessionId) external {
        Session storage s = sessions[sessionId];
        require(s.player == msg.sender, "FableGameSession: not your session");
        require(s.active, "FableGameSession: session not active");

        s.active = false;
        uint256 saved = s.earned / 2;

        if (saved > 0) fable.mintReward(msg.sender, saved);

        emit SessionAborted(sessionId, msg.sender, saved);
    }
}
