// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RPS — Rock Paper Scissors with Roulette Multiplier
/// @notice On-chain RPS inspired by the classic Korean "짱깸뽀" arcade machine.
///         Win → spin a roulette for ×1, ×2, ×4, ×7, or ×20 payout.
///         Draw → bet refunded. Lose → bet forfeited.
contract RPS {
    // --- Events ---
    event GamePlayed(
        uint256 indexed gameId,
        address indexed player,
        uint8 playerHand,     // 0=rock, 1=paper, 2=scissors
        uint8 houseHand,      // 0=rock, 1=paper, 2=scissors
        uint8 outcome,        // 0=draw, 1=win, 2=lose
        uint8 multiplier,     // 1,2,4,7,20 (only meaningful on win)
        uint256 betAmount,
        uint256 payout,
        bytes32 randomSeed
    );

    event HouseFunded(address indexed funder, uint256 amount);

    // --- Errors ---
    error BetTooSmall();
    error BetTooLarge();
    error InvalidHand();
    error InsufficientHouseBalance();
    error PayoutFailed();

    // --- Constants ---
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_BET = 1 ether;

    // Roulette multiplier thresholds (out of 100):
    // ×1: 0-39 (40%), ×2: 40-69 (30%), ×4: 70-87 (18%), ×7: 88-96 (9%), ×20: 97-99 (3%)
    uint8[5] private MULTIPLIERS = [1, 2, 4, 7, 20];
    uint8[5] private THRESHOLDS = [40, 70, 88, 97, 100];

    // --- Storage ---
    struct Game {
        address player;
        uint8 playerHand;
        uint8 houseHand;
        uint8 outcome;      // 0=draw, 1=win, 2=lose
        uint8 multiplier;
        uint256 betAmount;
        uint256 payout;
        bytes32 randomSeed;
        uint256 blockNumber;
        uint256 timestamp;
    }

    Game[] public games;
    mapping(address => uint256[]) public playerGames;

    uint256 public totalGamesPlayed;
    uint256 public totalWagered;
    uint256 public totalPaidOut;

    /// @notice Play rock-paper-scissors. 0=rock, 1=paper, 2=scissors.
    function play(uint8 hand)
        external
        payable
        returns (
            uint256 gameId,
            uint8 houseHand,
            uint8 outcome,
            uint8 multiplier,
            uint256 payout
        )
    {
        if (hand > 2) revert InvalidHand();
        if (msg.value < MIN_BET) revert BetTooSmall();
        if (msg.value > MAX_BET) revert BetTooLarge();

        // Generate randomness
        bytes32 randomSeed = keccak256(
            abi.encodePacked(block.prevrandao, block.number, msg.sender, games.length)
        );

        // Determine house hand (0-2)
        houseHand = uint8(uint256(randomSeed) % 3);

        // Determine outcome: draw=0, win=1, lose=2
        if (hand == houseHand) {
            outcome = 0; // draw
        } else if ((hand + 1) % 3 == houseHand) {
            outcome = 2; // lose (rock loses to paper, paper loses to scissors, scissors loses to rock)
        } else {
            outcome = 1; // win
        }

        // Calculate payout
        multiplier = 1;
        if (outcome == 1) {
            // Win — spin roulette for multiplier
            uint8 roll = uint8(uint256(keccak256(abi.encodePacked(randomSeed, "roulette"))) % 100);
            for (uint8 i = 0; i < 5; i++) {
                if (roll < THRESHOLDS[i]) {
                    multiplier = MULTIPLIERS[i];
                    break;
                }
            }
            payout = msg.value * uint256(multiplier);
            if (address(this).balance < payout) revert InsufficientHouseBalance();
        } else if (outcome == 0) {
            // Draw — refund
            payout = msg.value;
            multiplier = 0;
        } else {
            // Lose
            payout = 0;
            multiplier = 0;
        }

        // Store game
        gameId = games.length;
        games.push(Game({
            player: msg.sender,
            playerHand: hand,
            houseHand: houseHand,
            outcome: outcome,
            multiplier: multiplier,
            betAmount: msg.value,
            payout: payout,
            randomSeed: randomSeed,
            blockNumber: block.number,
            timestamp: block.timestamp
        }));

        playerGames[msg.sender].push(gameId);
        totalGamesPlayed++;
        totalWagered += msg.value;

        // Send payout
        if (payout > 0) {
            totalPaidOut += payout;
            (bool ok,) = msg.sender.call{value: payout}("");
            if (!ok) revert PayoutFailed();
        }

        emit GamePlayed(
            gameId, msg.sender, hand, houseHand,
            outcome, multiplier, msg.value, payout, randomSeed
        );
    }

    function fundHouse() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }

    function totalGames() external view returns (uint256) {
        return games.length;
    }

    function getPlayerGames(address player) external view returns (uint256[] memory) {
        return playerGames[player];
    }

    function houseBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function latestGame() external view returns (
        uint256 gameId, address player, uint8 playerHand, uint8 houseHand,
        uint8 outcome, uint8 multiplier, uint256 betAmount, uint256 payout, bytes32 randomSeed
    ) {
        if (games.length == 0) return (0, address(0), 0, 0, 0, 0, 0, 0, bytes32(0));
        Game memory g = games[games.length - 1];
        return (games.length - 1, g.player, g.playerHand, g.houseHand, g.outcome, g.multiplier, g.betAmount, g.payout, g.randomSeed);
    }

    receive() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }
}
