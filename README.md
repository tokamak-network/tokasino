# Tokasino

Randomness-native EVM L2 for on-chain casino and gambling dApps.

## Vision

Existing EVM chains lack secure built-in randomness. Ethereum's `PREVRANDAO` is biasable by validators, and oracle solutions (Chainlink VRF) add cost and latency per request. This makes building trustless on-chain casinos impractical.

Tokasino is an L2 that provides **protocol-level, verifiable randomness** — free for dApp developers, with no external oracle dependency.

## Architecture

Tokasino uses [reth](https://github.com/paradigmxyz/reth) as a git dependency and extends it with randomness features via reth's modular `NodeBuilder` API. A custom Consensus Layer process generates VRF-backed randomness and delivers it to the EL via the standard Engine API.

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
                │ prev_randao = VRF output
                ▼
┌──────────────────────────────────────────────┐
│  reth + Tokasino extensions (EL)             │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ PREVRANDAO opcode (block.prevrandao)   │  │
│  │ Existing EVM — beacon output per block │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Randomness Precompile (0x0b)           │  │
│  │ Per-tx ChaCha20 CSPRNG                 │  │
│  │ Immediate, revertible                  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ RandomBeaconHistory (System Contract)  │  │
│  │ Stores per-block SoR on-chain          │  │
│  │ Commit-reveal for gambling             │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

## How It Works

### Randomness Generation

1. The CL generates a VRF proof: `VRF(secret_key, block_number) → (output, proof)`
2. `output` is sent to reth as `prev_randao` via Engine API
3. Anyone can verify the proof on-chain — the value cannot be forged

### Why VRF, Not Just Random Bytes?

| | Native RNG | VRF | Threshold BLS |
|---|---|---|---|
| Verifiable | No | **Yes** | Yes |
| Forgery-proof | No | **Yes** | Yes |
| Unpredictable | Operator knows | Operator knows | No one knows |
| Implementation | Trivial | **Phase 1** | Phase 2 |

Native RNG (raw random bytes) cannot prove fairness — the operator could insert any value. VRF guarantees that the output is deterministically derived from the input and cannot be manipulated, with a cryptographic proof anyone can verify. This is the minimum requirement for **Provably Fair** gambling.

## Randomness Interfaces for Solidity Developers

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

## Development Phases

### Phase 0 — Chain Runs (2-3 weeks)

- reth-based custom node boots in dev mode
- Custom `ChainSpec` with Tokasino chain ID and genesis
- Basic Solidity contract deployment and execution verified

### Phase 1 — VRF Randomness (4-6 weeks)

- Custom CL process generating VRF proofs per block
- Randomness precompile at `0x0b` (per-tx ChaCha20 CSPRNG)
- RandomBeaconHistory system contract (commit-reveal for gambling)
- VRF verifier contract for on-chain proof verification
- **Casino dApps can launch with Provably Fair guarantees**

### Phase 2 — Threshold BLS (Future)

- Distributed validators run DKG per epoch
- t+1 out of n signature shares required per block
- No single party can predict or bias randomness
- EL interface unchanged — dApp code does not change

## Project Structure

```
tokasino/
├── crates/
│   ├── node/                  # Custom reth node binary
│   │   ├── src/
│   │   │   ├── main.rs        # NodeBuilder entry point
│   │   │   ├── evm.rs         # MyEvmFactory + randomness precompile
│   │   │   ├── executor.rs    # BlockExecutor wrapper (system contract call)
│   │   │   └── payload.rs     # Custom payload builder
│   │   └── Cargo.toml
│   │
│   ├── consensus/             # Custom CL process (VRF beacon)
│   │   ├── src/
│   │   │   ├── main.rs        # Standalone binary
│   │   │   ├── vrf.rs         # VRF key management + proof generation
│   │   │   └── engine.rs      # Engine API client (HTTP)
│   │   └── Cargo.toml
│   │
│   └── contracts/             # Solidity contracts
│       ├── src/
│       │   ├── RandomBeaconHistory.sol
│       │   ├── IRandomness.sol
│       │   └── VRFVerifier.sol
│       └── foundry.toml
│
├── Cargo.toml                 # Workspace root
└── README.md
```

## Tech Stack

### Execution Layer (reth extension)

- Base: [reth](https://github.com/paradigmxyz/reth) v1.11.3 (git dependency)
- EVM: [revm](https://github.com/bluealloy/revm) (reth's built-in)
- Pattern: `NodeBuilder` API — custom `EvmFactory`, `BlockExecutor`, `PayloadBuilder`
- Per-tx CSPRNG: [`rand_chacha`](https://crates.io/crates/rand_chacha) (ChaCha20)

### Consensus Layer (Custom)

- VRF: [`blst`](https://github.com/supranational/blst) (BLS12-381, NCC audited)
- Future Threshold BLS: [`blsful`](https://lib.rs/crates/blsful) + [`gennaro-dkg`](https://crates.io/crates/gennaro-dkg)
- Engine API client: [`reqwest`](https://crates.io/crates/reqwest) + [`alloy-rpc-types-engine`](https://docs.rs/alloy-rpc-types-engine)

### Prior Art

| Project | Mechanism | EVM | Key Lesson |
|---------|-----------|-----|------------|
| [SKALE](https://skale.space/) | Threshold BLS precompile | Yes | Only production EVM chain with native threshold randomness |
| [Oasis Sapphire](https://oasisprotocol.org/) | VRF + TEE precompile | Yes | EVM precompile interface design |
| [Flow](https://flow.com/) | Threshold BLS beacon | Partial | Commit-reveal system contract pattern |
| [Sui](https://sui.io/) | Threshold DKG/BLS | No | Consensus-parallel randomness generation |
| [Aptos](https://aptos.dev/) | Weighted VRF/wVUF | No | Instant on-chain randomness API |
| [drand](https://drand.love/) | Threshold BLS (standalone) | Via evmnet | External beacon integration option |

## Security Model

| Property | Phase 1 (VRF) | Phase 2 (Threshold BLS) |
|----------|---------------|-------------------------|
| Verifiable | Yes — VRF proof on-chain | Yes — group public key |
| Unbiasable | No — sequencer can withhold block | Yes — threshold guarantee |
| Unpredictable | No — sequencer knows first | Yes — no one knows |
| Revert-resistant | Yes — via commit-reveal | Yes — via commit-reveal |
| Forgery-proof | Yes — VRF is deterministic | Yes — threshold signature |

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
