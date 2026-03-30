mod engine;
mod vrf;

use alloy_primitives::B256;
use clap::Parser;
use engine::EngineClient;
use eyre::Result;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use vrf::VrfKeyPair;

/// Tokasino Consensus Layer — drives block production via Engine API using VRF randomness.
#[derive(Parser, Debug)]
#[command(name = "tokasino-cl", about = "Tokasino consensus layer client")]
struct Cli {
    /// HTTP URL of the reth Engine API (e.g. http://localhost:8551)
    #[arg(long, default_value = "http://localhost:8551")]
    el_url: String,

    /// Block time in seconds
    #[arg(long, default_value_t = 2)]
    block_time: u64,

    /// Path to the VRF key file. Generated automatically if it does not exist.
    #[arg(long, default_value = "vrf_key.bin")]
    vrf_key_path: PathBuf,

    /// JWT secret hex string for Engine API authentication (optional).
    #[arg(long)]
    jwt_secret: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialise tracing (subscriber should be set up by the caller/runtime; fall back to env).
    tracing_subscriber_init();

    let cli = Cli::parse();

    // --- VRF key pair ---
    let vrf_key = if cli.vrf_key_path.exists() {
        tracing::info!(path = ?cli.vrf_key_path, "Loading existing VRF key");
        VrfKeyPair::load_from_file(&cli.vrf_key_path)?
    } else {
        tracing::info!(path = ?cli.vrf_key_path, "Generating new VRF key");
        let kp = VrfKeyPair::generate()?;
        kp.save_to_file(&cli.vrf_key_path)?;
        kp
    };

    // --- Engine API client ---
    let engine = EngineClient::new(cli.el_url.clone(), cli.jwt_secret.clone());

    tracing::info!(
        el_url = %cli.el_url,
        block_time = cli.block_time,
        "Starting consensus loop"
    );

    // Fetch genesis block hash from the EL's public RPC (not the Engine API).
    let public_rpc = cli.el_url.replace("8551", "8545");
    let genesis_hash = engine.get_latest_block_hash(&public_rpc).await?;
    tracing::info!(%genesis_hash, "Fetched genesis block hash");

    let mut head_hash = genesis_hash;
    let mut block_number: u64 = 0;

    loop {
        if let Err(e) = produce_block(&engine, &vrf_key, &mut head_hash, &mut block_number).await {
            tracing::error!(?e, "Block production failed");
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(cli.block_time)).await;
    }
}

/// Run one iteration of the block production cycle.
async fn produce_block(
    engine: &EngineClient,
    vrf_key: &VrfKeyPair,
    head_hash: &mut B256,
    block_number: &mut u64,
) -> Result<()> {
    let next_block = *block_number + 1;

    // Derive VRF randomness from the current head hash and block number.
    let vrf_input = [head_hash.as_slice(), &next_block.to_be_bytes()].concat();
    let (vrf_output, _proof) = vrf_key.prove(&vrf_input);
    let prev_randao = B256::from(vrf_output);

    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

    // Build payload attributes (V3).
    let payload_attributes = json!({
        "timestamp": format!("0x{timestamp:x}"),
        "prevRandao": prev_randao,
        "suggestedFeeRecipient": "0x0000000000000000000000000000000000000000",
        "withdrawals": [],
        "parentBeaconBlockRoot": B256::ZERO,
    });

    // Step 1: forkchoiceUpdated — tell the EL about the current head and request a new payload.
    let fcu_response = engine
        .fork_choice_updated(*head_hash, *head_hash, *head_hash, Some(payload_attributes))
        .await?;

    tracing::info!(block = next_block, "forkchoiceUpdated response received");

    let payload_id = extract_payload_id(&fcu_response)?;

    // Step 2: getPayload — retrieve the built execution payload.
    let payload_response = engine.get_payload(&payload_id).await?;

    let execution_payload = payload_response
        .get("executionPayload")
        .cloned()
        .unwrap_or(payload_response.clone());

    let new_block_hash = extract_block_hash(&execution_payload)?;

    tracing::info!(
        block = next_block,
        hash = %new_block_hash,
        "Got execution payload"
    );

    // Step 3: newPayload — submit the payload for validation.
    let versioned_hashes = json!([]);
    let parent_beacon_block_root = B256::ZERO;

    let new_payload_response = engine
        .new_payload(execution_payload, versioned_hashes, parent_beacon_block_root)
        .await?;

    let status = new_payload_response
        .get("status")
        .and_then(|s| s.as_str())
        .unwrap_or("UNKNOWN");

    tracing::info!(block = next_block, status, "newPayload response");

    if status == "VALID" || status == "ACCEPTED" {
        // Step 4: forkchoiceUpdated again to finalise the new head (no new payload requested).
        engine
            .fork_choice_updated(new_block_hash, new_block_hash, new_block_hash, None)
            .await?;

        *head_hash = new_block_hash;
        *block_number = next_block;

        tracing::info!(
            block = next_block,
            hash = %new_block_hash,
            "Block finalized"
        );
    } else {
        tracing::warn!(
            block = next_block,
            status,
            "Payload not accepted by EL"
        );
    }

    Ok(())
}

/// Extract the `payloadId` from a `forkchoiceUpdated` response.
fn extract_payload_id(fcu_response: &Value) -> Result<String> {
    fcu_response
        .get("payloadId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| eyre::eyre!("missing payloadId in forkchoiceUpdated response"))
}

/// Extract the `blockHash` from an execution payload.
fn extract_block_hash(payload: &Value) -> Result<B256> {
    let hash_str = payload
        .get("blockHash")
        .and_then(|v| v.as_str())
        .ok_or_else(|| eyre::eyre!("missing blockHash in execution payload"))?;

    hash_str
        .parse::<B256>()
        .map_err(|e| eyre::eyre!("invalid blockHash: {e}"))
}

/// Best-effort tracing subscriber initialisation.
fn tracing_subscriber_init() {
    use tracing_subscriber::EnvFilter;

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::fmt().with_env_filter(filter).init();
}
