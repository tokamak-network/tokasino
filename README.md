# Tokasino

Randomness-native OP Stack L2 for on-chain casino and gambling dApps.

## Vision

Existing EVM chains lack secure built-in randomness. Ethereum's `PREVRANDAO` is biasable by validators, and oracle solutions (Chainlink VRF) add cost and latency per request. This makes building trustless on-chain casinos impractical.

Tokasino is an OP Stack L2 that provides **protocol-level, verifiable randomness** — free for dApp developers, with no external oracle dependency.

## Architecture

Tokasino is a fork of [op-reth](https://github.com/op-rs/op-reth) (the official Rust OP Stack execution client) with randomness features added to the EVM layer. It runs as a standard OP Stack chain with Go op-node, op-batcher, and op-proposer.

```
┌────────────────────────────────────────┐
│  OP Stack Infrastructure (Go)          │
│                                        │
│  op-node    ← L1 derivation + CL      │
│  op-batcher ← batch submission to L1   │
│  op-proposer← output root proposals   │
└─────────────────┬──────────────────────┘
                  │ Engine API
                  │ prev_randao (VRF-overridden in EL)
                  ▼
┌────────────────────────────────────────────────┐
│  op-reth fork (Tokasino EL)                    │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ PREVRANDAO opcode (block.prevrandao)     │  │
│  │ VRF-derived randomness per block         │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ Randomness Precompile (0x0b)             │  │
│  │ Per-tx ChaCha20 CSPRNG                   │  │
│  │ Immediate, revertible                    │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ RandomBeaconHistory (System Contract)    │  │
│  │ Stores per-block SoR on-chain            │  │
│  │ Commit-reveal for gambling               │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  All other OP Stack features intact:           │
│  L1→L2 deposits, L2 fee model, bridge, etc.   │
└────────────────────────────────────────────────┘
```

### Why OP Stack?

| Feature | Pure reth | op-reth (OP Stack) |
|---------|-----------|-------------------|
| L1 ↔ L2 bridge | None | Built-in |
| L1 settlement | None | Built-in |
| L2 fee model | L1 pricing | L1 fee + L2 fee split |
| Sequencer | Custom CL needed | op-node (production) |
| Fault proofs | None | Cannon / kona-client |
| Ecosystem | None | Superchain compatible |

## Randomness Features

### How It Works

1. The OP Stack sequencer provides `prev_randao` via Engine API
2. The EL overrides this with a VRF-derived value in the payload builder
3. Each block gets a verifiable, deterministic random seed
4. Smart contracts access randomness via precompile or system contract

### Solidity Interfaces

#### 1. `block.prevrandao` (Existing EVM Opcode)

Direct beacon output per block. Zero gas overhead.

```solidity
uint256 rand = block.prevrandao;
```

#### 2. Randomness Precompile (Immediate, Revertible)

Per-transaction CSPRNG backed by ChaCha20, seeded from the beacon.

```solidity
interface IRandomness {
    function getRandomUint256() external view returns (uint256);
}

IRandomness constant RANDOM = IRandomness(address(0x0b));
uint256 rand = RANDOM.getRandomUint256();
```

Suitable for: GameFi loot drops, NFT minting, random matchmaking.
Not suitable for gambling — users can revert unfavorable outcomes.

#### 3. RandomBeaconHistory (Commit-Reveal, Non-Revertible)

System contract for trustless gambling via commit-reveal pattern.

```solidity
interface IRandomBeaconHistory {
    function getRandomness(uint256 blockHeight) external view returns (bytes32);
}

// Phase 1: placeBet() — randomness for this block is unknown
// Phase 2: resolveBet() — fetch finalized randomness, determine outcome
```

## Repository Structure

### This repo (tokasino)

Prototyping and contracts. Contains:
- `crates/node/` — reth-based prototype node (dev mode testing)
- `crates/consensus/` — VRF consensus layer prototype (BLS12-381)
- `crates/contracts/` — Solidity contracts (RandomBeaconHistory, CasinoExample, etc.)
- `scripts/` — Integration test scripts

### op-reth fork (tokasino-op-reth)

Production execution client. Fork of [op-rs/op-reth](https://github.com/op-rs/op-reth) with:
- Custom `OpEvmFactory` wrapper adding randomness precompile at 0x0b
- Custom `BlockExecutor` injecting RandomBeaconHistory system call per block
- VRF-based `prev_randao` override in payload builder
- RandomBeaconHistory contract in genesis

## Development Phases

### Phase 0 — Prototype (Done)

- [x] Randomness precompile (ChaCha20 CSPRNG)
- [x] RandomBeaconHistory system contract
- [x] VRF consensus layer (BLS12-381)
- [x] CL-EL integration via Engine API
- [x] E2E CasinoExample commit-reveal test passing

### Phase 1 — OP Stack Integration (Current)

- [ ] Fork op-reth, add randomness to OpEvmConfig
- [ ] VRF override in OpPayloadBuilder
- [ ] Deploy with standard OP Stack (op-node + op-batcher + op-proposer)
- [ ] L1 settlement on Ethereum testnet

### Phase 2 — Production

- [ ] Threshold BLS beacon (distributed validators)
- [ ] Mainnet deployment
- [ ] Superchain compatibility

## Tech Stack

### Execution Layer

- Base: [op-reth](https://github.com/op-rs/op-reth) (official Rust OP Stack EL)
- EVM: revm + op-revm
- Randomness: ChaCha20 CSPRNG + BLS12-381 VRF

### Consensus / Infrastructure (Go)

- [op-node](https://github.com/ethereum-optimism/optimism/tree/develop/op-node) — rollup node
- [op-batcher](https://github.com/ethereum-optimism/optimism/tree/develop/op-batcher) — batch submitter
- [op-proposer](https://github.com/ethereum-optimism/optimism/tree/develop/op-proposer) — output proposer

### Cryptographic Libraries

- [`blst`](https://github.com/supranational/blst) — BLS12-381 VRF (NCC audited)
- [`rand_chacha`](https://crates.io/crates/rand_chacha) — Per-tx CSPRNG
- Future: [`blsful`](https://lib.rs/crates/blsful) + [`gennaro-dkg`](https://crates.io/crates/gennaro-dkg) for Threshold BLS

## Security Model

| Property | Phase 1 (VRF) | Phase 2 (Threshold BLS) |
|----------|---------------|-------------------------|
| Verifiable | Yes — VRF proof on-chain | Yes — group public key |
| Unbiasable | No — sequencer can withhold | Yes — threshold guarantee |
| Unpredictable | No — sequencer knows first | Yes — no one knows |
| Revert-resistant | Yes — via commit-reveal | Yes — via commit-reveal |
| Forgery-proof | Yes — VRF is deterministic | Yes — threshold signature |

## Prior Art

| Project | Mechanism | EVM | Lesson |
|---------|-----------|-----|--------|
| [SKALE](https://skale.space/) | Threshold BLS precompile | Yes | Only production EVM chain with native threshold randomness |
| [Oasis Sapphire](https://oasisprotocol.org/) | VRF + TEE precompile | Yes | EVM precompile interface design |
| [Flow](https://flow.com/) | Threshold BLS beacon | Partial | Commit-reveal system contract pattern |
| [Sui](https://sui.io/) | Threshold DKG/BLS | No | Consensus-parallel randomness |
| [Aptos](https://aptos.dev/) | Weighted VRF/wVUF | No | Instant randomness API |

## License

TBD
