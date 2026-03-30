// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title InstantDice
/// @notice Single-transaction dice game powered by on-chain VRF randomness.
///         Players bet ETH and pick a number 1-6. The result is determined
///         instantly using block.prevrandao (VRF output from the CL).
/// @dev    Since prevrandao is a VRF output, the sequencer cannot forge it.
///         The trade-off vs commit-reveal: the sequencer knows the result before
///         including the tx, but cannot change it (VRF is deterministic).
contract InstantDice {
    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event GamePlayed(
        uint256 indexed gameId,
        address indexed player,
        uint8 chosenNumber,
        uint8 rolledNumber,
        uint256 betAmount,
        uint256 payout,
        bool won,
        bytes32 randomSeed
    );

    event HouseFunded(address indexed funder, uint256 amount);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error BetTooSmall();
    error BetTooLarge();
    error InvalidChoice();
    error InsufficientHouseBalance();
    error PayoutFailed();

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    uint8 public constant DICE_SIDES = 6;
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_BET = 1 ether;
    uint256 public constant PAYOUT_MULTIPLIER = 5; // 5x on win (house edge ~16.7%)

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    struct Game {
        address player;
        uint8 chosenNumber;
        uint8 rolledNumber;
        uint256 betAmount;
        uint256 payout;
        bool won;
        bytes32 randomSeed;
        uint256 blockNumber;
        uint256 timestamp;
    }

    Game[] public games;
    mapping(address => uint256[]) public playerGames;

    uint256 public totalGamesPlayed;
    uint256 public totalWagered;
    uint256 public totalPaidOut;

    // -----------------------------------------------------------------------
    // External
    // -----------------------------------------------------------------------

    /// @notice Play a single dice game. Pick 1-6, send ETH as your bet.
    ///         Result is instant — determined by block.prevrandao (VRF).
    /// @param chosenNumber Your pick (1-6 inclusive)
    /// @return gameId The ID of this game
    /// @return rolledNumber The actual dice result
    /// @return won Whether you won
    /// @return payout Amount paid out (0 if lost)
    function play(uint8 chosenNumber)
        external
        payable
        returns (uint256 gameId, uint8 rolledNumber, bool won, uint256 payout)
    {
        if (msg.value < MIN_BET) revert BetTooSmall();
        if (msg.value > MAX_BET) revert BetTooLarge();
        if (chosenNumber < 1 || chosenNumber > DICE_SIDES) revert InvalidChoice();

        // Derive randomness from VRF-backed prevrandao + game-specific salt
        bytes32 randomSeed = keccak256(
            abi.encodePacked(block.prevrandao, block.number, msg.sender, games.length)
        );
        rolledNumber = uint8(uint256(randomSeed) % DICE_SIDES) + 1;

        won = (rolledNumber == chosenNumber);
        payout = won ? msg.value * PAYOUT_MULTIPLIER : 0;

        if (won) {
            if (address(this).balance < payout) revert InsufficientHouseBalance();
        }

        gameId = games.length;
        games.push(Game({
            player: msg.sender,
            chosenNumber: chosenNumber,
            rolledNumber: rolledNumber,
            betAmount: msg.value,
            payout: payout,
            won: won,
            randomSeed: randomSeed,
            blockNumber: block.number,
            timestamp: block.timestamp
        }));

        playerGames[msg.sender].push(gameId);
        totalGamesPlayed++;
        totalWagered += msg.value;

        if (won) {
            totalPaidOut += payout;
            (bool ok,) = msg.sender.call{value: payout}("");
            if (!ok) revert PayoutFailed();
        }

        emit GamePlayed(gameId, msg.sender, chosenNumber, rolledNumber, msg.value, payout, won, randomSeed);
    }

    /// @notice Fund the house bankroll.
    function fundHouse() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }

    /// @notice Get total number of games.
    function totalGames() external view returns (uint256) {
        return games.length;
    }

    /// @notice Get game IDs for a player.
    function getPlayerGames(address player) external view returns (uint256[] memory) {
        return playerGames[player];
    }

    /// @notice Get house balance.
    function houseBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Get the latest game result (for frontend polling).
    function latestGame() external view returns (
        uint256 gameId, address player, uint8 chosenNumber, uint8 rolledNumber,
        uint256 betAmount, uint256 payout, bool won, bytes32 randomSeed
    ) {
        if (games.length == 0) return (0, address(0), 0, 0, 0, 0, false, bytes32(0));
        Game memory g = games[games.length - 1];
        return (games.length - 1, g.player, g.chosenNumber, g.rolledNumber, g.betAmount, g.payout, g.won, g.randomSeed);
    }

    receive() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }
}
