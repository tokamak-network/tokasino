import { useRandomness } from '../../context/RandomnessContext.jsx'
import { sh, full } from '../../lib/helpers.js'

export default function StagePrevrandao() {
  const { traced } = useRandomness()

  return (
    <>
      <div className="d-section">
        <div className="d-label">Block #{traced.blockNumber}의 prevrandao</div>
        <div className="d-text">
          Stage 1에서 만든 VRF 출력이 이 블록의 <span className="key">prevrandao</span> 필드에 기록되었습니다.
        </div>
        <div className="d-live">
          <div className="d-live-cell">
            <div className="d-live-label">Block</div>
            <div className="d-live-val">#{traced.blockNumber}</div>
          </div>
          <div className="d-live-cell">
            <div className="d-live-label">Parent Hash (입력)</div>
            <div className="d-live-val sm">{sh(traced.parentHash, 8)}</div>
          </div>
          <div className="d-live-cell">
            <div className="d-live-label">prevrandao (출력)</div>
            <div className="d-live-val sm">{sh(traced.prevrandao, 8)}</div>
          </div>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">전달 경로 (실제 값)</div>
        <div className="d-flow">
          <span className="label">1. CL 계산</span> VRF(<span className="val">{sh(traced.parentHash, 6)}</span> || <span className="val">{traced.blockNumber}</span>)<br />
          <span className="label"></span> = <span className="hl">{sh(traced.prevrandao, 10)}</span><br />
          <span className="arr">&darr;</span><br />
          <span className="label">2. Engine API</span> forkchoiceUpdatedV3({'{'}<br />
          <span className="label"></span> &nbsp;&nbsp;prevRandao: <span className="val">{sh(traced.prevrandao, 10)}</span><br />
          <span className="label"></span> {'}'})<br />
          <span className="arr">&darr;</span><br />
          <span className="label">3. EL 기록</span> block.header.prevrandao = <span className="val">{sh(traced.prevrandao, 10)}</span><br />
          <span className="arr">&darr;</span><br />
          <span className="label">4. Solidity</span> block.prevrandao == <span className="hl">{sh(traced.prevrandao, 10)}</span>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">prevrandao의 전체 값 (32바이트 = 256비트)</div>
        <div className="d-flow" style={{ wordBreak: 'break-all' }}>
          <span className="val">{full(traced.prevrandao)}</span>
        </div>
        <div className="d-text" style={{ marginTop: '0.3rem' }}>
          이 256비트 값이 이 블록의 <span className="key">모든 난수의 근원</span>입니다.
          같은 블록의 모든 트랜잭션이 이 값을 봅니다.
          Stage 3(프리컴파일)과 Stage 4(컨트랙트)에서 이 값을 가공하여 각 게임마다 다른 난수를 만들어요.
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">핵심 성질</div>
        <div className="d-point"><span className="bullet">&bull;</span><span className="pt-text"><span className="key">블록당 하나</span> — 같은 블록의 모든 TX가 같은 값을 봄</span></div>
        <div className="d-point"><span className="bullet">&bull;</span><span className="pt-text"><span className="key">사전 예측 불가</span> — Block #{(traced.blockNumber || 1) - 1}이 확정되기 전까지 이 값을 아무도 모름</span></div>
        <div className="d-point"><span className="bullet">&bull;</span><span className="pt-text"><span className="key">시퀀서도 조작 불가</span> — VRF는 결정적 함수. 다른 값을 내면 BLS 증명이 실패</span></div>
      </div>
    </>
  )
}
