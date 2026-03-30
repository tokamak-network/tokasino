// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IRandomness
/// @notice Interface for the on-chain randomness precompile deployed at address 0x0b.
/// @dev The precompile returns a deterministic-per-transaction random value derived
///      from the block's source of randomness and the transaction hash.
interface IRandomness {
    /// @notice Returns a random uint256 unique to the current transaction.
    /// @return A pseudo-random uint256 value.
    function getRandomUint256() external view returns (uint256);
}

/// @title Randomness
/// @notice Helper library that wraps the IRandomness precompile for convenient access.
library Randomness {
    /// @notice The fixed address of the randomness precompile.
    address internal constant PRECOMPILE = address(0x0b);

    /// @notice Fetches a random uint256 from the precompile.
    /// @dev Reverts if the precompile call fails (e.g. precompile not deployed).
    /// @return randomValue A pseudo-random uint256 for the current transaction.
    function getRandomUint256() internal view returns (uint256 randomValue) {
        randomValue = IRandomness(PRECOMPILE).getRandomUint256();
    }
}
