//! HTTP-based P2P layer for DRB partial signature exchange.
//!
//! Each beacon node runs an HTTP server that accepts partial signatures
//! from peers and broadcasts its own partial signature to all peers.

use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use eyre::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::beacon::BeaconNode;

/// Wire format for partial signature exchange.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartialSigMessage {
    pub round: u64,
    pub index: u32,
    pub signature: Vec<u8>,
}

/// Shared state for the HTTP server.
type AppState = Arc<BeaconNode>;

/// Start the P2P HTTP server for receiving partial signatures.
pub async fn start_p2p_server(node: Arc<BeaconNode>, port: u16) -> Result<()> {
    let app = Router::new()
        .route("/partial", post(handle_partial))
        .route("/health", axum::routing::get(|| async { "ok" }))
        .with_state(node);

    let addr = format!("0.0.0.0:{port}");
    tracing::info!(%addr, "Starting DRB P2P server");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// Handle incoming partial signature from a peer.
async fn handle_partial(
    State(node): State<AppState>,
    Json(msg): Json<PartialSigMessage>,
) -> StatusCode {
    let partial = crate::threshold::PartialSignature {
        index: msg.index,
        signature: msg.signature,
    };

    if node.submit_partial(msg.round, partial).await {
        tracing::debug!(round = msg.round, from = msg.index, "Accepted partial sig");
        StatusCode::OK
    } else {
        tracing::warn!(round = msg.round, from = msg.index, "Rejected partial sig");
        StatusCode::BAD_REQUEST
    }
}

/// Broadcast this node's partial signature to all peers.
pub async fn broadcast_partial(
    client: &reqwest::Client,
    peers: &[String],
    round: u64,
    partial: &crate::threshold::PartialSignature,
) {
    let msg = PartialSigMessage {
        round,
        index: partial.index,
        signature: partial.signature.clone(),
    };

    for peer in peers {
        let url = format!("{peer}/partial");
        let client = client.clone();
        let msg = msg.clone();

        tokio::spawn(async move {
            match client.post(&url).json(&msg).send().await {
                Ok(resp) if resp.status().is_success() => {
                    tracing::debug!(peer = %url, "Broadcast partial sig OK");
                }
                Ok(resp) => {
                    tracing::warn!(peer = %url, status = %resp.status(), "Broadcast rejected");
                }
                Err(e) => {
                    tracing::warn!(peer = %url, error = %e, "Broadcast failed");
                }
            }
        });
    }
}
