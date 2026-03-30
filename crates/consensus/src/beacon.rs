//! Distributed Random Beacon node.
//!
//! Each beacon node:
//! 1. Holds a DKG share (secret key share)
//! 2. On each round (block), signs the round message with its share
//! 3. Collects partial signatures from peers via HTTP
//! 4. Once threshold is met, combines them into the beacon output
//! 5. If this node is the leader, submits the output to the EL via Engine API

use alloy_primitives::B256;
use eyre::Result;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::dkg::DkgShare;
use crate::threshold::{combine_partial_signatures, partial_sign, verify_partial, PartialSignature};

/// State of the beacon node.
pub struct BeaconNode {
    /// This node's DKG share.
    pub share: DkgShare,
    /// All participants' public key shares (index -> pubkey bytes).
    pub public_shares: HashMap<u32, Vec<u8>>,
    /// Collected partial signatures per round (round -> vec of partials).
    pub round_partials: Arc<RwLock<HashMap<u64, Vec<PartialSignature>>>>,
}

impl BeaconNode {
    /// Create a new beacon node with its DKG share and all public shares.
    pub fn new(share: DkgShare, all_shares: &[DkgShare]) -> Self {
        let public_shares: HashMap<u32, Vec<u8>> = all_shares
            .iter()
            .map(|s| (s.index, s.public_share.clone()))
            .collect();

        Self {
            share,
            public_shares,
            round_partials: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Generate this node's partial signature for a given round.
    pub fn sign_round(&self, round: u64) -> PartialSignature {
        let message = round_message(round);
        partial_sign(&self.share, &message)
    }

    /// Submit a partial signature from a peer for a given round.
    /// Returns `true` if the signature is valid.
    pub async fn submit_partial(&self, round: u64, partial: PartialSignature) -> bool {
        // Verify the partial signature
        let message = round_message(round);
        let pubkey = match self.public_shares.get(&partial.index) {
            Some(pk) => pk,
            None => return false,
        };

        if !verify_partial(&partial, &message, pubkey) {
            tracing::warn!(
                index = partial.index,
                round,
                "Invalid partial signature rejected"
            );
            return false;
        }

        // Store it
        let mut partials = self.round_partials.write().await;
        let round_sigs = partials.entry(round).or_default();

        // Don't accept duplicates from same index
        if round_sigs.iter().any(|p| p.index == partial.index) {
            return true; // Already have it
        }

        round_sigs.push(partial);
        true
    }

    /// Try to combine partial signatures for a round.
    /// Returns `Some(beacon_output)` if threshold is met.
    pub async fn try_combine(&self, round: u64) -> Option<B256> {
        let partials = self.round_partials.read().await;
        let round_sigs = partials.get(&round)?;

        if round_sigs.len() < self.share.threshold as usize {
            return None;
        }

        let (_, output) = combine_partial_signatures(round_sigs, self.share.threshold).ok()?;
        Some(B256::from(output))
    }

    /// Get the number of partial signatures collected for a round.
    pub async fn partial_count(&self, round: u64) -> usize {
        let partials = self.round_partials.read().await;
        partials.get(&round).map_or(0, |v| v.len())
    }

    /// Clean up old rounds to prevent memory growth.
    pub async fn cleanup_before(&self, round: u64) {
        let mut partials = self.round_partials.write().await;
        partials.retain(|&r, _| r >= round.saturating_sub(10));
    }
}

/// Construct the message to sign for a given round.
/// This is what all participants sign to produce the beacon output.
fn round_message(round: u64) -> Vec<u8> {
    let mut msg = b"TOKASINO-ROUND-".to_vec();
    msg.extend_from_slice(&round.to_be_bytes());
    msg
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dkg::run_local_dkg;

    #[tokio::test]
    async fn test_beacon_node_flow() {
        let shares = run_local_dkg(2, 3).unwrap();

        // Create 3 beacon nodes
        let node1 = BeaconNode::new(shares[0].clone(), &shares);
        let node2 = BeaconNode::new(shares[1].clone(), &shares);
        let node3 = BeaconNode::new(shares[2].clone(), &shares);

        let round = 1u64;

        // Each node signs the round
        let sig1 = node1.sign_round(round);
        let sig2 = node2.sign_round(round);
        let sig3 = node3.sign_round(round);

        // Node 1 collects partials
        assert!(node1.submit_partial(round, sig1.clone()).await);
        assert_eq!(node1.partial_count(round).await, 1);
        assert!(node1.try_combine(round).await.is_none()); // Not enough

        assert!(node1.submit_partial(round, sig2.clone()).await);
        assert_eq!(node1.partial_count(round).await, 2);

        // Now threshold (2) is met
        let output = node1.try_combine(round).await;
        assert!(output.is_some());
        let beacon = output.unwrap();
        assert_ne!(beacon, B256::ZERO);

        tracing::info!(?beacon, "Beacon output for round 1");
    }

    #[tokio::test]
    async fn test_beacon_deterministic_across_nodes() {
        let shares = run_local_dkg(2, 3).unwrap();

        let node1 = BeaconNode::new(shares[0].clone(), &shares);
        let node2 = BeaconNode::new(shares[1].clone(), &shares);

        let round = 42u64;
        let sig1 = node1.sign_round(round);
        let sig2 = node2.sign_round(round);

        // Both nodes collect the same partials
        node1.submit_partial(round, sig1.clone()).await;
        node1.submit_partial(round, sig2.clone()).await;

        node2.submit_partial(round, sig1.clone()).await;
        node2.submit_partial(round, sig2.clone()).await;

        let out1 = node1.try_combine(round).await.unwrap();
        let out2 = node2.try_combine(round).await.unwrap();

        assert_eq!(out1, out2, "Same partials must produce same beacon output");
    }
}
