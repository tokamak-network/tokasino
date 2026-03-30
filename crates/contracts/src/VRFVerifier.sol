// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IVRFVerifier
/// @notice Interface for verifying VRF (Verifiable Random Function) proofs on-chain.
interface IVRFVerifier {
    /// @notice Verify a VRF proof against a public key and input.
    /// @param publicKey The VRF public key (BLS12-381 compressed point).
    /// @param input The original input that was signed.
    /// @param output The claimed VRF output hash.
    /// @param proof The VRF proof bytes.
    /// @return valid True if the proof is valid, false otherwise.
    function verify(
        bytes32 publicKey,
        bytes calldata input,
        bytes32 output,
        bytes calldata proof
    ) external pure returns (bool valid);
}

/// @title VRFVerifier
/// @notice Phase 1 placeholder for VRF proof verification.
/// @dev WARNING: This contract currently returns `true` for all verification
///      requests. It exists as a placeholder to establish the interface and
///      integration points. In Phase 2, real BLS12-381 VRF verification will
///      be implemented via a dedicated precompile for gas-efficient elliptic
///      curve operations that are infeasible in pure Solidity.
///
///      Phase 2 plan:
///      - A BLS12-381 precompile will be deployed at a reserved address.
///      - This contract will delegate proof verification to that precompile.
///      - The precompile will perform pairing checks and point multiplications
///        natively, keeping gas costs practical for on-chain verification.
contract VRFVerifier is IVRFVerifier {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted each time a verification is attempted (useful for monitoring
    ///         during the placeholder phase).
    /// @param publicKey The public key used in the verification attempt.
    /// @param output The claimed VRF output.
    event VerificationAttempted(bytes32 indexed publicKey, bytes32 output);

    // -------------------------------------------------------------------------
    // External functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IVRFVerifier
    /// @dev Phase 1 stub: always returns true.
    ///      TODO: Replace with real BLS12-381 VRF verification via precompile.
    function verify(
        bytes32 publicKey,
        bytes calldata /* input */,
        bytes32 output,
        bytes calldata /* proof */
    ) external pure override returns (bool valid) {
        // Silence unused-variable warnings while keeping the interface stable.
        publicKey;
        output;

        // Phase 1: accept all proofs unconditionally.
        // Real verification will be added when the BLS12-381 precompile is available.
        return true;
    }
}
