//! Custom block executor for Tokasino that calls the RandomBeaconHistory system contract
//! at the end of each block to store the block's prevrandao on-chain.
//!
//! This follows the pattern from reth's `custom-beacon-withdrawals` example, wrapping the
//! standard `EthBlockExecutor` and injecting a system call in `finish()`.

use alloy_evm::{
    block::{BlockExecutorFactory, BlockExecutorFor, ExecutableTx},
    eth::{EthBlockExecutionCtx, EthBlockExecutor, EthTxResult},
    precompiles::PrecompilesMap,
    revm::context::Block as _,
    EthEvm,
};
use alloy_primitives::{Address, B256};
use alloy_sol_types::{sol, SolCall};
use reth_ethereum::{
    chainspec::ChainSpec,
    evm::{
        primitives::{
            execute::{BlockExecutionError, BlockExecutor, InternalBlockExecutionError},
            Database, Evm, EvmEnv, EvmEnvFor, ExecutionCtxFor, InspectorFor,
            NextBlockEnvAttributes, OnStateHook,
        },
        revm::{
            context::TxEnv,
            db::State,
            primitives::{address, hardfork::SpecId},
            DatabaseCommit,
        },
        EthBlockAssembler, EthEvmConfig, RethReceiptBuilder,
    },
    node::{
        api::{ConfigureEngineEvm, ConfigureEvm, ExecutableTxIterator, FullNodeTypes, NodeTypes},
        builder::{components::ExecutorBuilder, BuilderContext},
    },
    primitives::{Header, SealedBlock, SealedHeader},
    provider::BlockExecutionResult,
    rpc::types::engine::ExecutionData,
    Block, EthPrimitives, Receipt, TransactionSigned, TxType,
};
use std::{fmt::Display, sync::Arc};

use crate::evm::TokasinoEvmFactory;

// ---------------------------------------------------------------------------
// System addresses
// ---------------------------------------------------------------------------

/// The canonical system caller address used for system contract calls.
pub const SYSTEM_ADDRESS: Address = address!("0xfffffffffffffffffffffffffffffffffffffffe");

/// The address of the RandomBeaconHistory contract that stores per-block randomness.
pub const BEACON_HISTORY_ADDRESS: Address =
    address!("0x4200000000000000000000000000000000000099");

// ---------------------------------------------------------------------------
// ABI definition for the RandomBeaconHistory contract
// ---------------------------------------------------------------------------

sol!(
    function submitRandomness(bytes32 randomSeed, uint64 blockNumber);
);

// ---------------------------------------------------------------------------
// TokasinoEvmConfig: wraps EthEvmConfig with our TokasinoEvmFactory
// ---------------------------------------------------------------------------

/// EVM configuration for Tokasino. Delegates to `EthEvmConfig` for most functionality
/// but uses `TokasinoEvmFactory` (with the randomness precompile) and wraps the block
/// executor to inject the beacon history system call.
#[derive(Debug, Clone)]
pub struct TokasinoEvmConfig {
    pub inner: EthEvmConfig<ChainSpec, TokasinoEvmFactory>,
}

impl BlockExecutorFactory for TokasinoEvmConfig {
    type EvmFactory = TokasinoEvmFactory;
    type ExecutionCtx<'a> = EthBlockExecutionCtx<'a>;
    type Transaction = TransactionSigned;
    type Receipt = Receipt;

    fn evm_factory(&self) -> &Self::EvmFactory {
        self.inner.evm_factory()
    }

    fn create_executor<'a, DB, I>(
        &'a self,
        evm: EthEvm<&'a mut State<DB>, I, PrecompilesMap>,
        ctx: EthBlockExecutionCtx<'a>,
    ) -> impl BlockExecutorFor<'a, Self, DB, I>
    where
        DB: Database + 'a,
        I: InspectorFor<Self, &'a mut State<DB>> + 'a,
    {
        TokasinoBlockExecutor {
            inner: EthBlockExecutor::new(
                evm,
                ctx,
                self.inner.chain_spec(),
                self.inner.executor_factory.receipt_builder(),
            ),
        }
    }
}

impl ConfigureEvm for TokasinoEvmConfig {
    type Primitives = <EthEvmConfig<ChainSpec, TokasinoEvmFactory> as ConfigureEvm>::Primitives;
    type Error = <EthEvmConfig<ChainSpec, TokasinoEvmFactory> as ConfigureEvm>::Error;
    type NextBlockEnvCtx =
        <EthEvmConfig<ChainSpec, TokasinoEvmFactory> as ConfigureEvm>::NextBlockEnvCtx;
    type BlockExecutorFactory = Self;
    type BlockAssembler = EthBlockAssembler<ChainSpec>;

    fn block_executor_factory(&self) -> &Self::BlockExecutorFactory {
        self
    }

    fn block_assembler(&self) -> &Self::BlockAssembler {
        self.inner.block_assembler()
    }

    fn evm_env(&self, header: &Header) -> Result<EvmEnv<SpecId>, Self::Error> {
        self.inner.evm_env(header)
    }

    fn next_evm_env(
        &self,
        parent: &Header,
        attributes: &NextBlockEnvAttributes,
    ) -> Result<EvmEnv<SpecId>, Self::Error> {
        self.inner.next_evm_env(parent, attributes)
    }

    fn context_for_block<'a>(
        &self,
        block: &'a SealedBlock<Block>,
    ) -> Result<EthBlockExecutionCtx<'a>, Self::Error> {
        self.inner.context_for_block(block)
    }

    fn context_for_next_block(
        &self,
        parent: &SealedHeader,
        attributes: Self::NextBlockEnvCtx,
    ) -> Result<EthBlockExecutionCtx<'_>, Self::Error> {
        self.inner.context_for_next_block(parent, attributes)
    }
}

