// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IDRBCommitReveal
/// @notice Interface for consumers that need DRB-generated distributed randomness.
interface IDRBCommitReveal {
    /// @notice Returns the finalized randomness for a given round.
    /// @param roundId The round number to query.
    /// @return The bytes32 finalized randomness.
    function getRoundRandomness(uint256 roundId) external view returns (bytes32);

    /// @notice Returns the latest finalized round ID.
    /// @return The round ID.
    function latestFinalizedRound() external view returns (uint256);
}

/// @title DRBCommitReveal
/// @notice Distributed Random Beacon using commit-reveal protocol.
///         Multiple operators commit hashed secrets, then reveal them in sequence.
///         The final randomness is derived from all revealed values, ensuring that
///         no single operator can predict or bias the outcome.
/// @dev Security model: N-of-N reveal required. If any operator fails to reveal
///      within the deadline, the round is cancelled and operators can start a new one.
///      As long as at least 1 operator is honest, the randomness is unpredictable.
contract DRBCommitReveal is IDRBCommitReveal {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum RoundPhase {
        /// @dev Round does not exist yet.
        None,
        /// @dev Operators are submitting commitments.
        Commit,
        /// @dev Operators are revealing their secrets.
        Reveal,
        /// @dev All reveals collected, randomness finalized.
        Finalized,
        /// @dev Round expired due to missing reveals.
        Expired
    }

    struct Round {
        /// @dev Current phase of the round.
        RoundPhase phase;
        /// @dev Block number when the commit phase started.
        uint64 commitStartBlock;
        /// @dev Block number when the commit phase ends (exclusive).
        uint64 commitDeadline;
        /// @dev Block number when the reveal phase ends (exclusive).
        uint64 revealDeadline;
        /// @dev Number of commitments received.
        uint32 commitCount;
        /// @dev Number of reveals received.
        uint32 revealCount;
        /// @dev Running XOR of all revealed values, then hashed at finalization.
        bytes32 accumulatedRandomness;
        /// @dev The finalized randomness for this round.
        bytes32 finalRandomness;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Minimum number of operators required to run a round.
    uint32 public constant MIN_OPERATORS = 2;

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice Duration of the commit phase in blocks.
    uint64 public immutable commitPhaseDuration;

    /// @notice Duration of the reveal phase in blocks.
    uint64 public immutable revealPhaseDuration;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Set of registered operators.
    mapping(address => bool) public isOperator;

    /// @notice Total number of registered operators.
    uint32 public operatorCount;

    /// @notice Current round ID (incremented for each new round).
    uint256 public currentRoundId;

    /// @notice The latest round that reached Finalized state.
    uint256 public override latestFinalizedRound;

    /// @notice Round data.
    mapping(uint256 => Round) public rounds;

    /// @notice Commitments per round: roundId => operator => commitment hash.
    mapping(uint256 => mapping(address => bytes32)) public commitments;

    /// @notice Whether an operator has revealed in a given round.
    mapping(uint256 => mapping(address => bool)) public hasRevealed;

    /// @notice Contract admin (can register/remove operators).
    address public admin;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event OperatorRegistered(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event RoundStarted(uint256 indexed roundId, uint64 commitDeadline, uint64 revealDeadline);
    event CommitSubmitted(uint256 indexed roundId, address indexed operator);
    event RevealSubmitted(uint256 indexed roundId, address indexed operator);
    event RoundFinalized(uint256 indexed roundId, bytes32 randomness);
    event RoundExpired(uint256 indexed roundId);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error OnlyAdmin();
    error AlreadyOperator();
    error NotOperator();
    error InsufficientOperators();
    error RoundNotInCommitPhase();
    error RoundNotInRevealPhase();
    error CommitDeadlinePassed();
    error RevealDeadlineNotPassed();
    error AlreadyCommitted();
    error NotCommitted();
    error AlreadyRevealed();
    error InvalidReveal();
    error RoundNotFinalized(uint256 roundId);
    error PreviousRoundStillActive();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _commitPhaseDuration Number of blocks for the commit phase.
    /// @param _revealPhaseDuration Number of blocks for the reveal phase.
    constructor(uint64 _commitPhaseDuration, uint64 _revealPhaseDuration) {
        admin = msg.sender;
        commitPhaseDuration = _commitPhaseDuration;
        revealPhaseDuration = _revealPhaseDuration;
    }

    // -------------------------------------------------------------------------
    // Admin functions
    // -------------------------------------------------------------------------

    /// @notice Register a new operator.
    function registerOperator(address operator) external onlyAdmin {
        if (isOperator[operator]) revert AlreadyOperator();
        isOperator[operator] = true;
        operatorCount++;
        emit OperatorRegistered(operator);
    }

    /// @notice Remove an operator.
    function removeOperator(address operator) external onlyAdmin {
        if (!isOperator[operator]) revert NotOperator();
        isOperator[operator] = false;
        operatorCount--;
        emit OperatorRemoved(operator);
    }

    // -------------------------------------------------------------------------
    // Round lifecycle
    // -------------------------------------------------------------------------

    /// @notice Start a new commit-reveal round.
    /// @dev Anyone can start a round, but there must be enough operators
    ///      and no active round in progress.
    function startRound() external returns (uint256 roundId) {
        if (operatorCount < MIN_OPERATORS) revert InsufficientOperators();

        // Ensure no active round
        if (currentRoundId > 0) {
            Round storage prev = rounds[currentRoundId];
            if (prev.phase == RoundPhase.Commit || prev.phase == RoundPhase.Reveal) {
                revert PreviousRoundStillActive();
            }
        }

        currentRoundId++;
        roundId = currentRoundId;

        uint64 commitDeadline = uint64(block.number) + commitPhaseDuration;
        uint64 revealDeadline = commitDeadline + revealPhaseDuration;

        rounds[roundId] = Round({
            phase: RoundPhase.Commit,
            commitStartBlock: uint64(block.number),
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            commitCount: 0,
            revealCount: 0,
            accumulatedRandomness: bytes32(0),
            finalRandomness: bytes32(0)
        });

        emit RoundStarted(roundId, commitDeadline, revealDeadline);
    }

    /// @notice Submit a commitment (hash of the secret).
    /// @param commitment The keccak256 hash of (secret || msg.sender).
    function commit(bytes32 commitment) external onlyOperator {
        uint256 roundId = currentRoundId;
        Round storage round = rounds[roundId];

        if (round.phase != RoundPhase.Commit) revert RoundNotInCommitPhase();
        if (block.number >= round.commitDeadline) {
            // Transition to reveal phase
            round.phase = RoundPhase.Reveal;
            revert RoundNotInCommitPhase();
        }
        if (commitments[roundId][msg.sender] != bytes32(0)) revert AlreadyCommitted();

        commitments[roundId][msg.sender] = commitment;
        round.commitCount++;

        emit CommitSubmitted(roundId, msg.sender);
    }

    /// @notice Reveal the secret that was previously committed.
    /// @param secret The original secret value.
    function reveal(bytes32 secret) external onlyOperator {
        uint256 roundId = currentRoundId;
        Round storage round = rounds[roundId];

        // Auto-transition from commit to reveal if deadline passed
        if (round.phase == RoundPhase.Commit && block.number >= round.commitDeadline) {
            round.phase = RoundPhase.Reveal;
        }

        if (round.phase != RoundPhase.Reveal) revert RoundNotInRevealPhase();

        // Check reveal deadline
        if (block.number >= round.revealDeadline) {
            round.phase = RoundPhase.Expired;
            emit RoundExpired(roundId);
            revert RoundNotInRevealPhase();
        }

        if (hasRevealed[roundId][msg.sender]) revert AlreadyRevealed();
        if (commitments[roundId][msg.sender] == bytes32(0)) revert NotCommitted();

        // Verify the reveal matches the commitment
        bytes32 expectedCommitment = keccak256(abi.encodePacked(secret, msg.sender));
        if (commitments[roundId][msg.sender] != expectedCommitment) revert InvalidReveal();

        hasRevealed[roundId][msg.sender] = true;
        round.revealCount++;

        // Accumulate: XOR each revealed secret into the running value
        round.accumulatedRandomness = round.accumulatedRandomness ^ secret;

        emit RevealSubmitted(roundId, msg.sender);

        // Auto-finalize if all committers have revealed
        if (round.revealCount == round.commitCount) {
            _finalize(roundId, round);
        }
    }

    /// @notice Expire a round if the reveal deadline has passed without full reveals.
    function expireRound(uint256 roundId) external {
        Round storage round = rounds[roundId];

        if (round.phase == RoundPhase.Commit && block.number >= round.commitDeadline) {
            round.phase = RoundPhase.Reveal;
        }

        if (round.phase == RoundPhase.Reveal && block.number >= round.revealDeadline) {
            round.phase = RoundPhase.Expired;
            emit RoundExpired(roundId);
        }
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IDRBCommitReveal
    function getRoundRandomness(uint256 roundId) external view override returns (bytes32) {
        Round storage round = rounds[roundId];
        if (round.phase != RoundPhase.Finalized) revert RoundNotFinalized(roundId);
        return round.finalRandomness;
    }

    /// @notice Get the current round's phase.
    function getCurrentPhase() external view returns (RoundPhase) {
        if (currentRoundId == 0) return RoundPhase.None;

        Round storage round = rounds[currentRoundId];

        // Return effective phase considering deadlines
        if (round.phase == RoundPhase.Commit && block.number >= round.commitDeadline) {
            if (block.number >= round.revealDeadline) return RoundPhase.Expired;
            return RoundPhase.Reveal;
        }
        if (round.phase == RoundPhase.Reveal && block.number >= round.revealDeadline) {
            return RoundPhase.Expired;
        }

        return round.phase;
    }

    /// @notice Get round details.
    function getRound(uint256 roundId) external view returns (
        RoundPhase phase,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint32 commitCount,
        uint32 revealCount
    ) {
        Round storage round = rounds[roundId];
        return (
            round.phase,
            round.commitDeadline,
            round.revealDeadline,
            round.commitCount,
            round.revealCount
        );
    }

    // -------------------------------------------------------------------------
    // Internal functions
    // -------------------------------------------------------------------------

    /// @dev Finalize the round by hashing the accumulated randomness.
    function _finalize(uint256 roundId, Round storage round) internal {
        round.finalRandomness = keccak256(
            abi.encodePacked(round.accumulatedRandomness, roundId)
        );
        round.phase = RoundPhase.Finalized;
        latestFinalizedRound = roundId;

        emit RoundFinalized(roundId, round.finalRandomness);
    }
}
