# Enshrined VRF

Enshrined VRF for OP Stack L2 — protocol-level verifiable randomness without external oracles.

## Background

### What is VRF?

A **Verifiable Random Function (VRF)** takes a secret key and an input, and produces a random number together with a cryptographic proof. Anyone with the corresponding public key can verify the output, but without the secret key, neither the output nor future values can be predicted or manipulated.

VRF is essential for blockchains because it provides:

- **Bias resistance** — no party can manipulate the result
- **Public verifiability** — anyone can check correctness on-chain
- **Pseudorandomness** — output is indistinguishable from true randomness

Most blockchain projects (Aptos Roll, Flow, Algorand, DFINITY) use multiple validators or nodes to generate randomness in a distributed fashion.

### The Problem with Oracle-based VRF

Chainlink VRF is the industry standard, but it introduces significant overhead:

1. The dApp sends a randomness request
2. The request is recorded on L1
3. The Chainlink oracle detects the request
4. The oracle generates a VRF output off-chain
5. The result is delivered back via callback on L2

This round-trip takes **~30 seconds** and incurs a **per-request fee**. For high-frequency applications like on-chain games and casinos, this latency and cost are prohibitive.

### Enshrined VRF — The Solution

Enshrined VRF embeds the randomness generator directly inside the L2 sequencer engine, rather than relying on external oracles.

- **Zero latency** — VRF is computed in Go during block production (~0.1ms)
- **Zero cost** — no oracle fees; randomness is a protocol primitive
- **EVM-native** — accessible via a precompile at a fixed address

#### How It Works

When the sequencer builds a new block:

1. It retrieves the **L1 RANDAO** value from the OP Stack derivation pipeline — an external entropy source the sequencer cannot control
2. It combines the sequencer's **secret key**, the **L1 RANDAO**, and the **L2 block number** to form a seed
3. It runs the **ECVRF algorithm** on this seed, producing:
   - **Beta (random value)** — a 32-byte random number for dApps to consume
   - **Pi (proof)** — a mathematical proof that the value was honestly generated with the sequencer's key

```
L1 Beacon ──(RANDAO)──→ ┌────────────────────────┐
                         │  Sequencer Engine       │
L2 Block Number ────────→│                        │──→ Beta (random value)
                         │  ECVRF(sk, seed)       │──→ Pi   (proof)
Sequencer Secret Key ───→└────────────────────────┘
```

### Limitation: Weak Unpredictability

Since the sequencer holds the secret key, Enshrined VRF provides **"weak unpredictability"**:

| Concern | Description |
|---------|-------------|
| **Predictability** | The sequencer knows the random value before anyone else |
| **Liveness** | The sequencer can withhold blocks to avoid unfavorable outcomes |
| **Centralization** | A single entity controls randomness generation |
| **Collusion** | Risk of sequencer–user collusion or sequencer acting as a player |

This is acceptable for many use cases (NFT mints, loot drops, matchmaking) but insufficient for trustless gambling where the house must be provably fair.

## Overcoming Weak Unpredictability

### DRB (Distributed Random Beacon) — Commit-Reveal

To eliminate sequencer trust, we deploy a **DRB Commit-Reveal** contract on the L2. Multiple independent operators participate in each round:

```
[Operator A] ──commit(hash)──→ ┌─────────────────────┐
[Operator B] ──commit(hash)──→ │  DRB Commit-Reveal   │
[Operator C] ──commit(hash)──→ │  Contract (L2)       │
                               └──────────┬──────────┘
                                          │ reveal phase
[Operator A] ──reveal(secret)─→           │
[Operator B] ──reveal(secret)─→           │
[Operator C] ──reveal(secret)─→           │
                                          ▼
                               finalized randomness = hash(XOR of all secrets)
                                          │
                    Sequencer (CL) ←──────┘
                          │
             VRF input = parent_hash + block_number + drb_seed
                          │
                    prev_randao → RandomBeaconHistory
```

**Security guarantees:**

- **N-of-N reveal** — all committers must reveal; otherwise the round expires
- **1-of-N unpredictability** — as long as one operator keeps their secret private until reveal, the final randomness is unpredictable
- **Front-run resistant** — `commitment = keccak256(secret || msg.sender)`, binding the secret to the operator

### Threshold BLS Beacon (Future)

The ultimate solution is a distributed key generation (DKG) scheme where no single party holds the full secret key. Using Threshold BLS signatures, a quorum of validators collectively produce each random beacon value.

## Architecture

