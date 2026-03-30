mod beacon;
mod dkg;
mod engine;
mod p2p;
mod threshold;
mod vrf;

use alloy_primitives::B256;
use clap::Parser;
use engine::EngineClient;
use eyre::Result;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

/// Tokasino Consensus Layer — drives block production via Engine API.
///
/// Supports two modes:
/// - `vrf`: Single sequencer VRF (default, simpler)
/// - `drb`: Distributed Random Beacon with threshold BLS
#[derive(Parser, Debug)]
#[command(name = "tokasino-cl", about = "Tokasino consensus layer client")]
struct Cli {
    /// HTTP URL of the reth Engine API (e.g. http://localhost:8551)
    #[arg(long, default_value = "http://localhost:8551")]
    el_url: String,

    /// Block time in seconds
    #[arg(long, default_value_t = 3)]
    block_time: u64,

    /// JWT secret hex string for Engine API authentication.
    #[arg(long)]
    jwt_secret: Option<String>,

    /// Mode: "vrf" (single sequencer) or "drb" (distributed random beacon)
    #[arg(long, default_value = "vrf")]
    mode: String,

    // --- VRF mode options ---
    /// Path to the VRF key file (VRF mode only).
    #[arg(long, default_value = "vrf_key.bin")]
    vrf_key_path: PathBuf,

    // --- DRB mode options ---
    /// This node's index (1-based) in the DRB committee.
    #[arg(long, default_value_t = 1)]
    node_index: u32,

    /// Total number of DRB nodes.
    #[arg(long, default_value_t = 3)]
    drb_total: u32,

    /// Threshold (minimum partial sigs needed).
    #[arg(long, default_value_t = 2)]
    drb_threshold: u32,

    /// This node's P2P HTTP port.
    #[arg(long, default_value_t = 9000)]
    p2p_port: u16,

    /// Comma-separated peer URLs (e.g. "http://localhost:9001,http://localhost:9002").
    #[arg(long, default_value = "")]
    peers: String,

    /// Path to DKG shares file. Auto-generated if missing.
    #[arg(long, default_value = "drb_shares.json")]
    drb_shares_path: PathBuf,

    /// Whether this node is the leader (submits blocks to EL).
    #[arg(long, default_value_t = false)]
    leader: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber_init();

    let cli = Cli::parse();

    match cli.mode.as_str() {
        "vrf" => run_vrf_mode(&cli).await,
        "drb" => run_drb_mode(&cli).await,
        other => Err(eyre::eyre!("Unknown mode: {other}. Use 'vrf' or 'drb'.")),
    }
}

// =========================================================================
// VRF MODE (existing single-sequencer)
// =========================================================================

async fn run_vrf_mode(cli: &Cli) -> Result<()> {
    let vrf_key = if cli.vrf_key_path.exists() {
        tracing::info!(path = ?cli.vrf_key_path, "Loading existing VRF key");
        vrf::VrfKeyPair::load_from_file(&cli.vrf_key_path)?
    } else {
        tracing::info!(path = ?cli.vrf_key_path, "Generating new VRF key");
        let kp = vrf::VrfKeyPair::generate()?;
        kp.save_to_file(&cli.vrf_key_path)?;
        kp
    };

    let engine = EngineClient::new(cli.el_url.clone(), cli.jwt_secret.clone());

    let public_rpc = cli.el_url.replace("8551", "8545");
    let genesis_hash = engine.get_latest_block_hash(&public_rpc).await?;
    tracing::info!(%genesis_hash, "Fetched genesis block hash");

    let mut head_hash = genesis_hash;
    let mut block_number: u64 = 0;

    tracing::info!(mode = "vrf", "Starting VRF consensus loop");

    loop {
        if let Err(e) = produce_block_vrf(&engine, &vrf_key, &mut head_hash, &mut block_number).await {
            tracing::error!(?e, "Block production failed");
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(cli.block_time)).await;
    }
}

async fn produce_block_vrf(
    engine: &EngineClient,
    vrf_key: &vrf::VrfKeyPair,
    head_hash: &mut B256,
    block_number: &mut u64,
) -> Result<()> {
    let next_block = *block_number + 1;
    let vrf_input = [head_hash.as_slice(), &next_block.to_be_bytes()].concat();
    let (vrf_output, _proof) = vrf_key.prove(&vrf_input);
    let prev_randao = B256::from(vrf_output);

    submit_block(engine, head_hash, block_number, prev_randao).await
}

// =========================================================================
// DRB MODE (distributed random beacon)
// =========================================================================

