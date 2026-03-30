use blst::min_sig::{PublicKey, SecretKey, Signature};
use blst::BLST_ERROR;
use eyre::{ensure, eyre, Result};
use rand::RngCore;
use std::fs;
use std::path::Path;

/// Domain separation tag for BLS signatures used as VRF.
const DST: &[u8] = b"TOKASINO-VRF-V1";

/// A VRF key pair backed by BLS min-sig (BLS12-381).
pub struct VrfKeyPair {
    pub secret_key: SecretKey,
    pub public_key: PublicKey,
}

impl VrfKeyPair {
    /// Generate a fresh random key pair.
    pub fn generate() -> Result<Self> {
        let mut ikm = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut ikm);

        let secret_key =
            SecretKey::key_gen(&ikm, &[]).map_err(|e| eyre!("BLS key generation failed: {e:?}"))?;
        let public_key = secret_key.sk_to_pk();

        Ok(Self {
            secret_key,
            public_key,
        })
    }

    /// Compute a VRF output and proof for the given `input`.
    ///
    /// Returns `(output, proof)` where:
    /// - `output` is a 32-byte pseudo-random value derived by hashing the BLS signature.
    /// - `proof` is the raw BLS signature bytes that anyone can verify.
    pub fn prove(&self, input: &[u8]) -> ([u8; 32], Vec<u8>) {
        let signature = self.secret_key.sign(input, DST, &[]);
        let sig_bytes = signature.to_bytes().to_vec();

        // Derive the 32-byte VRF output by hashing the signature.
        let output = alloy_primitives::keccak256(&sig_bytes);

        (*output, sig_bytes)
    }

    /// Verify a VRF proof against the given public key and input.
    ///
    /// Checks that:
    /// 1. The `proof` is a valid BLS signature over `input` under `public_key`.
    /// 2. `keccak256(proof) == output`.
    pub fn verify(public_key: &PublicKey, input: &[u8], output: &[u8; 32], proof: &[u8]) -> bool {
        let signature = match Signature::from_bytes(proof) {
            Ok(sig) => sig,
            Err(_) => return false,
        };

        let verify_result = signature.verify(true, input, DST, &[], public_key, true);
        if verify_result != BLST_ERROR::BLST_SUCCESS {
            return false;
        }

        let expected_output = alloy_primitives::keccak256(proof);
        expected_output.as_slice() == output
    }

    /// Save the secret key bytes to a file. The public key can be re-derived.
    pub fn save_to_file(&self, path: &Path) -> Result<()> {
        let sk_bytes = self.secret_key.to_bytes();
        fs::write(path, sk_bytes)?;
        tracing::info!(?path, "VRF key pair saved");
        Ok(())
    }

    /// Load a key pair from a file containing the 32-byte secret key.
    pub fn load_from_file(path: &Path) -> Result<Self> {
        let sk_bytes = fs::read(path)?;
        ensure!(sk_bytes.len() == 32, "invalid secret key length");

        let secret_key = SecretKey::from_bytes(&sk_bytes)
            .map_err(|e| eyre!("failed to deserialize secret key: {e:?}"))?;
        let public_key = secret_key.sk_to_pk();

        tracing::info!(?path, "VRF key pair loaded");
        Ok(Self {
            secret_key,
            public_key,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prove_and_verify() {
        let kp = VrfKeyPair::generate().unwrap();
        let input = b"block 42";

        let (output, proof) = kp.prove(input);
        assert!(VrfKeyPair::verify(&kp.public_key, input, &output, &proof));
    }

    #[test]
    fn test_verify_rejects_wrong_input() {
        let kp = VrfKeyPair::generate().unwrap();
        let (output, proof) = kp.prove(b"block 42");

        assert!(!VrfKeyPair::verify(
            &kp.public_key,
            b"block 99",
            &output,
            &proof
        ));
    }

    #[test]
    fn test_deterministic_output() {
        let kp = VrfKeyPair::generate().unwrap();
        let input = b"same input";

        let (out1, _) = kp.prove(input);
        let (out2, _) = kp.prove(input);

        assert_eq!(out1, out2, "VRF output must be deterministic");
    }
}
