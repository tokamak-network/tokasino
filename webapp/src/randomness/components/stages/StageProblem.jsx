import { useRandomness } from '../../context/RandomnessContext.jsx'
import { sh } from '../../lib/helpers.js'
import TimelineComparison from '../features/TimelineComparison.jsx'

export default function StageProblem() {
  const { traced } = useRandomness()

  return (
    <>
      <div className="d-section">
        <div className="d-label">핵심 문제</div>
        <div className="d-text">
          블록체인은 <span className="key">결정적(deterministic)</span> 시스템입니다.
          모든 노드가 같은 입력에 대해 같은 결과를 내야 합니다.
          그런데 <span className="key">"랜덤"은 본질적으로 비결정적</span>이에요.
          이 모순을 어떻게 해결할까요?
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">기존 접근법의 문제</div>
        <div className="d-comparison">
          <div className="d-comp-box bad">
            <div className="d-comp-title">block.timestamp / blockhash</div>
            <div className="d-comp-text">
              채굴자/시퀀서가 값을 조작할 수 있음.
              MEV 공격에 취약. 카지노에서는 치명적.
            </div>
          </div>
          <div className="d-comp-box bad">
            <div className="d-comp-title">Chainlink VRF (외부 오라클)</div>
            <div className="d-comp-text">
              2블록 대기 필요 (commit-reveal).
              LINK 토큰 비용. 외부 의존성.
              즉시 결과가 필요한 게임에 부적합.
            </div>
          </div>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">Chainlink VRF vs Enshrined VRF 타임라인</div>
        <TimelineComparison />
      </div>

      <div className="d-section">
        <div className="d-label">Enshrined VRF의 해결책</div>
        <div className="d-comparison">
          <div className="d-comp-box good" style={{ gridColumn: '1 / -1' }}>
            <div className="d-comp-title">VRF를 합의 레이어에 내장</div>
            <div className="d-comp-text">
              시퀀서가 매 블록마다 BLS12-381 VRF로 난수를 생성합니다.<br />
              <span style={{ color: 'var(--neon)' }}>결정적</span> (같은 입력 = 같은 출력) +{' '}
              <span style={{ color: 'var(--neon)' }}>예측 불가</span> (비밀키 없이는 모름) +{' '}
              <span style={{ color: 'var(--neon)' }}>검증 가능</span> (공개키로 확인)<br /><br />
              결과: <strong>한 트랜잭션으로 즉시 결과 확정</strong>. 대기 시간 0. 외부 의존성 0. 추가 비용 0.
            </div>
          </div>
        </div>
      </div>

      {traced.blockNumber && (
        <div className="d-section">
          <div className="d-label">지금 추적 중인 블록</div>
          <div className="d-text">
            이 페이지에서는 <span className="key">Block #{traced.blockNumber}</span>의 난수가
            파이프라인의 각 단계를 어떻게 통과하는지 실제 값으로 추적합니다.
            왼쪽 각 Stage를 클릭해서 따라가 보세요.
          </div>
          <div className="d-live">
            <div className="d-live-cell">
              <div className="d-live-label">추적 블록</div>
              <div className="d-live-val">#{traced.blockNumber}</div>
            </div>
            <div className="d-live-cell">
              <div className="d-live-label">prevrandao</div>
              <div className="d-live-val sm">{sh(traced.prevrandao, 8)}</div>
            </div>
            <div className="d-live-cell">
              <div className="d-live-label">주사위 결과</div>
              <div className="d-live-val">{traced.diceResult || '--'}</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
