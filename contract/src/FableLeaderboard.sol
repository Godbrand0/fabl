// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * FableLeaderboard — weekly ranking + AVAX prize distribution for Fable RPG.
 *
 * FableGameSession calls submitScore() on every zone clear. Score is the
 * FABLE earned in that run; only a player's best run of the week counts.
 * Each Monday, admin funds distributeWeeklyPrizes() with AVAX and it pays
 * out the top 20 players of the closed week by basis-point share.
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
    mapping(uint256 => bool) public weekPaidOut;

    // Top-20 prize shares, basis points out of 10000
    uint16[20] public prizeShares = [
        1200, 800, 600, 400, 400,
        200, 200, 200, 200, 200,
        50, 50, 50, 50, 50,
        50, 50, 50, 50, 50
    ];

    event ScoreSubmitted(address indexed player, uint256 score, uint256 indexed week, uint256 zoneId);
    event WeeklyPayout(uint256 indexed week, uint256 totalAvax);
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

    // Admin sends AVAX with this call; it is split across the top 20 scores
    // of `week` and paid out immediately. `week` must already be closed.
    function distributeWeeklyPrizes(uint256 week) external payable onlyAdmin {
        require(week < currentWeek(), "FableLeaderboard: week not closed");
        require(!weekPaidOut[week], "FableLeaderboard: already paid");
        require(msg.value > 0, "FableLeaderboard: send AVAX for prizes");

        weekPaidOut[week] = true;

        Entry[] memory scores = getSortedScores(week);
        uint256 count = scores.length < 20 ? scores.length : 20;

        uint256 distributed;
        for (uint256 i = 0; i < count; i++) {
            uint256 prize = (msg.value * prizeShares[i]) / 10000;
            distributed += prize;
            (bool ok, ) = payable(scores[i].player).call{ value: prize }("");
            require(ok, "FableLeaderboard: payout failed");
        }

        // Any dust left from rounding / fewer than 20 players returns to admin
        uint256 leftover = msg.value - distributed;
        if (leftover > 0) {
            (bool ok, ) = payable(admin).call{ value: leftover }("");
            require(ok, "FableLeaderboard: refund failed");
        }

        emit WeeklyPayout(week, msg.value);
    }

    // Top 20 unique players of `week`, sorted by best score descending.
    // O(n^2) selection sort — weekly leaderboards are small enough that
    // this stays well under block gas limits.
    function getSortedScores(uint256 week) public view returns (Entry[] memory) {
        Entry[] memory all = weeklyScores[week];

        // Collapse to one (best) entry per player
        address[] memory seen = new address[](all.length);
        Entry[] memory best = new Entry[](all.length);
        uint256 uniqueCount;

        for (uint256 i = 0; i < all.length; i++) {
            bool found = false;
            for (uint256 j = 0; j < uniqueCount; j++) {
                if (seen[j] == all[i].player) {
                    if (all[i].score > best[j].score) best[j] = all[i];
                    found = true;
                    break;
                }
            }
            if (!found) {
                seen[uniqueCount] = all[i].player;
                best[uniqueCount] = all[i];
                uniqueCount++;
            }
        }

        uint256 top = uniqueCount < 20 ? uniqueCount : 20;
        for (uint256 i = 0; i < top; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < uniqueCount; j++) {
                if (best[j].score > best[maxIdx].score) maxIdx = j;
            }
            if (maxIdx != i) {
                Entry memory tmp = best[i];
                best[i] = best[maxIdx];
                best[maxIdx] = tmp;
            }
        }

        Entry[] memory result = new Entry[](top);
        for (uint256 i = 0; i < top; i++) result[i] = best[i];
        return result;
    }
}
