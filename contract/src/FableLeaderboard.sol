// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * FableLeaderboard — weekly score ledger for Fable RPG.
 *
 * FableGameSession calls submitScore() on every zone clear. Score is the
 * FABLE earned in that run; only a player's best run of the week counts,
 * bucketed by week and stamped with the exact block timestamp it was set.
 *
 * This contract only records scores — it does not pay anyone. Prize
 * payouts (top-N winners over an admin-defined campaign window, any split)
 * are computed off-chain from getAllScores() and paid out by the admin
 * dashboard's campaign flow (see fable/lib/campaigns.ts).
 */
contract FableLeaderboard {
    address public gameContract;
    address public admin;

    struct Entry {
        address player;
        uint256 score;
        uint256 timestamp;
    }

    mapping(uint256 => Entry[]) public weeklyScores; // week => scores (append-only, best-per-player)
    mapping(uint256 => mapping(address => uint256)) public playerBestScore;

    event ScoreSubmitted(address indexed player, uint256 score, uint256 indexed week, uint256 zoneId);
    event GameContractSet(address indexed gameContract);

    modifier onlyGameContract() { require(msg.sender == gameContract, "FableLeaderboard: not game contract"); _; }
    modifier onlyAdmin() { require(msg.sender == admin, "FableLeaderboard: not admin"); _; }

    constructor(address _admin) {
        admin = _admin;
    }

    function setGameContract(address _gameContract) external onlyAdmin {
        gameContract = _gameContract;
        emit GameContractSet(_gameContract);
    }

    function currentWeek() public view returns (uint256) {
        return block.timestamp / 7 days;
    }

    function submitScore(address player, uint256 score, uint256 zoneId) external onlyGameContract {
        uint256 week = currentWeek();
        if (score > playerBestScore[week][player]) {
            playerBestScore[week][player] = score;
            weeklyScores[week].push(Entry({ player: player, score: score, timestamp: block.timestamp }));
            emit ScoreSubmitted(player, score, week, zoneId);
        }
    }

    // Full, unfiltered score history for `week` — every submitScore() call
    // that raised a player's best-of-week score, in submission order, each
    // entry carrying its exact block timestamp. Lets a caller reconstruct
    // "who was actually ahead during [start, end]" for an arbitrary window
    // that doesn't align to the weekly boundary — e.g. an admin-defined
    // campaign.
    function getAllScores(uint256 week) external view returns (Entry[] memory) {
        return weeklyScores[week];
    }
}