This project is built on the OP Stack, forking [op-reth](https://github.com/op-rs/op-reth) (the official Rust OP Stack execution client).

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
│  op-reth fork (Enshrined VRF EL)               │
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

## Solidity Interfaces

### 1. `block.prevrandao` (Existing EVM Opcode)

Direct beacon output per block. Zero gas overhead.

```solidity
uint256 rand = block.prevrandao;
```

### 2. Randomness Precompile (Immediate, Revertible)

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

### 3. RandomBeaconHistory (Commit-Reveal, Non-Revertible)

System contract for trustless gambling via commit-reveal pattern.

```solidity
interface IRandomBeaconHistory {
    function getRandomness(uint256 blockHeight) external view returns (bytes32);
}

// Phase 1: placeBet() — randomness for this block is unknown
// Phase 2: resolveBet() — fetch finalized randomness, determine outcome
```

### 4. DRB Commit-Reveal

```solidity
IDRBCommitReveal drb = IDRBCommitReveal(DRB_ADDRESS);
bytes32 rand = drb.getRoundRandomness(drb.latestFinalizedRound());
```

## Prior Art & Comparison

| Project | Mechanism | Latency | Trust Model | EVM |
|---------|-----------|---------|-------------|-----|
| **Chainlink VRF** | Off-chain oracle VRF | ~30s + fee per request | Trust oracle network | Yes |
| **Ethereum PREVRANDAO** | Validator RANDAO mix | 1 block | Biasable by validators | Yes |
| **SKALE** | Threshold BLS precompile | 1 block | N-of-M threshold | Yes |
| **Oasis Sapphire** | VRF + TEE precompile | 1 block | Trust TEE hardware | Yes |
| **Flow** | Threshold BLS beacon | 1 block | Distributed validators | Partial |
| **Sui** | Threshold DKG/BLS | 1 block | Consensus-parallel | No |
| **Aptos** | Weighted VRF (wVUF) | Instant | Weighted validator set | No |
| **Algorand** | Sortition + VRF | 1 block | Cryptographic sortition | No |
| **DFINITY (ICP)** | Threshold BLS (chain-key) | 1 block | Subnet consensus | No |
| **RISE Chain** | Enshrined ECVRF in sequencer | ~0.1ms | Sequencer (weak unpredictability) | Yes |
| **Enshrined VRF (this)** | Enshrined ECVRF + DRB | ~0.1ms | 1-of-N honest operator | Yes |

### Key Takeaways from Other Protocols

- **Aptos / Flow / DFINITY**: Use distributed validators for strong unpredictability, but sacrifice EVM compatibility or require custom VMs
- **SKALE**: The only production EVM chain with native threshold randomness — validates that protocol-level randomness is viable
- **Algorand**: Pioneered VRF-based cryptographic sortition for leader election; proves VRF scales to consensus-level usage
- **RISE Chain**: Demonstrated that enshrined VRF in the sequencer delivers sub-millisecond latency, but acknowledged the weak unpredictability tradeoff

Our approach combines the speed of enshrined VRF with the trust guarantees of a DRB commit-reveal layer, while maintaining full EVM compatibility on the OP Stack.

## Security Model

| Property | Enshrined VRF Only | Enshrined VRF + DRB | Threshold BLS (Future) |
|----------|-------------------|---------------------|-------------------------|
| Verifiable | Yes — VRF proof | Yes — VRF + Merkle | Yes — group public key |
| Unbiasable | No — sequencer bias | Yes — 1-of-N honest | Yes — threshold guarantee |
| Unpredictable | No — sequencer knows | Yes — commit-reveal | Yes — no one knows |
| Revert-resistant | Yes — system call | Yes — system call | Yes — system call |
| Forgery-proof | Yes — VRF deterministic | Yes — VRF + DRB hash | Yes — threshold signature |

## Repository Structure

### This repo (enshrined-vrf)

- `crates/node/` — reth-based prototype node (dev mode testing)
- `crates/consensus/` — VRF consensus layer prototype (BLS12-381)
- `crates/contracts/` — Solidity contracts (RandomBeaconHistory, DRBCommitReveal, etc.)
- `webapp/` — Demo dApps (randomness explorer, RPS game, liquidity pool)
- `scripts/` — Integration test scripts
- `docs/` — Design documents

### op-reth fork (enshrined-vrf-op-reth)

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

- [x] DRB Commit-Reveal contract for distributed randomness
- [ ] Fork op-reth, add randomness to OpEvmConfig
- [ ] VRF override in OpPayloadBuilder
- [ ] DRB seed integration into CL VRF input
- [ ] Deploy with standard OP Stack (op-node + op-batcher + op-proposer)
- [ ] L1 settlement on Ethereum testnet

### Phase 2 — Production

- [ ] DRB operator node client
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

## License

TBD
