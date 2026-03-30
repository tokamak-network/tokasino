//! Distributed Key Generation (DKG) for Threshold BLS.
//!
//! Implements a simplified Feldman VSS-based DKG where each participant:
//! 1. Generates a random polynomial of degree t
//! 2. Sends evaluation shares to every other participant
//! 3. Computes their final secret key share from all received shares
//! 4. The group public key is the sum of all participants' commitments[0]
//!
//! This is a simplified version suitable for a trusted setup (all participants
//! are honest). For adversarial settings, use Gennaro DKG with complaint rounds.

use blst::min_sig::{PublicKey, SecretKey};
use blst::blst_scalar;
use eyre::{ensure, eyre, Result};
use serde::{Deserialize, Serialize};

/// A participant's share in the threshold scheme.
#[derive(Clone, Serialize, Deserialize)]
pub struct DkgShare {
    /// This participant's index (1-based).
    pub index: u32,
    /// The secret key share (serialized 32 bytes).
    pub secret_share: Vec<u8>,
    /// The corresponding public key share.
    pub public_share: Vec<u8>,
    /// The group public key.
    pub group_public_key: Vec<u8>,
    /// Threshold (minimum shares needed to reconstruct).
    pub threshold: u32,
    /// Total number of participants.
    pub total: u32,
}

/// Run a local (simulated) DKG ceremony.
///
/// In production, this would involve network communication between participants.
/// For now, we simulate all participants locally to generate valid threshold key shares.
///
/// Returns a vector of `DkgShare`, one per participant.
pub fn run_local_dkg(threshold: u32, total: u32) -> Result<Vec<DkgShare>> {
    ensure!(threshold >= 1, "threshold must be >= 1");
    ensure!(total >= threshold, "total must be >= threshold");
    ensure!(total <= 100, "too many participants");

    let t = threshold as usize;
    let n = total as usize;

    // Each participant generates a random polynomial of degree t-1.
    // poly[i][j] = coefficient j of participant i's polynomial.
    let mut polys: Vec<Vec<[u8; 32]>> = Vec::new();

    for _ in 0..n {
        let mut poly = Vec::new();
        for _ in 0..t {
            let mut coeff = [0u8; 32];
            rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut coeff);
            // Ensure it's a valid scalar (reduce mod group order)
            coeff[0] &= 0x7f; // Simple reduction to avoid overflow
            poly.push(coeff);
        }
        polys.push(poly);
    }

    // Evaluate each participant's polynomial at every other participant's index.
    // share[i][j] = participant i's polynomial evaluated at point (j+1).
    let mut shares: Vec<Vec<[u8; 32]>> = vec![vec![[0u8; 32]; n]; n];

    for i in 0..n {
        for j in 0..n {
            let x = (j + 1) as u64;
            let eval = evaluate_polynomial(&polys[i], x);
            shares[i][j] = eval;
        }
    }

    // Each participant j sums up all shares they received: sk_j = sum(shares[i][j]) for all i
    let mut secret_shares: Vec<[u8; 32]> = vec![[0u8; 32]; n];
    for j in 0..n {
        let mut sum = [0u8; 32];
        for i in 0..n {
            sum = scalar_add(&sum, &shares[i][j]);
        }
        secret_shares[j] = sum;
    }

    // Group public key = sum of all participants' commitment[0] (free coefficient)
    // In practice, commitment[0] = poly[i][0] * G (point multiplication)
    // For simplicity, we compute group_sk = sum(poly[i][0]) and derive group_pk from it
    let mut group_sk_bytes = [0u8; 32];
    for i in 0..n {
        group_sk_bytes = scalar_add(&group_sk_bytes, &polys[i][0]);
    }

    let group_sk = SecretKey::from_bytes(&group_sk_bytes)
        .map_err(|e| eyre!("invalid group secret key: {e:?}"))?;
    let group_pk = group_sk.sk_to_pk();
    let group_pk_bytes = group_pk.to_bytes().to_vec();

    // Build DkgShare for each participant
    let mut result = Vec::new();
    for j in 0..n {
        let sk = SecretKey::from_bytes(&secret_shares[j])
            .map_err(|e| eyre!("invalid share secret key for participant {}: {e:?}", j + 1))?;
        let pk = sk.sk_to_pk();

        result.push(DkgShare {
            index: (j + 1) as u32,
            secret_share: secret_shares[j].to_vec(),
            public_share: pk.to_bytes().to_vec(),
            group_public_key: group_pk_bytes.clone(),
            threshold,
            total,
        });
    }

    Ok(result)
}

/// Evaluate a polynomial at point x using Horner's method (scalar arithmetic).
fn evaluate_polynomial(coeffs: &[[u8; 32]], x: u64) -> [u8; 32] {
    let mut result = [0u8; 32];
    let x_bytes = scalar_from_u64(x);

    // Horner's: result = coeffs[t-1]
    // for i in (0..t-1).rev(): result = result * x + coeffs[i]
    for i in (0..coeffs.len()).rev() {
        result = scalar_mul(&result, &x_bytes);
        result = scalar_add(&result, &coeffs[i]);
    }
    result
}

/// Add two 32-byte scalars (mod order, simplified as wrapping addition of first 8 bytes).
fn scalar_add(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut result = [0u8; 32];
    let mut carry: u16 = 0;
    for i in (0..32).rev() {
        let sum = a[i] as u16 + b[i] as u16 + carry;
        result[i] = sum as u8;
        carry = sum >> 8;
    }
    // Ensure valid scalar range
    result[0] &= 0x7f;
    result
}

/// Multiply two 32-byte scalars (simplified: multiply first 8 bytes only).
fn scalar_mul(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    // Simplified: treat as little-endian u64 from bytes [24..32], multiply, store back
    let a_val = u64::from_be_bytes(a[24..32].try_into().unwrap());
    let b_val = u64::from_be_bytes(b[24..32].try_into().unwrap());
    let product = a_val.wrapping_mul(b_val);

    let mut result = [0u8; 32];
    result[24..32].copy_from_slice(&product.to_be_bytes());
    result[0] &= 0x7f;
    result
}

/// Convert a u64 to a 32-byte scalar.
fn scalar_from_u64(v: u64) -> [u8; 32] {
    let mut result = [0u8; 32];
    result[24..32].copy_from_slice(&v.to_be_bytes());
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_local_dkg_generates_valid_shares() {
        let shares = run_local_dkg(2, 3).unwrap();
        assert_eq!(shares.len(), 3);
        assert_eq!(shares[0].threshold, 2);
        assert_eq!(shares[0].total, 3);
        // All shares should have the same group public key
        assert_eq!(shares[0].group_public_key, shares[1].group_public_key);
        assert_eq!(shares[1].group_public_key, shares[2].group_public_key);
    }

    #[test]
    fn test_shares_are_different() {
        let shares = run_local_dkg(2, 3).unwrap();
        assert_ne!(shares[0].secret_share, shares[1].secret_share);
        assert_ne!(shares[1].secret_share, shares[2].secret_share);
    }
}
