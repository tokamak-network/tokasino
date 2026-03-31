import { useEffect, useRef } from 'react'
import { useRandomness } from '../context/RandomnessContext.jsx'
import StageProblem from './stages/StageProblem.jsx'
import StageVrf from './stages/StageVrf.jsx'
import StagePrevrandao from './stages/StagePrevrandao.jsx'
import StagePrecompile from './stages/StagePrecompile.jsx'
import StageContract from './stages/StageContract.jsx'
import StageChaining from './stages/StageChaining.jsx'

const STAGE_MAP = {
  problem: { component: StageProblem, title: 'Why is On-Chain Randomness Hard?', badge: 'THE PROBLEM' },
  vrf: { component: StageVrf, title: 'VRF: BLS12-381 Signing', badge: 'STAGE 1 \u2014 CONSENSUS' },
  prevrandao: { component: StagePrevrandao, title: 'prevrandao: Block Random Field', badge: 'STAGE 2 \u2014 BLOCK' },
  precompile: { component: StagePrecompile, title: 'Precompile 0x0b: Per-Call Randomness', badge: 'STAGE 3 \u2014 EVM' },
  contract: { component: StageContract, title: 'Smart Contract: Game Seed', badge: 'STAGE 4 \u2014 SOLIDITY' },
  chaining: { component: StageChaining, title: 'Block Chaining: Tamper-Proof', badge: 'STAGE 5 \u2014 SECURITY' },
}

export default function DetailPanel() {
  const { currentStage } = useRandomness()
  const bodyRef = useRef(null)
  const stage = STAGE_MAP[currentStage]
  const StageComponent = stage.component

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [currentStage])

  return (
    <div className="detail-col">
      <div className="detail-panel">
        <div className="detail-header">
          <h2>{stage.title}</h2>
          <span className="dh-badge">{stage.badge}</span>
        </div>
        <div className="detail-body" ref={bodyRef}>
          <StageComponent />
        </div>
      </div>
    </div>
  )
}
