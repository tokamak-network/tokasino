// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Roulette
/// @notice European roulette (0-36) powered by on-chain VRF randomness.
///         Supports number, color, even/odd, low/high, and dozen bets.
contract Roulette {
    enum BetType { Number, Red, Black, Even, Odd, Low, High, Dozen1st, Dozen2nd, Dozen3rd }

    event SpinResult(
        uint256 indexed spinId,
        address indexed player,
        BetType betType,
        uint8 betValue,
        uint8 result,
        uint256 betAmount,
        uint256 payout,
        bool won,
        bytes32 randomSeed
    );

    event HouseFunded(address indexed funder, uint256 amount);

    error BetTooSmall();
    error BetTooLarge();
    error InvalidBetValue();
    error InsufficientHouseBalance();
    error PayoutFailed();

    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_BET = 1 ether;

    /// @dev Bitmap of red numbers. Bit N is set if N is red.
    ///      Red: 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36
    uint256 private constant RED_BITMAP =
        (1 << 1) | (1 << 3) | (1 << 5) | (1 << 7) | (1 << 9) |
        (1 << 12) | (1 << 14) | (1 << 16) | (1 << 18) |
        (1 << 19) | (1 << 21) | (1 << 23) | (1 << 25) | (1 << 27) |
        (1 << 30) | (1 << 32) | (1 << 34) | (1 << 36);

    struct Spin {
        address player;
        BetType betType;
        uint8 betValue;
        uint8 result;
        uint256 betAmount;
        uint256 payout;
        bool won;
        bytes32 randomSeed;
        uint256 blockNumber;
        uint256 timestamp;
    }

    Spin[] public spins;
    mapping(address => uint256[]) public playerSpins;

    uint256 public totalSpinsPlayed;
    uint256 public totalWagered;
    uint256 public totalPaidOut;

    /// @notice Place a bet and spin the wheel.
    /// @param betType The type of bet (see BetType enum)
    /// @param betValue For Number bets: the number (0-36). Ignored for other bet types.
    function spin(uint8 betType, uint8 betValue)
        external
        payable
        returns (uint256 spinId, uint8 result, bool won, uint256 payout)
    {
        if (msg.value < MIN_BET) revert BetTooSmall();
        if (msg.value > MAX_BET) revert BetTooLarge();
        if (betType > uint8(BetType.Dozen3rd)) revert InvalidBetValue();
        if (BetType(betType) == BetType.Number && betValue > 36) revert InvalidBetValue();

        bytes32 randomSeed = keccak256(
            abi.encodePacked(block.prevrandao, block.number, msg.sender, spins.length)
        );
        result = uint8(uint256(randomSeed) % 37);

        uint256 multiplier = _checkWin(BetType(betType), betValue, result);
        won = multiplier > 0;
        payout = won ? msg.value * multiplier : 0;

        if (won) {
            if (address(this).balance < payout) revert InsufficientHouseBalance();
        }

        spinId = spins.length;
        spins.push(Spin({
            player: msg.sender,
            betType: BetType(betType),
            betValue: betValue,
            result: result,
            betAmount: msg.value,
            payout: payout,
            won: won,
            randomSeed: randomSeed,
            blockNumber: block.number,
            timestamp: block.timestamp
        }));

        playerSpins[msg.sender].push(spinId);
        totalSpinsPlayed++;
        totalWagered += msg.value;

        if (won) {
            totalPaidOut += payout;
            (bool ok,) = msg.sender.call{value: payout}("");
            if (!ok) revert PayoutFailed();
        }

        emit SpinResult(spinId, msg.sender, BetType(betType), betValue, result, msg.value, payout, won, randomSeed);
    }

    /// @dev Returns the payout multiplier (0 = loss). Multiplier includes original bet.
    function _checkWin(BetType betType, uint8 betValue, uint8 result) internal pure returns (uint256) {
        if (betType == BetType.Number) {
            return result == betValue ? 36 : 0;
        }
        // Zero loses all outside bets
        if (result == 0) return 0;

        if (betType == BetType.Red) {
            return _isRed(result) ? 2 : 0;
        }
        if (betType == BetType.Black) {
            return !_isRed(result) ? 2 : 0;
        }
        if (betType == BetType.Even) {
            return result % 2 == 0 ? 2 : 0;
        }
        if (betType == BetType.Odd) {
            return result % 2 == 1 ? 2 : 0;
        }
        if (betType == BetType.Low) {
            return result <= 18 ? 2 : 0;
        }
        if (betType == BetType.High) {
            return result >= 19 ? 2 : 0;
        }
        if (betType == BetType.Dozen1st) {
            return result <= 12 ? 3 : 0;
        }
        if (betType == BetType.Dozen2nd) {
            return result >= 13 && result <= 24 ? 3 : 0;
        }
        if (betType == BetType.Dozen3rd) {
            return result >= 25 ? 3 : 0;
        }
        return 0;
    }

    function _isRed(uint8 number) internal pure returns (bool) {
        return (RED_BITMAP >> number) & 1 == 1;
    }

    function isRed(uint8 number) external pure returns (bool) {
        return _isRed(number);
    }

    function fundHouse() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }

    function totalGames() external view returns (uint256) {
        return spins.length;
    }

    function getPlayerSpins(address player) external view returns (uint256[] memory) {
        return playerSpins[player];
    }

    function houseBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function latestSpin() external view returns (
        uint256 spinId, address player, uint8 betType, uint8 betValue,
        uint8 result, uint256 betAmount, uint256 payout, bool won, bytes32 randomSeed
    ) {
        if (spins.length == 0) return (0, address(0), 0, 0, 0, 0, 0, false, bytes32(0));
        Spin memory s = spins[spins.length - 1];
        return (spins.length - 1, s.player, uint8(s.betType), s.betValue, s.result, s.betAmount, s.payout, s.won, s.randomSeed);
    }

    receive() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }
}