async fn run_drb_mode(cli: &Cli) -> Result<()> {
    // Load or generate DKG shares
    let shares = if cli.drb_shares_path.exists() {
        tracing::info!(path = ?cli.drb_shares_path, "Loading DKG shares");
        let data = std::fs::read_to_string(&cli.drb_shares_path)?;
        serde_json::from_str(&data)?
    } else {
        tracing::info!(
            threshold = cli.drb_threshold,
            total = cli.drb_total,
            "Running local DKG ceremony"
        );
        let shares = dkg::run_local_dkg(cli.drb_threshold, cli.drb_total)?;
        let data = serde_json::to_string_pretty(&shares)?;
        std::fs::write(&cli.drb_shares_path, &data)?;
        tracing::info!(path = ?cli.drb_shares_path, "DKG shares saved");
        shares
    };

    let my_share = shares
        .iter()
        .find(|s| s.index == cli.node_index)
        .ok_or_else(|| eyre::eyre!("No share found for node index {}", cli.node_index))?
        .clone();

    let node = Arc::new(beacon::BeaconNode::new(my_share, &shares));
    let peers: Vec<String> = cli.peers.split(',').filter(|s| !s.is_empty()).map(String::from).collect();
    let http_client = reqwest::Client::new();

    tracing::info!(
        mode = "drb",
        index = cli.node_index,
        threshold = cli.drb_threshold,
        total = cli.drb_total,
        peers = ?peers,
        leader = cli.leader,
        "Starting DRB consensus"
    );

    // Start P2P server in background
    let p2p_node = node.clone();
    let p2p_port = cli.p2p_port;
    tokio::spawn(async move {
        if let Err(e) = p2p::start_p2p_server(p2p_node, p2p_port).await {
            tracing::error!(?e, "P2P server failed");
        }
    });

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // Engine API (only leader submits blocks)
    let engine = if cli.leader {
        Some(EngineClient::new(cli.el_url.clone(), cli.jwt_secret.clone()))
    } else {
        None
    };

    let mut head_hash = B256::ZERO;
    let mut block_number: u64 = 0;

    // If leader, fetch genesis hash
    if let Some(ref eng) = engine {
        let public_rpc = cli.el_url.replace("8551", "8545");
        head_hash = eng.get_latest_block_hash(&public_rpc).await?;
        tracing::info!(%head_hash, "Leader fetched genesis hash");
    }

    loop {
        let round = block_number + 1;

        // Sign this round
        let partial = node.sign_round(round);
        node.submit_partial(round, partial.clone()).await;

        // Broadcast to peers
        p2p::broadcast_partial(&http_client, &peers, round, &partial).await;

        // Wait for threshold
        let beacon_output = loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

            if let Some(output) = node.try_combine(round).await {
                break output;
            }

            let count = node.partial_count(round).await;
            tracing::debug!(round, count, threshold = cli.drb_threshold, "Waiting for threshold");
        };

        tracing::info!(
            round,
            beacon = %beacon_output,
            "Beacon output ready"
        );

        // Leader submits to EL
        if let Some(ref eng) = engine {
            if let Err(e) = submit_block(eng, &mut head_hash, &mut block_number, beacon_output).await {
                tracing::error!(?e, "Block submission failed");
            }
        } else {
            block_number += 1;
        }

        // Cleanup old rounds
        node.cleanup_before(round).await;

        tokio::time::sleep(tokio::time::Duration::from_secs(cli.block_time)).await;
    }
}

// =========================================================================
// Shared: submit block to EL via Engine API
// =========================================================================

async fn submit_block(
    engine: &EngineClient,
    head_hash: &mut B256,
    block_number: &mut u64,
    prev_randao: B256,
) -> Result<()> {
    let next_block = *block_number + 1;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

    let payload_attributes = json!({
        "timestamp": format!("0x{timestamp:x}"),
        "prevRandao": prev_randao,
        "suggestedFeeRecipient": "0x0000000000000000000000000000000000000000",
        "withdrawals": [],
        "parentBeaconBlockRoot": B256::ZERO,
        "transactions": [],
        "noTxPool": false,
        "gasLimit": format!("0x{:x}", 30_000_000u64),
    });

    let fcu_response = engine
        .fork_choice_updated(*head_hash, *head_hash, *head_hash, Some(payload_attributes))
        .await?;

    let payload_id = extract_payload_id(&fcu_response)?;
    let payload_response = engine.get_payload(&payload_id).await?;
    let execution_payload = payload_response
        .get("executionPayload")
        .cloned()
        .unwrap_or(payload_response.clone());
    let new_block_hash = extract_block_hash(&execution_payload)?;

    let new_payload_response = engine
        .new_payload(execution_payload, json!([]), B256::ZERO)
        .await?;

    let status = new_payload_response
        .get("status")
        .and_then(|s| s.as_str())
        .unwrap_or("UNKNOWN");

    if status == "VALID" || status == "ACCEPTED" {
        engine
            .fork_choice_updated(new_block_hash, new_block_hash, new_block_hash, None)
            .await?;

        *head_hash = new_block_hash;
        *block_number = next_block;

        tracing::info!(block = next_block, hash = %new_block_hash, "Block finalized");
    } else {
        tracing::warn!(block = next_block, status, "Payload not accepted");
    }

    Ok(())
}

fn extract_payload_id(fcu_response: &Value) -> Result<String> {
    fcu_response
        .get("payloadId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| eyre::eyre!("missing payloadId"))
}

fn extract_block_hash(payload: &Value) -> Result<B256> {
    payload
        .get("blockHash")
        .and_then(|v| v.as_str())
        .ok_or_else(|| eyre::eyre!("missing blockHash"))?
        .parse::<B256>()
        .map_err(|e| eyre::eyre!("invalid blockHash: {e}"))
}

fn tracing_subscriber_init() {
    use tracing_subscriber::EnvFilter;
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();
}
