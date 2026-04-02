//! Enshrined VRF: OP Stack L2 with built-in randomness.
//!
//! This binary runs an op-reth node. Randomness features (precompile, system contract)
//! will be integrated via custom executor builder.

mod evm;

use reth_optimism_cli::Cli;
use reth_optimism_node::{args::RollupArgs, OpNode};
use reth_tracing::tracing::info;

fn main() {
    reth_cli_util::sigsegv_handler::install();

    if std::env::var_os("RUST_BACKTRACE").is_none() {
        unsafe { std::env::set_var("RUST_BACKTRACE", "1"); }
    }

    if let Err(err) =
        Cli::parse_args().run(async move |builder, rollup_args: RollupArgs| {
            info!(target: "enshrined-vrf", "Launching Enshrined VRF OP Stack node");
            let handle = builder
                .node(OpNode::new(rollup_args))
                .launch_with_debug_capabilities()
                .await?;
            handle.node_exit_future.await
        })
    {
        eprintln!("Error: {err:?}");
        std::process::exit(1);
    }
}
