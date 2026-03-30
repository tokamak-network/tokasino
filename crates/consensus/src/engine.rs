use alloy_primitives::B256;
use eyre::{eyre, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// JSON-RPC request envelope.
#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    method: String,
    params: Value,
    id: u64,
}

/// JSON-RPC response envelope.
#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    #[allow(dead_code)]
    id: u64,
    result: Option<Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

impl std::fmt::Display for JsonRpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "JSON-RPC error {}: {}", self.code, self.message)
    }
}

/// Engine API client that talks to a reth execution layer node.
pub struct EngineClient {
    client: Client,
    url: String,
    jwt_token: Option<String>,
    next_id: std::sync::atomic::AtomicU64,
}

impl EngineClient {
    /// Create a new Engine API client pointing at the given EL URL.
    ///
    /// `jwt_token` is the hex-encoded JWT secret for Engine API authentication.
    /// Pass `None` to skip auth (useful for local development).
    pub fn new(url: String, jwt_token: Option<String>) -> Self {
        Self {
            client: Client::new(),
            url,
            jwt_token,
            next_id: std::sync::atomic::AtomicU64::new(1),
        }
    }

    /// Send a raw JSON-RPC request and return the result value.
    async fn rpc_call(&self, method: &str, params: Value) -> Result<Value> {
        let id = self
            .next_id
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            method: method.to_string(),
            params,
            id,
        };

        let mut req_builder = self.client.post(&self.url).json(&request);

        // Attach JWT bearer token if configured.
        if let Some(ref token) = self.jwt_token {
            req_builder = req_builder.bearer_auth(token);
        }

        let response: JsonRpcResponse = req_builder.send().await?.json().await?;

        if let Some(err) = response.error {
            return Err(eyre!("{err}"));
        }

        response
            .result
            .ok_or_else(|| eyre!("JSON-RPC response missing both result and error"))
    }

    /// Send `engine_forkchoiceUpdatedV3`.
    ///
    /// `payload_attributes` should be a JSON object matching `PayloadAttributesV3`, or `null`
    /// if no new block should be built.
    pub async fn fork_choice_updated(
        &self,
        head_hash: B256,
        safe_hash: B256,
        finalized_hash: B256,
        payload_attributes: Option<Value>,
    ) -> Result<Value> {
        let fork_choice_state = json!({
            "headBlockHash": head_hash,
            "safeBlockHash": safe_hash,
            "finalizedBlockHash": finalized_hash,
        });

        let params = json!([fork_choice_state, payload_attributes]);

        tracing::debug!(
            %head_hash,
            "engine_forkchoiceUpdatedV3"
        );

        self.rpc_call("engine_forkchoiceUpdatedV3", params).await
    }

    /// Send `engine_getPayloadV3` to retrieve a built execution payload.
    pub async fn get_payload(&self, payload_id: &str) -> Result<Value> {
        let params = json!([payload_id]);

        tracing::debug!(payload_id, "engine_getPayloadV3");

        self.rpc_call("engine_getPayloadV3", params).await
    }

    /// Send `engine_newPayloadV3` to submit an execution payload for validation.
    ///
    /// `execution_payload` should be the full `ExecutionPayloadV3` JSON object.
    /// `versioned_hashes` is the list of blob versioned hashes (can be empty `[]`).
    /// `parent_beacon_block_root` is the parent beacon block root.
    pub async fn new_payload(
        &self,
        execution_payload: Value,
        versioned_hashes: Value,
        parent_beacon_block_root: B256,
    ) -> Result<Value> {
        let params = json!([execution_payload, versioned_hashes, parent_beacon_block_root]);

        tracing::debug!("engine_newPayloadV3");

        self.rpc_call("engine_newPayloadV3", params).await
    }
}