impl ConfigureEngineEvm<ExecutionData> for TokasinoEvmConfig {
    fn evm_env_for_payload(
        &self,
        payload: &ExecutionData,
    ) -> Result<EvmEnvFor<Self>, Self::Error> {
        self.inner.evm_env_for_payload(payload)
    }

    fn context_for_payload<'a>(
        &self,
        payload: &'a ExecutionData,
    ) -> Result<ExecutionCtxFor<'a, Self>, Self::Error> {
        self.inner.context_for_payload(payload)
    }

    fn tx_iterator_for_payload(
        &self,
        payload: &ExecutionData,
    ) -> Result<impl ExecutableTxIterator<Self>, Self::Error> {
        self.inner.tx_iterator_for_payload(payload)
    }
}

// ---------------------------------------------------------------------------
// TokasinoBlockExecutor: wraps EthBlockExecutor, injects beacon history call
// ---------------------------------------------------------------------------

/// Block executor that wraps the standard Ethereum block executor and injects a system
/// call to `RandomBeaconHistory.submitRandomness(prevrandao, blockNumber)` at the end of
/// each block (in `finish()`).
pub struct TokasinoBlockExecutor<'a, Evm> {
    inner: EthBlockExecutor<'a, Evm, &'a Arc<ChainSpec>, &'a RethReceiptBuilder>,
}

impl<'db, DB, E> BlockExecutor for TokasinoBlockExecutor<'_, E>
where
    DB: Database + 'db,
    E: Evm<DB = &'db mut State<DB>, Tx = TxEnv>,
{
    type Transaction = TransactionSigned;
    type Receipt = Receipt;
    type Evm = E;
    type Result = EthTxResult<E::HaltReason, TxType>;

    fn apply_pre_execution_changes(&mut self) -> Result<(), BlockExecutionError> {
        self.inner.apply_pre_execution_changes()
    }

    fn receipts(&self) -> &[Self::Receipt] {
        self.inner.receipts()
    }

    fn execute_transaction_without_commit(
        &mut self,
        tx: impl ExecutableTx<Self>,
    ) -> Result<Self::Result, BlockExecutionError> {
        self.inner.execute_transaction_without_commit(tx)
    }

    fn commit_transaction(&mut self, output: Self::Result) -> Result<u64, BlockExecutionError> {
        self.inner.commit_transaction(output)
    }

    fn finish(mut self) -> Result<(Self::Evm, BlockExecutionResult<Receipt>), BlockExecutionError> {
        // Submit the block's prevrandao to the RandomBeaconHistory contract.
        apply_beacon_history_call(self.inner.evm_mut())?;

        // Delegate to the inner executor for standard Ethereum post-execution.
        self.inner.finish()
    }

    fn set_state_hook(&mut self, hook: Option<Box<dyn OnStateHook>>) {
        self.inner.set_state_hook(hook)
    }

    fn evm_mut(&mut self) -> &mut Self::Evm {
        self.inner.evm_mut()
    }

    fn evm(&self) -> &Self::Evm {
        self.inner.evm()
    }
}

// ---------------------------------------------------------------------------
// System call: submit randomness to the beacon history contract
// ---------------------------------------------------------------------------

/// Performs the system call to `RandomBeaconHistory.submitRandomness(prevrandao, blockNumber)`
/// using the block's prevrandao as the random seed.
pub fn apply_beacon_history_call(
    evm: &mut impl Evm<Error: Display, DB: DatabaseCommit>,
) -> Result<(), BlockExecutionError> {
    let block = evm.block();
    let block_number: u64 = block.number().try_into().unwrap_or(0);
    let prevrandao = block.prevrandao().unwrap_or(B256::ZERO);

    let calldata = submitRandomnessCall {
        randomSeed: prevrandao,
        blockNumber: block_number,
    }
    .abi_encode();

    let mut state = match evm.transact_system_call(
        SYSTEM_ADDRESS,
        BEACON_HISTORY_ADDRESS,
        calldata.into(),
    ) {
        Ok(res) => res.state,
        Err(e) => {
            return Err(BlockExecutionError::Internal(
                InternalBlockExecutionError::Other(
                    format!("RandomBeaconHistory system call revert: {e}").into(),
                ),
            ))
        }
    };

    // Clean up system tx context to avoid polluting the state diff.
    state.remove(&SYSTEM_ADDRESS);
    state.remove(&evm.block().beneficiary());

    evm.db_mut().commit(state);

    Ok(())
}

// ---------------------------------------------------------------------------
// TokasinoExecutorBuilder
// ---------------------------------------------------------------------------

/// Builds the Tokasino EVM config which includes the randomness precompile
/// and the beacon history system call.
#[derive(Debug, Default, Clone, Copy)]
#[non_exhaustive]
pub struct TokasinoExecutorBuilder;

impl<Node> ExecutorBuilder<Node> for TokasinoExecutorBuilder
where
    Node: FullNodeTypes<Types: NodeTypes<ChainSpec = ChainSpec, Primitives = EthPrimitives>>,
{
    type EVM = TokasinoEvmConfig;

    async fn build_evm(self, ctx: &BuilderContext<Node>) -> eyre::Result<Self::EVM> {
        let inner =
            EthEvmConfig::new_with_evm_factory(ctx.chain_spec(), TokasinoEvmFactory::default());
        Ok(TokasinoEvmConfig { inner })
    }
}
