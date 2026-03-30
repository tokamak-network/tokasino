// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IRandomBeaconHistory} from "./RandomBeaconHistory.sol";

/// @title CasinoExample
/// @notice A simple dice-game casino contract that demonstrates the commit-reveal
///         pattern using the RandomBeaconHistory for secure on-chain randomness.
/// @dev Players place bets by choosing a number between 1 and 6. After at least one
///      block has passed, anyone can resolve the bet using the randomness that was
///      committed for the bet's block. This two-phase approach prevents miners/validators
///      from front-running or manipulating outcomes.
contract CasinoExample {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice Represents a single bet placed by a player.
    struct Bet {
        /// @dev The player who placed the bet.
        address player;
        /// @dev The player's chosen dice number (1-6).
        uint8 choice;
        /// @dev The amount of ETH wagered.
        uint256 amount;
        /// @dev The block number at which the bet was placed (used for randomness lookup).
        uint256 blockNumber;
        /// @dev Whether the bet has already been resolved.
        bool resolved;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice The number of sides on the dice.
    uint8 public constant DICE_SIDES = 6;

    /// @notice Minimum bet amount (0.001 ether).
    uint256 public constant MIN_BET = 0.001 ether;

    /// @notice Payout multiplier for a winning bet (5x the wager).
    /// @dev With a 1-in-6 chance the expected value is slightly below 1x,
    ///      giving the house a ~16.7% edge.
    uint256 public constant PAYOUT_MULTIPLIER = 5;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Reference to the RandomBeaconHistory contract.
    IRandomBeaconHistory public immutable beaconHistory;

    /// @notice Array of all bets ever placed.
    Bet[] public bets;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a player places a new bet.
    /// @param betId The index of the bet in the `bets` array.
    /// @param player The address of the player.
    /// @param choice The chosen dice number (1-6).
    /// @param amount The amount wagered.
    /// @param blockNumber The block in which the bet was placed.
    event BetPlaced(
        uint256 indexed betId,
        address indexed player,
        uint8 choice,
        uint256 amount,
        uint256 blockNumber
    );

    /// @notice Emitted when a bet is resolved.
    /// @param betId The index of the bet.
    /// @param player The address of the player.
    /// @param rolledNumber The dice outcome (1-6).
    /// @param won Whether the player won.
    /// @param payout The amount paid out (0 if the player lost).
    event BetResolved(
        uint256 indexed betId,
        address indexed player,
        uint8 rolledNumber,
        bool won,
        uint256 payout
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Thrown when the bet amount is below the minimum.
    error BetTooSmall();

    /// @notice Thrown when the chosen dice number is out of the valid range.
    error InvalidChoice(uint8 choice);

    /// @notice Thrown when trying to resolve a bet that has already been resolved.
    error BetAlreadyResolved(uint256 betId);

    /// @notice Thrown when trying to resolve a bet in the same block it was placed.
    /// @dev At least one additional block must pass so that the RandomBeaconHistory
    ///      has had time to record the source of randomness.
    error BlockNotYetPassed(uint256 betId);

    /// @notice Thrown when the contract lacks sufficient funds to pay a winner.
    error InsufficientContractBalance();

    /// @notice Thrown when the provided betId does not exist.
    error BetDoesNotExist(uint256 betId);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Deploys the casino with a reference to the RandomBeaconHistory.
    /// @param _beaconHistory Address of the deployed RandomBeaconHistory contract.
    constructor(address _beaconHistory) {
        beaconHistory = IRandomBeaconHistory(_beaconHistory);
    }

    // -------------------------------------------------------------------------
    // External functions
    // -------------------------------------------------------------------------

    /// @notice Place a bet by choosing a dice number (1-6).
    /// @dev This is the "commit" phase. The player's choice and wager are recorded,
    ///      but the outcome is not determined until `resolveBet` is called.
    /// @param choice A number between 1 and 6 (inclusive).
    /// @return betId The index of the newly created bet.
    function placeBet(uint8 choice) external payable returns (uint256 betId) {
        if (msg.value < MIN_BET) {
            revert BetTooSmall();
        }
        if (choice < 1 || choice > DICE_SIDES) {
            revert InvalidChoice(choice);
        }

        betId = bets.length;
        bets.push(
            Bet({
                player: msg.sender,
                choice: choice,
                amount: msg.value,
                blockNumber: block.number,
                resolved: false
            })
        );

        emit BetPlaced(betId, msg.sender, choice, msg.value, block.number);
    }

    /// @notice Resolve a previously placed bet using committed randomness.
    /// @dev This is the "reveal" phase. The randomness for the bet's block is fetched
    ///      from the RandomBeaconHistory and used to determine the dice outcome.
    ///      Anyone can call this function (not just the original bettor).
    /// @param betId The index of the bet to resolve.
    function resolveBet(uint256 betId) external {
        if (betId >= bets.length) {
            revert BetDoesNotExist(betId);
        }

        Bet storage bet = bets[betId];

        if (bet.resolved) {
            revert BetAlreadyResolved(betId);
        }
        if (block.number <= bet.blockNumber) {
            revert BlockNotYetPassed(betId);
        }

        // Mark as resolved before external interactions (checks-effects-interactions).
        bet.resolved = true;

        // Fetch the source of randomness for the block the bet was placed in.
        bytes32 randomSeed = beaconHistory.getRandomness(bet.blockNumber);

        // Derive a bet-specific random value by hashing the seed with the betId.
        uint256 randomValue = uint256(keccak256(abi.encodePacked(randomSeed, betId)));

        // Map to a dice roll: 1-6.
        uint8 rolledNumber = uint8((randomValue % DICE_SIDES) + 1);

        bool won = (rolledNumber == bet.choice);
        uint256 payout = 0;

        if (won) {
            payout = bet.amount * PAYOUT_MULTIPLIER;
            if (address(this).balance < payout) {
                revert InsufficientContractBalance();
            }
            (bool success,) = bet.player.call{value: payout}("");
            require(success, "Payout transfer failed");
        }

        emit BetResolved(betId, bet.player, rolledNumber, won, payout);
    }

    /// @notice Returns the total number of bets placed.
    /// @return The length of the bets array.
    function totalBets() external view returns (uint256) {
        return bets.length;
    }

    /// @notice Allows the contract to receive ETH to fund the house bankroll.
    receive() external payable {}
}
