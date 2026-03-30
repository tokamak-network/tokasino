// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IRandomBeaconHistory
/// @notice Read-only interface for consumers that need historical randomness.
interface IRandomBeaconHistory {
    /// @notice Returns the source of randomness committed for a given block height.
    /// @param blockHeight The block number to query.
    /// @return The bytes32 source of randomness for that block.
    function getRandomness(uint256 blockHeight) external view returns (bytes32);
}

/// @title RandomBeaconHistory
/// @notice System contract that stores per-block sources of randomness submitted by
///         the consensus layer via the SYSTEM_ADDRESS.
/// @dev Only the special system address (0xfffffffffffffffffffffffffffffffffffffffe) is
///      permitted to submit randomness. This contract is typically called by the node
///      software at the end of each block to record the VRF-derived seed.
contract RandomBeaconHistory is IRandomBeaconHistory {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice The privileged system address used by the execution layer to invoke
    ///         system-level contract calls.
    address public constant SYSTEM_ADDRESS = 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Mapping from block height to its committed source of randomness.
    mapping(uint256 => bytes32) public sourceOfRandomness;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new source of randomness is stored.
    /// @param blockNumber The block height the randomness is associated with.
    /// @param randomSeed The bytes32 seed committed for that block.
    event RandomnessSubmitted(uint64 indexed blockNumber, bytes32 randomSeed);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Thrown when a caller other than SYSTEM_ADDRESS attempts to submit randomness.
    error OnlySystemAddress();

    /// @notice Thrown when randomness for a given block has already been submitted.
    error RandomnessAlreadySubmitted(uint64 blockNumber);

    /// @notice Thrown when querying randomness for a block that has not been committed yet.
    error RandomnessNotAvailable(uint256 blockHeight);

    // -------------------------------------------------------------------------
    // External functions
    // -------------------------------------------------------------------------

    /// @notice Submit the source of randomness for a specific block.
    /// @dev Can only be called by the SYSTEM_ADDRESS. Reverts if randomness for the
    ///      given block has already been submitted.
    /// @param randomSeed The VRF-derived random seed for the block.
    /// @param blockNumber The block height this seed corresponds to.
    function submitRandomness(bytes32 randomSeed, uint64 blockNumber) external {
        if (msg.sender != SYSTEM_ADDRESS) {
            revert OnlySystemAddress();
        }
        if (sourceOfRandomness[blockNumber] != bytes32(0)) {
            revert RandomnessAlreadySubmitted(blockNumber);
        }

        sourceOfRandomness[blockNumber] = randomSeed;

        emit RandomnessSubmitted(blockNumber, randomSeed);
    }

    /// @inheritdoc IRandomBeaconHistory
    /// @dev Reverts if no randomness has been committed for the requested block height.
    function getRandomness(uint256 blockHeight) external view override returns (bytes32) {
        bytes32 seed = sourceOfRandomness[blockHeight];
        if (seed == bytes32(0)) {
            revert RandomnessNotAvailable(blockHeight);
        }
        return seed;
    }
}
