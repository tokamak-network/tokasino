//! Custom EVM factory for Tokasino that adds a randomness precompile at address 0x0b.
//!
//! The randomness precompile returns a 32-byte pseudo-random value derived from an
//! incrementing counter. This is a placeholder mechanism that will be replaced with
//! per-tx ChaCha20 CSPRNG seeded by VRF output.

use alloy_evm::{
    eth::EthEvmContext,
    precompiles::PrecompilesMap,
    revm::{
        handler::EthPrecompiles,
        precompile::{PrecompileId, PrecompileOutput, PrecompileResult, Precompiles},
    },
    EvmFactory,
};
use alloy_primitives::{address, Address, Bytes};
use reth_ethereum::{
    chainspec::ChainSpec,
    evm::{
        primitives::{Database, EvmEnv},
        revm::{
            context::{BlockEnv, Context, TxEnv},
            context_interface::result::{EVMError, HaltReason},
            inspector::{Inspector, NoOpInspector},
            interpreter::interpreter::EthInterpreter,
            primitives::hardfork::SpecId,
            MainBuilder, MainContext,
        },
        EthEvm, EthEvmConfig,
    },
    node::{
        api::{FullNodeTypes, NodeTypes},
        builder::{components::ExecutorBuilder, BuilderContext},
    },
    EthPrimitives,
};
use revm::precompile::Precompile;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    OnceLock,
};

/// Address of the randomness precompile: 0x0b
pub const RANDOMNESS_PRECOMPILE_ADDRESS: Address =
    address!("0x000000000000000000000000000000000000000b");

/// Global counter used to mix with prevrandao for unique per-call randomness.
/// This is a simple placeholder; production will use per-tx ChaCha20 CSPRNG.
static RANDOMNESS_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Precompile function for randomness. Returns a 32-byte pseudo-random value.
fn randomness_precompile(_input: &[u8], _gas_limit: u64) -> PrecompileResult {
    // Increment the counter for each call to produce unique values.
    let counter = RANDOMNESS_COUNTER.fetch_add(1, Ordering::Relaxed);

    // Build a 32-byte pseudo-random output by placing the counter into
    // the first 8 bytes of a zeroed buffer. In the real implementation
    // this will be replaced with prevrandao-seeded ChaCha20 output.
    let mut output = [0u8; 32];
    output[..8].copy_from_slice(&counter.to_le_bytes());

    // Gas cost: flat 100 gas (cheap, placeholder value)
    Ok(PrecompileOutput::new(100, Bytes::from(output.to_vec())))
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

/// Executor builder that wires up the Tokasino EVM factory into reth's execution pipeline.
#[derive(Debug, Default, Clone, Copy)]
#[non_exhaustive]
pub struct TokasinoExecutorBuilder;

impl<Node> ExecutorBuilder<Node> for TokasinoExecutorBuilder
where
    Node: FullNodeTypes<Types: NodeTypes<ChainSpec = ChainSpec, Primitives = EthPrimitives>>,
{
    type EVM = EthEvmConfig<ChainSpec, TokasinoEvmFactory>;

    async fn build_evm(self, ctx: &BuilderContext<Node>) -> eyre::Result<Self::EVM> {
        let evm_config =
            EthEvmConfig::new_with_evm_factory(ctx.chain_spec(), TokasinoEvmFactory::default());
        Ok(evm_config)
    }
}
