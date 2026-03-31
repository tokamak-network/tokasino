// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CoinFlip
/// @notice Single-transaction coin flip game powered by on-chain VRF randomness.
///         Players bet ETH and pick heads or tails. Result is instant via block.prevrandao.
contract CoinFlip {
    event GamePlayed(
        uint256 indexed gameId,
        address indexed player,
        bool chosenHeads,
        bool resultHeads,
        uint256 betAmount,
        uint256 payout,
        bool won,
        bytes32 randomSeed
    );

    event HouseFunded(address indexed funder, uint256 amount);

    error BetTooSmall();
    error BetTooLarge();
    error InsufficientHouseBalance();
    error PayoutFailed();

    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_BET = 1 ether;
    uint256 public constant PAYOUT_NUMERATOR = 195;
    uint256 public constant PAYOUT_DENOMINATOR = 100;

    struct Game {
        address player;
        bool chosenHeads;
        bool resultHeads;
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

    /// @notice Flip a coin. Pick heads (true) or tails (false), send ETH as your bet.
    /// @param chosenHeads true = heads, false = tails
    function flip(bool chosenHeads)
        external
        payable
        returns (uint256 gameId, bool resultHeads, bool won, uint256 payout)
    {
        if (msg.value < MIN_BET) revert BetTooSmall();
        if (msg.value > MAX_BET) revert BetTooLarge();

        bytes32 randomSeed = keccak256(
            abi.encodePacked(block.prevrandao, block.number, msg.sender, games.length)
        );
        resultHeads = uint256(randomSeed) % 2 == 0;

        won = (chosenHeads == resultHeads);
        payout = won ? (msg.value * PAYOUT_NUMERATOR) / PAYOUT_DENOMINATOR : 0;

        if (won) {
            if (address(this).balance < payout) revert InsufficientHouseBalance();
        }

        gameId = games.length;
        games.push(Game({
            player: msg.sender,
            chosenHeads: chosenHeads,
            resultHeads: resultHeads,
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

        emit GamePlayed(gameId, msg.sender, chosenHeads, resultHeads, msg.value, payout, won, randomSeed);
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
        uint256 gameId, address player, bool chosenHeads, bool resultHeads,
        uint256 betAmount, uint256 payout, bool won, bytes32 randomSeed
    ) {
        if (games.length == 0) return (0, address(0), false, false, 0, 0, false, bytes32(0));
        Game memory g = games[games.length - 1];
        return (games.length - 1, g.player, g.chosenHeads, g.resultHeads, g.betAmount, g.payout, g.won, g.randomSeed);
    }

    receive() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }
}
