// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VrfRandom
/// @notice On-chain randomness library for the Enshrined VRF L2.
///         Uses block.prevrandao which is backed by VRF/DRB from the CL.
/// @dev    Each call within the same tx gets a unique value via nonce mixing.
///         For gambling/high-value use cases, use the commit-reveal pattern
///         with RandomBeaconHistory instead.
library VrfRandom {
    /// @notice Returns a pseudo-random uint256 unique to this call context.
    /// @param salt Additional entropy (e.g. user address, game ID, counter)
    function random(uint256 salt) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.number,
            block.timestamp,
            msg.sender,
            salt
        )));
    }

    /// @notice Returns a random uint256 without extra salt.
    function random() internal view returns (uint256) {
        return random(0);
    }

    /// @notice Returns a random number in range [min, max] (inclusive).
    function randomRange(uint256 min, uint256 max, uint256 salt) internal view returns (uint256) {
        require(max >= min, "max < min");
        return min + (random(salt) % (max - min + 1));
    }

    /// @notice Returns a random dice roll (1-6).
    function rollDice(uint256 salt) internal view returns (uint8) {
        return uint8(random(salt) % 6) + 1;
    }

    /// @notice Returns a coin flip (true = heads, false = tails).
    function coinFlip(uint256 salt) internal view returns (bool) {
        return random(salt) % 2 == 0;
    }

    /// @notice Shuffles an array of indices [0, length) using Fisher-Yates.
    /// @param length Number of items to shuffle
    /// @param salt Additional entropy
    /// @return shuffled Array of shuffled indices
    function shuffle(uint256 length, uint256 salt) internal view returns (uint256[] memory shuffled) {
        shuffled = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            shuffled[i] = i;
        }
        for (uint256 i = length - 1; i > 0; i--) {
            uint256 j = random(salt + i) % (i + 1);
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
        }
    }

    /// @notice Picks a random item from a weighted list.
    /// @param weights Array of weights (higher = more likely)
    /// @param salt Additional entropy
    /// @return index The selected index
    function weightedRandom(uint256[] memory weights, uint256 salt) internal view returns (uint256 index) {
        uint256 total = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            total += weights[i];
        }
        uint256 roll = random(salt) % total;
        uint256 cumulative = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            cumulative += weights[i];
            if (roll < cumulative) {
                return i;
            }
        }
        return weights.length - 1;
    }
}
