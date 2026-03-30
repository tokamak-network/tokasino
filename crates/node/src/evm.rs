//! Custom EVM factory for Tokasino that adds a randomness precompile at address 0x0b.
//!
//! The randomness precompile returns a 32-byte pseudo-random value using ChaCha20 CSPRNG.
//! The caller passes a 32-byte seed (typically prevrandao from Solidity) as input.
//! The precompile mixes the seed with an atomic counter to produce unique output per call.

use alloy_evm::{
    eth::EthEvmContext,
    precompiles::PrecompilesMap,
    revm::{
        handler::EthPrecompiles,
        precompile::{PrecompileId, PrecompileOutput, PrecompileResult, Precompiles},
    },
    EvmFactory,
};
use alloy_primitives::{address, keccak256, Address, Bytes};
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use rand::RngCore;
use reth_ethereum::evm::{
    primitives::{Database, EvmEnv},
    revm::{
        context::{BlockEnv, Context, TxEnv},
        context_interface::result::{EVMError, HaltReason},
        inspector::{Inspector, NoOpInspector},
        interpreter::interpreter::EthInterpreter,
        primitives::hardfork::SpecId,
        MainBuilder, MainContext,
    },
    EthEvm,
};
use revm::precompile::Precompile;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    OnceLock,
};

/// Address of the randomness precompile: 0x0b
pub const RANDOMNESS_PRECOMPILE_ADDRESS: Address =
    address!("0x000000000000000000000000000000000000000b");

/// Atomic counter mixed into the ChaCha20 seed for unique per-call output.
static RANDOMNESS_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Gas cost for the randomness precompile (flat cost).
const RANDOMNESS_GAS: u64 = 100;

/// Randomness precompile using ChaCha20 CSPRNG.
///
/// **Input:** 32 bytes — the seed (typically `block.prevrandao` passed from Solidity).
///            If input is empty or shorter than 32 bytes, it is zero-padded.
///
/// **Output:** 32 bytes — pseudo-random value derived from `ChaCha20(keccak256(seed || counter))`.
///
/// Each call increments an internal counter so that multiple calls within the same
/// transaction return different values. The Solidity wrapper passes `block.prevrandao`
/// as the seed, which is the VRF output from the CL.
fn randomness_precompile(input: &[u8], gas_limit: u64) -> PrecompileResult {
    if gas_limit < RANDOMNESS_GAS {
        return Err(alloy_evm::revm::precompile::PrecompileError::OutOfGas.into());
    }

    // Parse seed from input (zero-pad if short).
    let mut seed = [0u8; 32];
    let len = input.len().min(32);
    seed[..len].copy_from_slice(&input[..len]);

    // Mix in the counter for uniqueness across calls.
    let counter = RANDOMNESS_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mixed = keccak256([seed.as_slice(), &counter.to_le_bytes()].concat());

    // Derive 32 bytes of randomness via ChaCha20.
    let mut rng = ChaCha20Rng::from_seed(*mixed);
    let mut output = [0u8; 32];
    rng.fill_bytes(&mut output);

    Ok(PrecompileOutput::new(RANDOMNESS_GAS, Bytes::from(output.to_vec())))
}

/// Custom EVM factory that extends the standard Ethereum EVM with a randomness precompile.
#[derive(Debug, Clone, Default)]
#[non_exhaustive]
pub struct TokasinoEvmFactory;

impl EvmFactory for TokasinoEvmFactory {
    type Evm<DB: Database, I: Inspector<EthEvmContext<DB>, EthInterpreter>> =
        EthEvm<DB, I, Self::Precompiles>;
    type Tx = TxEnv;
    type Error<DBError: core::error::Error + Send + Sync + 'static> = EVMError<DBError>;
    type HaltReason = HaltReason;
    type Context<DB: Database> = EthEvmContext<DB>;
    type Spec = SpecId;
    type BlockEnv = BlockEnv;
    type Precompiles = PrecompilesMap;

    fn create_evm<DB: Database>(&self, db: DB, input: EvmEnv) -> Self::Evm<DB, NoOpInspector> {
        let spec = input.cfg_env.spec;
        let mut evm = Context::mainnet()
            .with_db(db)
            .with_cfg(input.cfg_env)
            .with_block(input.block_env)
            .build_mainnet_with_inspector(NoOpInspector {})
            .with_precompiles(PrecompilesMap::from_static(
                EthPrecompiles::default().precompiles,
            ));

        // Always use our custom precompiles (standard + randomness)
        if spec >= SpecId::PRAGUE {
            evm = evm.with_precompiles(PrecompilesMap::from_static(tokasino_precompiles()));
        } else {
            // For pre-Prague specs, still add our precompile on top of defaults
            evm = evm.with_precompiles(PrecompilesMap::from_static(tokasino_precompiles()));
        }

        EthEvm::new(evm, false)
    }

    fn create_evm_with_inspector<DB: Database, I: Inspector<Self::Context<DB>, EthInterpreter>>(
        &self,
        db: DB,
        input: EvmEnv,
        inspector: I,
    ) -> Self::Evm<DB, I> {
        EthEvm::new(
            self.create_evm(db, input).into_inner().with_inspector(inspector),
            true,
        )
    }
}

/// Returns the Tokasino precompile set: all standard Prague precompiles plus the randomness
/// precompile at address 0x0b.
pub fn tokasino_precompiles() -> &'static Precompiles {
    static INSTANCE: OnceLock<Precompiles> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        let mut precompiles = Precompiles::prague().clone();

        let precompile = Precompile::new(
            PrecompileId::custom("tokasino-randomness"),
            RANDOMNESS_PRECOMPILE_ADDRESS,
            randomness_precompile,
        );

        precompiles.extend([precompile]);
        precompiles
    })
}

