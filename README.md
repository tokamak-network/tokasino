# Tokasino

Randomness-native EVM L2 for on-chain casino and gambling dApps.

## Vision

Existing EVM chains lack secure built-in randomness. Ethereum's `PREVRANDAO` is biasable by validators, and oracle solutions (Chainlink VRF) add cost and latency per request. This makes building trustless on-chain casinos impractical.

Tokasino is an L2 that provides **protocol-level, unbiasable randomness** — free for dApp developers, with no external oracle dependency.

## Architecture

Tokasino is built by forking [ethrex](https://github.com/lambdaclass/ethrex) (Rust-based Ethereum execution client by Lambdaclass) and adding a custom Consensus Layer with a built-in random beacon.

```
┌──────────────────────────────────┐
│  Custom Consensus Layer          │
│  (Separate process)              │
│                                  │
│  Phase 1: VRF Beacon             │
│  Phase 2: Threshold BLS Beacon   │
│                                  │
│  Generates per-block randomness  │
└───────────────┬──────────────────┘
                │ HTTP (Engine API)
                │ prev_randao = beacon output
                ▼
┌──────────────────────────────────┐
│  ethrex fork (Execution Layer)   │
│                                  │
│  ┌────────────────────────────┐  │
│  │ PREVRANDAO opcode          │  │
│  │ block.prevrandao in        │  │
│  │ Solidity (existing)        │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ Randomness Precompile      │  │
│  │ (0x0b)                     │  │
│  │ Per-tx CSPRNG via ChaCha20 │  │
│  │ Immediate, revertible      │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ RandomBeaconHistory        │  │
│  │ (System Contract)          │  │
│  │ Commit-reveal pattern      │  │
│  │ Non-revertible, for        │  │
│  │ gambling                   │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

## Randomness Interfaces for Solidity Developers

Tokasino exposes three layers of randomness to smart contracts:

### 1. `block.prevrandao` (Existing EVM Opcode)

Direct beacon output per block. Zero gas overhead.

```solidity
uint256 rand = block.prevrandao;
```

### 2. Randomness Precompile (Immediate, Revertible)

Per-transaction CSPRNG backed by ChaCha20, seeded from the beacon. Each transaction within the same block gets an independent random stream.

```solidity
interface IRandomness {
    function getRandomUint256() external view returns (uint256);
}

IRandomness constant RANDOM = IRandomness(address(0x0b));
uint256 rand = RANDOM.getRandomUint256();
```

Suitable for: GameFi loot drops, NFT minting, random matchmaking.

Not suitable for gambling — users can revert unfavorable outcomes.

### 3. RandomBeaconHistory (Commit-Reveal, Non-Revertible)

System contract storing per-block beacon outputs. Enables the commit-reveal pattern required for trustless gambling.

```solidity
interface IRandomBeaconHistory {
    function sourceOfRandomness(uint256 blockHeight) external view returns (bytes32);
}

contract Casino {
    IRandomBeaconHistory constant BEACON = IRandomBeaconHistory(0x...);

    struct Bet {
        address player;
        uint256 amount;
        uint256 commitBlock;
        uint8 choice;
    }

    // Phase 1: User places bet (randomness for this block is unknown)
    function placeBet(uint8 choice) external payable {
        bets[nextId] = Bet(msg.sender, msg.value, block.number, choice);
    }

    // Phase 2: Resolve after commit block (randomness is now finalized)
    function resolveBet(uint256 betId) external {
        Bet memory bet = bets[betId];
        require(block.number > bet.commitBlock, "too early");

        bytes32 sor = BEACON.sourceOfRandomness(bet.commitBlock);
        uint256 rand = uint256(keccak256(abi.encodePacked(sor, betId)));
        uint8 result = uint8(rand % 6) + 1;

        if (result == bet.choice) {
            payable(bet.player).transfer(bet.amount * 5);
        }
    }
}
```

## Random Beacon: Phased Approach

### Phase 1 — VRF Beacon (Single Sequencer)

- Sequencer generates a VRF proof per block
- Output is verifiable (anyone can check it wasn't manipulated)
- Sequencer knows the result before publishing (trust required)
- Fastest to ship (~2-3 person-months for CL)

### Phase 2 — Threshold BLS Beacon (Distributed Validators)

- Validators run DKG (Distributed Key Generation) per epoch
- Each block requires t+1 out of n signature shares to produce randomness
- No single party can predict or bias the result
- Gold standard for trustless gambling (~12-24 person-months for CL)

The EL interface remains identical across phases — dApp code does not change when upgrading from VRF to Threshold BLS.

## Tech Stack

### Execution Layer (ethrex fork)

- Language: Rust
- EVM: LEVM (Lambda EVM)
- Base: [ethrex](https://github.com/lambdaclass/ethrex) by Lambdaclass

### Consensus Layer (Custom)

- Language: Rust
- Curve: BLS12-381 via [`blst`](https://github.com/supranational/blst)
- Threshold BLS: [`blsful`](https://lib.rs/crates/blsful) (Kudelski audited)
- Secret Sharing: [`vsss-rs`](https://crates.io/crates/vsss-rs) (Feldman/Pedersen VSS)
- DKG: [`gennaro-dkg`](https://crates.io/crates/gennaro-dkg)
- Per-tx CSPRNG: [`rand_chacha`](https://crates.io/crates/rand_chacha) (ChaCha20)

### Reference Implementations

- [Flow `onflow/crypto`](https://github.com/onflow/crypto) — DKG architecture, beacon protocol
- [drand](https://github.com/drand/drand) — Distributed randomness beacon design
- [Sui `fastcrypto`](https://github.com/MystenLabs/fastcrypto) — Rust threshold BLS reference
- [Aptos AIP-79](https://github.com/aptos-foundation/AIPs/blob/main/aips/aip-79.md) — Weighted DKG

## Security Model

| Property | Phase 1 (VRF) | Phase 2 (Threshold BLS) |
|----------|---------------|-------------------------|
| Verifiable | Yes | Yes |
| Unbiasable | No (sequencer can withhold) | Yes (threshold) |
| Unpredictable | No (sequencer knows first) | Yes (no one knows) |
| Revert-resistant | Yes (via commit-reveal) | Yes (via commit-reveal) |

## Why Not Just Use Chainlink VRF?

| | Chainlink VRF | Tokasino Native |
|---|---|---|
| Cost | ~0.25 LINK per request + gas | Free |
| Latency | 2-3 blocks (~24-36s on L1) | Same block or next block |
| Dependency | External oracle network | Built into protocol |
| Availability | Oracle must be running | Always available |
| Developer UX | Async callback pattern | Simple read or commit-reveal |

## License

TBD
