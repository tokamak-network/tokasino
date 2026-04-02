//! Enshrined VRF randomness precompile for OP Stack.
//!
//! Provides a ChaCha20 CSPRNG precompile at address 0x0b and constants
//! for the RandomBeaconHistory system contract.

use alloy_primitives::{address, keccak256, Address, Bytes};
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use rand::RngCore;
use revm::precompile::{Precompile, PrecompileId, PrecompileOutput, PrecompileResult, Precompiles};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    OnceLock,
};

/// Address of the randomness precompile.
pub const RANDOMNESS_PRECOMPILE_ADDRESS: Address =
    address!("0x000000000000000000000000000000000000000b");

/// Address of the RandomBeaconHistory system contract.
pub const BEACON_HISTORY_ADDRESS: Address =
    address!("0x4200000000000000000000000000000000000099");

/// The canonical system caller address.
pub const SYSTEM_ADDRESS: Address = address!("0xfffffffffffffffffffffffffffffffffffffffe");

/// Atomic counter for unique per-call randomness.
static RANDOMNESS_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Gas cost for the randomness precompile.
const RANDOMNESS_GAS: u64 = 100;

/// Randomness precompile: ChaCha20 CSPRNG seeded from input + counter.
fn randomness_precompile(input: &[u8], gas_limit: u64) -> PrecompileResult {
    if gas_limit < RANDOMNESS_GAS {
        return Err(revm::precompile::PrecompileError::OutOfGas.into());
    }

    let mut seed = [0u8; 32];
    let len = input.len().min(32);
    seed[..len].copy_from_slice(&input[..len]);

    let counter = RANDOMNESS_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mixed = keccak256([seed.as_slice(), &counter.to_le_bytes()].concat());

    let mut rng = ChaCha20Rng::from_seed(*mixed);
    let mut output = [0u8; 32];
    rng.fill_bytes(&mut output);

    Ok(PrecompileOutput::new(RANDOMNESS_GAS, Bytes::from(output.to_vec())))
}

/// Returns OP Stack precompiles extended with the Enshrined VRF randomness precompile.
pub fn enshrined_vrf_precompiles() -> &'static Precompiles {
    static INSTANCE: OnceLock<Precompiles> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        let mut precompiles = Precompiles::prague().clone();
        precompiles.extend([Precompile::new(
            PrecompileId::custom("enshrined-vrf-randomness"),
            RANDOMNESS_PRECOMPILE_ADDRESS,
            randomness_precompile,
        )]);
        precompiles
    })
}
