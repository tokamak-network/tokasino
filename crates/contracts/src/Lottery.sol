// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Lottery
/// @notice Round-based lottery powered by on-chain VRF randomness.
///         Players buy tickets, then anyone can trigger the draw after ROUND_DURATION blocks.
///         Winners claim prizes via pull pattern.
contract Lottery {
    enum RoundStatus { Open, Completed }

    event TicketPurchased(uint256 indexed roundId, address indexed player, uint256 ticketIndex);
    event RoundDrawn(uint256 indexed roundId, uint256 winningNumber, uint256 prizePool, uint256 winnerCount);
    event PrizeClaimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event HouseFunded(address indexed funder, uint256 amount);

    error RoundNotOpen();
    error RoundNotCompleted();
    error RoundStillOpen();
    error AlreadyClaimed();
    error NotAWinner();
    error NoTickets();
    error TransferFailed();

    uint256 public constant TICKET_PRICE = 0.01 ether;
    uint256 public constant ROUND_DURATION = 50; // blocks
    uint256 public constant HOUSE_CUT_BPS = 1000; // 10%
    uint256 public constant WINNING_RANGE = 100; // numbers 0-99

    struct Ticket {
        address player;
        uint256 number; // 0 to WINNING_RANGE-1
    }

    struct Round {
        uint256 startBlock;
        RoundStatus status;
        Ticket[] tickets;
        uint256 winningNumber;
        uint256 prizePool;
        bytes32 randomSeed;
        uint256 winnerCount;
        mapping(address => bool) claimed;
        mapping(address => uint256) ticketCount;
    }

    uint256 public currentRoundId;
    mapping(uint256 => Round) internal rounds;
    uint256 public totalPrizesPaid;

    constructor() {
        _startNewRound();
    }

    /// @notice Buy a ticket for the current round with a chosen number (0 to 99).
    /// @param number Your chosen number
    function buyTicket(uint256 number) external payable {
        require(number < WINNING_RANGE, "Number out of range");
        require(msg.value == TICKET_PRICE, "Wrong ticket price");

        Round storage r = rounds[currentRoundId];
        if (r.status != RoundStatus.Open) revert RoundNotOpen();

        uint256 ticketIndex = r.tickets.length;
        r.tickets.push(Ticket({player: msg.sender, number: number}));
        r.ticketCount[msg.sender]++;
        r.prizePool += msg.value;

        emit TicketPurchased(currentRoundId, msg.sender, ticketIndex);
    }

    /// @notice Draw the winning number. Can be called by anyone after ROUND_DURATION blocks.
    function draw() external {
        Round storage r = rounds[currentRoundId];
        if (r.status != RoundStatus.Open) revert RoundNotOpen();
        if (block.number < r.startBlock + ROUND_DURATION) revert RoundStillOpen();
        if (r.tickets.length == 0) revert NoTickets();

        bytes32 randomSeed = keccak256(
            abi.encodePacked(block.prevrandao, block.number, currentRoundId)
        );
        uint256 winningNumber = uint256(randomSeed) % WINNING_RANGE;

        // Count winners
        uint256 winnerCount = 0;
        for (uint256 i = 0; i < r.tickets.length; i++) {
            if (r.tickets[i].number == winningNumber) {
                winnerCount++;
            }
        }

        // Take house cut
        uint256 houseCut = (r.prizePool * HOUSE_CUT_BPS) / 10000;
        r.prizePool -= houseCut;

        r.winningNumber = winningNumber;
        r.winnerCount = winnerCount;
        r.status = RoundStatus.Completed;
        r.randomSeed = randomSeed;

        emit RoundDrawn(currentRoundId, winningNumber, r.prizePool, winnerCount);

        // If no winners, carry over prize pool to next round
        uint256 carryOver = winnerCount == 0 ? r.prizePool : 0;
        currentRoundId++;
        _startNewRound();
        if (carryOver > 0) {
            rounds[currentRoundId].prizePool += carryOver;
        }
    }

    /// @notice Claim your prize from a completed round.
    /// @param roundId The round to claim from
    function claimPrize(uint256 roundId) external {
        Round storage r = rounds[roundId];
        if (r.status != RoundStatus.Completed) revert RoundNotCompleted();
        if (r.claimed[msg.sender]) revert AlreadyClaimed();
        if (r.winnerCount == 0) revert NotAWinner();

        // Count caller's winning tickets
        uint256 myWins = 0;
        for (uint256 i = 0; i < r.tickets.length; i++) {
            if (r.tickets[i].player == msg.sender && r.tickets[i].number == r.winningNumber) {
                myWins++;
            }
        }
        if (myWins == 0) revert NotAWinner();

        r.claimed[msg.sender] = true;
        uint256 prize = (r.prizePool * myWins) / r.winnerCount;
        totalPrizesPaid += prize;

        (bool ok,) = msg.sender.call{value: prize}("");
        if (!ok) revert TransferFailed();

        emit PrizeClaimed(roundId, msg.sender, prize);
    }

    function _startNewRound() internal {
        rounds[currentRoundId].startBlock = block.number;
        rounds[currentRoundId].status = RoundStatus.Open;
    }

    // View functions

    function getRoundInfo(uint256 roundId) external view returns (
        uint256 startBlock,
        uint8 status,
        uint256 ticketCount,
        uint256 winningNumber,
        uint256 prizePool,
        bytes32 randomSeed,
        uint256 winnerCount
    ) {
        Round storage r = rounds[roundId];
        return (
            r.startBlock,
            uint8(r.status),
            r.tickets.length,
            r.winningNumber,
            r.prizePool,
            r.randomSeed,
            r.winnerCount
        );
    }

    function getBlocksRemaining() external view returns (uint256) {
        Round storage r = rounds[currentRoundId];
        uint256 endBlock = r.startBlock + ROUND_DURATION;
        if (block.number >= endBlock) return 0;
        return endBlock - block.number;
    }

    function getMyTickets(uint256 roundId, address player) external view returns (uint256[] memory numbers) {
        Round storage r = rounds[roundId];
        uint256 count = r.ticketCount[player];
        numbers = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < r.tickets.length; i++) {
            if (r.tickets[i].player == player) {
                numbers[idx++] = r.tickets[i].number;
            }
        }
    }

    function hasClaimed(uint256 roundId, address player) external view returns (bool) {
        return rounds[roundId].claimed[player];
    }

    function fundHouse() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }

    function houseBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }
}
