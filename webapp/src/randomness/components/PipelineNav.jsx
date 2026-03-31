import { useRandomness } from '../context/RandomnessContext.jsx'
import { sh } from '../lib/helpers.js'
import PipelineNode from './PipelineNode.jsx'

const NODES = [
  { stage: 'problem', num: 'Stage 0', title: 'The Problem', sub: 'Why is on-chain randomness hard?' },
  { stage: 'vrf', num: 'Stage 1 \u2014 Consensus Layer', title: 'VRF: BLS12-381 Signing', sub: 'Sequencer signs (parent_hash || block_num)', valueKey: 'vrfInput' },
  { stage: 'prevrandao', num: 'Stage 2 \u2014 Block Field', title: 'prevrandao', sub: 'keccak256(BLS signature) = block random', valueKey: 'prevrandao' },
  { stage: 'precompile', num: 'Stage 3 \u2014 EVM Precompile', title: '0x0b: ChaCha20 CSPRNG', sub: 'seed + counter \u2192 unique random per call' },
  { stage: 'contract', num: 'Stage 4 \u2014 Smart Contract', title: 'Game Seed Derivation', sub: 'keccak256(prevrandao, block, sender, salt)', valueKey: 'gameSeed' },
  { stage: 'chaining', num: 'Stage 5 \u2014 Security', title: 'Block Chaining', sub: "Each block's hash \u2192 next block's VRF input", valueKey: 'diceResult' },
]

export default function PipelineNav() {
  const { currentStage, setCurrentStage, traced } = useRandomness()

  function getValue(node) {
    if (!node.valueKey || !traced.blockNumber) return undefined
    switch (node.valueKey) {
      case 'vrfInput': return sh(traced.parentHash, 6) + ' || ' + traced.blockNumber
      case 'prevrandao': return traced.prevrandao ? sh(traced.prevrandao, 6) : '--'
      case 'gameSeed': return traced.gameSeed ? sh(traced.gameSeed, 6) : '--'
      case 'diceResult': return traced.diceResult ? 'Dice: ' + traced.diceResult : '--'
      default: return '--'
    }
  }

  return (
    <div className="pipe-col">
      {NODES.map((node, i) => (
        <div key={node.stage}>
          <PipelineNode
            stage={node.stage}
            num={node.num}
            title={node.title}
            sub={node.sub}
            value={getValue(node)}
            isActive={currentStage === node.stage}
            onClick={setCurrentStage}
          />
          {i < NODES.length - 1 && (
            <div className={`pipe-arrow${currentStage === NODES[i + 1]?.stage ? ' active' : ''}`}>&darr;</div>
          )}
        </div>
      ))}
      <div style={{ textAlign: 'center', marginTop: '0.5rem', fontFamily: 'var(--mono)', fontSize: '0.45rem', color: 'var(--muted)' }}>
        Tracing: <span style={{ color: 'var(--neon)' }}>{traced.blockNumber ? `#${traced.blockNumber}` : '\u2014'}</span>
      </div>
    </div>
  )
}
