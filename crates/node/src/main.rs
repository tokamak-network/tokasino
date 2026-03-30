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

use crate::executor::TokasinoExecutorBuilder;

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
        },
        "0x4200000000000000000000000000000000000099": {
            "balance": "0x0",
            "code": "0x608060405234801561000f575f80fd5b5061024a8061001d5f395ff3fe608060405234801561000f575f80fd5b506004361061004a575f3560e01c80633434735f1461004e578063453f4f62146100795780634c4d0d3a1461009a578063ee6e5dd7146100af575b5f80fd5b61005c6002600160a01b0381565b6040516001600160a01b0390911681526020015b60405180910390f35b61008c6100873660046101c3565b6100ce565b604051908152602001610070565b6100ad6100a83660046101da565b610108565b005b61008c6100bd3660046101c3565b5f6020819052908152604090205481565b5f8181526020819052604081205480610102576040516316da5de960e01b8152600481018490526024015b60405180910390fd5b92915050565b336002600160a01b031461012f5760405163f17980c960e01b815260040160405180910390fd5b67ffffffffffffffff81165f90815260208190526040902054156101725760405163d4449c1f60e01b815267ffffffffffffffff821660048201526024016100f9565b67ffffffffffffffff81165f818152602081815260409182902085905590518481527f06d443a8dabe98648977a3cb6df97407baaca7ee2f286be9c8e82c2029dea769910160405180910390a25050565b5f602082840312156101d3575f80fd5b5035919050565b5f80604083850312156101eb575f80fd5b82359150602083013567ffffffffffffffff81168114610209575f80fd5b80915050925092905056fea2646970667358221220b93ddf0de61f57ea2af4dfec43fb879e765d3a75e49e4460e1b46abcf2c846cc64736f6c63430008160033"
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
