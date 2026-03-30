//! Tokasino custom reth node.
//!
//! Extends Ethereum with:
//! - A randomness precompile at address 0x0b
//! - Dev mode for initial testing (no CL needed)
//!
//! TODO: Add a per-block system call to the RandomBeaconHistory contract

mod evm;
mod executor;

use std::sync::Arc;

use alloy_genesis::Genesis;
use reth_ethereum::{
    chainspec::ChainSpec,
    node::{
        builder::NodeBuilder,
        core::{args::RpcServerArgs, node_config::NodeConfig},
        node::EthereumAddOns,
        EthereumNode,
    },
    tasks::Runtime,
};
use reth_tracing::{RethTracer, Tracer};

use crate::evm::TokasinoExecutorBuilder;

/// Tokasino chain ID.
const TOKASINO_CHAIN_ID: u64 = 7777;

// ---------------------------------------------------------------------------
// Genesis / chain spec helpers
// ---------------------------------------------------------------------------

/// Creates the Tokasino chain spec with:
/// - Chain ID 7777
/// - Shanghai activated (for withdrawals support)
/// - Cancun activated (for prevrandao / beacon root)
/// - Prague activated (for latest features)
/// - A prefunded dev account
fn tokasino_chain_spec() -> Arc<ChainSpec> {
    let genesis_json = r#"
{
    "nonce": "0x42",
    "timestamp": "0x0",
    "extraData": "0x",
    "gasLimit": "0x1c9c380",
    "difficulty": "0x0",
    "mixHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "coinbase": "0x0000000000000000000000000000000000000000",
    "alloc": {
        "0x6Be02d1d3665660d22FF9624b7BE0551ee1Ac91b": {
            "balance": "0x4a47e3c12448f4ad000000"
        }
    },
    "number": "0x0",
    "gasUsed": "0x0",
    "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "config": {
        "ethash": {},
        "chainId": 7777,
        "homesteadBlock": 0,
        "eip150Block": 0,
        "eip155Block": 0,
        "eip158Block": 0,
        "byzantiumBlock": 0,
        "constantinopleBlock": 0,
        "petersburgBlock": 0,
        "istanbulBlock": 0,
        "berlinBlock": 0,
        "londonBlock": 0,
        "terminalTotalDifficulty": 0,
        "terminalTotalDifficultyPassed": true,
        "shanghaiTime": 0,
        "cancunTime": 0
    }
}
"#;
    let genesis: Genesis = serde_json::from_str(genesis_json).expect("valid genesis JSON");
    Arc::new(genesis.into())
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> eyre::Result<()> {
    let _guard = RethTracer::new().init()?;

    let runtime = Runtime::with_existing_handle(tokio::runtime::Handle::current())?;

    let node_config = NodeConfig::test()
        .dev()
        .with_rpc(RpcServerArgs::default().with_http())
        .with_chain(tokasino_chain_spec());

    let handle = NodeBuilder::new(node_config)
        .testing_node(runtime)
        .with_types::<EthereumNode>()
        .with_components(
            EthereumNode::components().executor(TokasinoExecutorBuilder::default()),
        )
        .with_add_ons(EthereumAddOns::default())
        .launch()
        .await?;

    println!("Tokasino node started (chain ID: {})", TOKASINO_CHAIN_ID);

    handle.node_exit_future.await
}
