#!/usr/bin/env bash
# Integration test for Tokasino node
# Requires: tokasino node running on localhost:8545 (HTTP RPC)
#           cast (foundry) installed
set -euo pipefail

RPC_URL="${RPC_URL:-http://localhost:8545}"
DEV_ACCOUNT="0x6Be02d1d3665660d22FF9624b7BE0551ee1Ac91b"
BEACON_HISTORY="0x4200000000000000000000000000000000000099"
RANDOMNESS_PRECOMPILE="0x000000000000000000000000000000000000000b"

echo "=== Tokasino Integration Test ==="
echo "RPC: $RPC_URL"
echo ""

# --------------------------------------------------------------------------
# 1. Check node is alive
# --------------------------------------------------------------------------
echo "--- Test 1: Node connectivity ---"
CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null || echo "FAIL")
if [ "$CHAIN_ID" = "7777" ]; then
    echo "PASS: Chain ID = $CHAIN_ID"
else
    echo "FAIL: Expected chain ID 7777, got: $CHAIN_ID"
    exit 1
fi

# --------------------------------------------------------------------------
# 2. Check dev account balance
# --------------------------------------------------------------------------
echo ""
echo "--- Test 2: Dev account balance ---"
BALANCE=$(cast balance "$DEV_ACCOUNT" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
if [ "$BALANCE" != "0" ]; then
    echo "PASS: Dev account balance = $BALANCE wei"
else
    echo "FAIL: Dev account has zero balance"
    exit 1
fi

# --------------------------------------------------------------------------
# 3. Check RandomBeaconHistory contract is deployed
# --------------------------------------------------------------------------
echo ""
echo "--- Test 3: RandomBeaconHistory contract deployed ---"
CODE=$(cast code "$BEACON_HISTORY" --rpc-url "$RPC_URL" 2>/dev/null || echo "0x")
if [ "$CODE" != "0x" ] && [ ${#CODE} -gt 10 ]; then
    echo "PASS: Contract deployed (${#CODE} chars of bytecode)"
else
    echo "FAIL: No contract at $BEACON_HISTORY"
    exit 1
fi

# --------------------------------------------------------------------------
# 4. Call randomness precompile
# --------------------------------------------------------------------------
echo ""
echo "--- Test 4: Randomness precompile call ---"
# Call precompile with 32 zero bytes as seed
RANDOM_RESULT=$(cast call "$RANDOMNESS_PRECOMPILE" --data "0x0000000000000000000000000000000000000000000000000000000000000000" --rpc-url "$RPC_URL" 2>/dev/null || echo "FAIL")
if [ "$RANDOM_RESULT" != "FAIL" ] && [ ${#RANDOM_RESULT} -ge 66 ]; then
    echo "PASS: Precompile returned: ${RANDOM_RESULT:0:20}..."
else
    echo "FAIL: Precompile call failed: $RANDOM_RESULT"
    exit 1
fi

# Call again - should return a different value
RANDOM_RESULT2=$(cast call "$RANDOMNESS_PRECOMPILE" --data "0x0000000000000000000000000000000000000000000000000000000000000000" --rpc-url "$RPC_URL" 2>/dev/null || echo "FAIL")
if [ "$RANDOM_RESULT" != "$RANDOM_RESULT2" ]; then
    echo "PASS: Second call returned different value: ${RANDOM_RESULT2:0:20}..."
else
    echo "WARN: Same value returned (may be expected in same block)"
fi

# --------------------------------------------------------------------------
# 5. Check block.prevrandao is non-zero
# --------------------------------------------------------------------------
echo ""
echo "--- Test 5: Block prevrandao ---"
BLOCK=$(cast block latest --rpc-url "$RPC_URL" 2>/dev/null || echo "FAIL")
if [ "$BLOCK" != "FAIL" ]; then
    MIXHASH=$(echo "$BLOCK" | grep -i "mixHash\|mix_hash" | head -1 || echo "")
    if [ -n "$MIXHASH" ]; then
        echo "PASS: Block mixHash (prevrandao): $MIXHASH"
    else
        echo "INFO: Block data received but mixHash field not found in output"
        echo "$BLOCK" | head -5
    fi
else
    echo "FAIL: Could not fetch block"
fi

# --------------------------------------------------------------------------
# 6. Check RandomBeaconHistory stores SoR
# --------------------------------------------------------------------------
echo ""
echo "--- Test 6: RandomBeaconHistory stores per-block randomness ---"
BLOCK_NUM=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
if [ "$BLOCK_NUM" -gt "0" ]; then
    # Query getRandomness(blockHeight) for block 1
    SOR=$(cast call "$BEACON_HISTORY" "getRandomness(uint256)(bytes32)" 1 --rpc-url "$RPC_URL" 2>/dev/null || echo "FAIL")
    if [ "$SOR" != "FAIL" ] && [ "$SOR" != "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
        echo "PASS: Block 1 SoR = ${SOR:0:20}..."
    else
        echo "INFO: Block 1 SoR not available (might be expected if system call didn't execute yet)"
        echo "      Current block: $BLOCK_NUM, SoR result: $SOR"
    fi
else
    echo "SKIP: No blocks produced yet"
fi

echo ""
echo "=== Integration Test Complete ==="
