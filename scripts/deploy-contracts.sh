#!/usr/bin/env bash
set -euo pipefail

# Tokasino Contract Deployment Script
# Deploys all game contracts and updates webapp config with deployed addresses.
#
# Usage:
#   ./scripts/deploy-contracts.sh [RPC_URL]
#
# Default RPC: http://localhost:8545
# Uses Foundry dev account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

RPC_URL="${1:-http://localhost:8545}"
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
CONTRACTS_DIR="$(cd "$(dirname "$0")/../crates/contracts" && pwd)"
WEBAPP_CONFIG="$(cd "$(dirname "$0")/../webapp/shared" && pwd)/config.js"

echo "=== Tokasino Contract Deployment ==="
echo "RPC: $RPC_URL"
echo ""

# Deploy contracts
echo "[1/2] Deploying contracts..."
OUTPUT=$(forge script "$CONTRACTS_DIR/script/Deploy.s.sol" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --root "$CONTRACTS_DIR" \
  2>&1)

echo "$OUTPUT"

# Parse addresses from forge output
DICE=$(echo "$OUTPUT" | grep "InstantDice:" | awk '{print $2}')
COINFLIP=$(echo "$OUTPUT" | grep "CoinFlip:" | awk '{print $2}')
ROULETTE=$(echo "$OUTPUT" | grep "Roulette:" | awk '{print $2}')
LOTTERY=$(echo "$OUTPUT" | grep "Lottery:" | awk '{print $2}')

if [ -z "$DICE" ] || [ -z "$COINFLIP" ] || [ -z "$ROULETTE" ] || [ -z "$LOTTERY" ]; then
  echo ""
  echo "ERROR: Could not parse contract addresses from deployment output."
  echo "Please manually update $WEBAPP_CONFIG"
  exit 1
fi

echo ""
echo "[2/2] Updating webapp config..."

# Update config.js with deployed addresses (case-insensitive replacement)
sed -i.bak \
  -e "s|dice: '0x[0-9a-fA-F]\{40\}'|dice: '$DICE'|" \
  -e "s|coinFlip: '0x[0-9a-fA-F]\{40\}'|coinFlip: '$COINFLIP'|" \
  -e "s|roulette: '0x[0-9a-fA-F]\{40\}'|roulette: '$ROULETTE'|" \
  -e "s|lottery: '0x[0-9a-fA-F]\{40\}'|lottery: '$LOTTERY'|" \
  "$WEBAPP_CONFIG"
rm -f "${WEBAPP_CONFIG}.bak"

echo ""
echo "=== Deployment Complete ==="
echo "  InstantDice: $DICE"
echo "  CoinFlip:    $COINFLIP"
echo "  Roulette:    $ROULETTE"
echo "  Lottery:     $LOTTERY"
echo ""
echo "Config updated: $WEBAPP_CONFIG"
echo ""
echo "To serve the webapp:"
echo "  python3 -m http.server 3000 --directory webapp"
