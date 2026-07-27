// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IFableToken.sol";

interface IFableLeaderboard {
    function submitScore(address player, uint256 score, uint256 zoneId) external;
}

/**
 * FableGameSession — player-signed transactions covering a zone run's
 * full lifecycle: enter, die (quit or pay to continue), and clear.
 *
 * enterZone is signed by the player directly — no server involvement. The
 * FABLE entry fee is a one-off unlock: charged the first time a player
 * ever enters a given zone, free every time after (including retries).
 *
 * clearZone, submitCheckpoint, and continueRun are all signed by the
 * player, but each only succeeds with a valid signature from the trusted
 * `gameServer` key attesting (action, player, zoneId, score, deadline).
 * `score` is the sum of every enemy's point value killed that run,
 * tallied client-side and countersigned by the game server. The `action`
 * byte is baked into what's signed so a signature issued for one of these
 * three functions can never be replayed into another — critical, since
 * only clearZone is allowed to mint a zone's FABLE reward, and a replayed
 * checkpoint signature must never be able to trigger that mint.
 *
 * - clearZone: the run ended in an actual boss kill. Repeatable — every
 *   clear posts a score — but the zone's fixed FABLE reward only mints
 *   the first time this player clears it.
 * - submitCheckpoint: the player died and chose to quit. Banks the score
 *   earned so far with no FABLE reward; the run is over.
 * - continueRun: the player died and paid the flat continue fee to keep
 *   fighting from where they fell (client resumes with kill count intact
 *   instead of restarting). Also banks the score earned so far.
 */
contract FableGameSession {
    IFableToken       public fable;
    IFableLeaderboard public leaderboard;
    address public admin;
    address public gameServer; // signs run-score attestations off-chain

    // Action tags baked into the signed hash — see contract-level comment.
    uint8 constant ACTION_CLEAR      = 1;
    uint8 constant ACTION_CHECKPOINT = 2;
    uint8 constant ACTION_CONTINUE   = 3;

    mapping(uint256 => uint256) public zoneCosts;   // zoneId => one-off FABLE entry fee
    mapping(uint256 => uint256) public zoneRewards; // zoneId => fixed FABLE reward, minted once per player
    uint256 public continueFee;                     // flat FABLE cost to resume after dying

    mapping(address => mapping(uint256 => bool)) public entered; // player => zoneId => entry fee already paid
    mapping(address => mapping(uint256 => bool)) public claimed; // player => zoneId => reward already minted

    event ZoneEntered(address indexed player, uint256 indexed zoneId);
    event ZoneCleared(address indexed player, uint256 indexed zoneId, uint256 score, uint256 fableEarned);
    event CheckpointSubmitted(address indexed player, uint256 indexed zoneId, uint256 score);
    event RunContinued(address indexed player, uint256 indexed zoneId, uint256 score, uint256 fablePaid);
    event ZoneCostSet(uint256 indexed zoneId, uint256 cost);
    event ZoneRewardSet(uint256 indexed zoneId, uint256 reward);
    event ContinueFeeSet(uint256 fee);
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

    function setContinueFee(uint256 fee) external onlyAdmin {
        continueFee = fee;
        emit ContinueFeeSet(fee);
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

    // ── USER SIGNS: the run ended in a boss kill. Repeatable score submission;
    // the zone's fixed FABLE reward only mints the first time.
    function clearZone(uint256 zoneId, uint256 score, uint256 deadline, bytes calldata signature) external {
        _verify(ACTION_CLEAR, zoneId, score, deadline, signature);

        uint256 fableEarned;
        if (!claimed[msg.sender][zoneId]) {
            claimed[msg.sender][zoneId] = true;
            fableEarned = zoneRewards[zoneId];
            if (fableEarned > 0) fable.mintReward(msg.sender, fableEarned);
        }

        leaderboard.submitScore(msg.sender, score, zoneId);
        emit ZoneCleared(msg.sender, zoneId, score, fableEarned);
    }

    // ── USER SIGNS: died and quit. Banks the score earned so far — no FABLE. ────
    function submitCheckpoint(uint256 zoneId, uint256 score, uint256 deadline, bytes calldata signature) external {
        _verify(ACTION_CHECKPOINT, zoneId, score, deadline, signature);

        leaderboard.submitScore(msg.sender, score, zoneId);
        emit CheckpointSubmitted(msg.sender, zoneId, score);
    }

    // ── USER SIGNS: died and paid to keep fighting. Banks the score so far
    // and burns the flat continue fee; the client resumes with kill count intact.
    function continueRun(uint256 zoneId, uint256 score, uint256 deadline, bytes calldata signature) external {
        _verify(ACTION_CONTINUE, zoneId, score, deadline, signature);

        if (continueFee > 0) fable.burnFrom(msg.sender, continueFee);

        leaderboard.submitScore(msg.sender, score, zoneId);
        emit RunContinued(msg.sender, zoneId, score, continueFee);
    }

    function _verify(uint8 action, uint256 zoneId, uint256 score, uint256 deadline, bytes calldata signature) internal view {
        require(block.timestamp <= deadline, "FableGameSession: attestation expired");

        bytes32 hash = keccak256(
            abi.encodePacked(address(this), block.chainid, action, msg.sender, zoneId, score, deadline)
        );
        require(_recoverSigner(hash, signature) == gameServer, "FableGameSession: bad attestation");
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
