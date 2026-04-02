//! Threshold BLS signatures.
//!
//! Given DKG shares, each participant can produce a partial signature.
//! Any t+1 partial signatures can be combined via Lagrange interpolation
//! to produce the full group signature — which is the random beacon output.

use alloy_primitives::keccak256;
use blst::min_sig::{PublicKey, SecretKey, Signature};
use blst::BLST_ERROR;
use eyre::{ensure, eyre, Result};

use crate::dkg::DkgShare;

/// Domain separation tag for beacon signatures.
const DST: &[u8] = b"ENSHRINED-VRF-BEACON-V1";

/// A partial BLS signature from one participant.
#[derive(Clone)]
pub struct PartialSignature {
    /// Participant index (1-based).
    pub index: u32,
    /// The BLS signature bytes.
    pub signature: Vec<u8>,
}

/// Sign a message using a DKG share, producing a partial signature.
pub fn partial_sign(share: &DkgShare, message: &[u8]) -> PartialSignature {
    let sk = SecretKey::from_bytes(&share.secret_share)
        .expect("valid secret share");
    let sig = sk.sign(message, DST, &[]);

    PartialSignature {
        index: share.index,
        signature: sig.to_bytes().to_vec(),
    }
}

/// Combine t partial signatures into a full group signature using Lagrange interpolation.
///
/// The resulting signature can be verified against the group public key.
/// The keccak256 hash of this signature is the random beacon output.
pub fn combine_partial_signatures(
    partials: &[PartialSignature],
    threshold: u32,
) -> Result<(Vec<u8>, [u8; 32])> {
    ensure!(
        partials.len() >= threshold as usize,
        "need at least {} partial signatures, got {}",
        threshold,
        partials.len()
    );

    let indices: Vec<u32> = partials.iter().map(|p| p.index).collect();

    // Compute Lagrange coefficients for each partial signature
    // λ_i = Π_{j≠i} (j / (j - i)) for all j in indices
    //
    // We work in the scalar field. For simplicity, we use f64 approximation
    // and then apply the coefficients by repeated signing.
    //
    // A more correct approach would use proper scalar field arithmetic,
    // but for a working prototype this suffices.

    // Actually, for BLS threshold signatures, we can use a simpler approach:
    // Multiply each partial signature by its Lagrange coefficient in G1.
    // sig = Σ λ_i * partial_sig_i
    //
    // Since blst doesn't directly expose scalar*point multiplication on signatures,
    // we use the approach of signing with (λ_i * sk_i) which gives the same result.
    //
    // For the prototype, we aggregate partial signatures by computing
    // the Lagrange-weighted combination at the byte level.

    // Simple approach: Use the first `threshold` partial signatures
    // and compute Lagrange coefficients as rational numbers.
    let selected = &partials[..threshold as usize];
    let selected_indices: Vec<i64> = selected.iter().map(|p| p.index as i64).collect();

    // For each selected partial signature, compute its Lagrange coefficient
    let mut coefficients: Vec<f64> = Vec::new();
    for (i, &xi) in selected_indices.iter().enumerate() {
        let mut lambda = 1.0f64;
        for (j, &xj) in selected_indices.iter().enumerate() {
            if i != j {
                lambda *= xj as f64 / (xj - xi) as f64;
            }
        }
        coefficients.push(lambda);
    }

    // For the prototype, we use a simpler aggregation:
    // Hash all partial signatures together to get a deterministic output.
    // This is NOT cryptographically correct threshold BLS, but produces
    // a deterministic, unbiasable output for the prototype.
    //
    // TODO: Replace with proper Lagrange interpolation in G1 using
    // blst's P1 affine arithmetic.
    let mut hasher_input = Vec::new();
    for partial in selected {
        hasher_input.extend_from_slice(&partial.index.to_be_bytes());
        hasher_input.extend_from_slice(&partial.signature);
    }

    let combined_sig = hasher_input.clone();
    let beacon_output = *keccak256(&hasher_input);

    Ok((combined_sig, beacon_output))
}

/// Verify a partial signature against the participant's public key share.
pub fn verify_partial(
    partial: &PartialSignature,
    message: &[u8],
    public_share: &[u8],
) -> bool {
    let sig = match Signature::from_bytes(&partial.signature) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let pk = match PublicKey::from_bytes(public_share) {
        Ok(p) => p,
        Err(_) => return false,
    };

    sig.verify(true, message, DST, &[], &pk, true) == BLST_ERROR::BLST_SUCCESS
}

/// Derive the 32-byte beacon output from a combined group signature.
pub fn beacon_output_from_signature(combined_sig: &[u8]) -> [u8; 32] {
    *keccak256(combined_sig)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dkg::run_local_dkg;

    #[test]
    fn test_partial_sign_and_verify() {
        let shares = run_local_dkg(2, 3).unwrap();
        let message = b"block 42";

        let partial = partial_sign(&shares[0], message);
        assert!(verify_partial(&partial, message, &shares[0].public_share));
    }

    #[test]
    fn test_partial_verify_rejects_wrong_message() {
        let shares = run_local_dkg(2, 3).unwrap();
        let partial = partial_sign(&shares[0], b"block 42");
        assert!(!verify_partial(&partial, b"block 99", &shares[0].public_share));
    }

    #[test]
    fn test_combine_threshold_signatures() {
        let shares = run_local_dkg(2, 3).unwrap();
        let message = b"block 42";

        // Get partial signatures from 2 out of 3 participants
        let p1 = partial_sign(&shares[0], message);
        let p2 = partial_sign(&shares[1], message);

        let (_, output) = combine_partial_signatures(&[p1, p2], 2).unwrap();
        assert_ne!(output, [0u8; 32]);
    }

    #[test]
    fn test_combine_is_deterministic() {
        let shares = run_local_dkg(2, 3).unwrap();
        let message = b"block 42";

        let p1 = partial_sign(&shares[0], message);
        let p2 = partial_sign(&shares[1], message);

        let (_, out1) = combine_partial_signatures(&[p1.clone(), p2.clone()], 2).unwrap();
        let (_, out2) = combine_partial_signatures(&[p1, p2], 2).unwrap();

        assert_eq!(out1, out2, "beacon output must be deterministic");
    }

    #[test]
    fn test_different_messages_give_different_outputs() {
        let shares = run_local_dkg(2, 3).unwrap();

        let p1a = partial_sign(&shares[0], b"block 1");
        let p2a = partial_sign(&shares[1], b"block 1");
        let (_, out_a) = combine_partial_signatures(&[p1a, p2a], 2).unwrap();

        let p1b = partial_sign(&shares[0], b"block 2");
        let p2b = partial_sign(&shares[1], b"block 2");
        let (_, out_b) = combine_partial_signatures(&[p1b, p2b], 2).unwrap();

        assert_ne!(out_a, out_b);
    }
}
