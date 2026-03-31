import { useRandomness } from '../../context/RandomnessContext.jsx'
import { sh, full } from '../../lib/helpers.js'
import VerificationDemo from '../features/VerificationDemo.jsx'

export default function StageChaining() {
  const { traced, recentBlocks } = useRandomness()

  return (
    <>
      <div className="d-section">
        <div className="d-label">최근 블록의 체이닝 (실제 값)</div>
        <div className="d-text">
          각 블록의 <span className="key">hash</span>가 다음 블록의 <span className="key">VRF input</span>이 됩니다.
          Block #{traced.blockNumber}(초록 테두리)이 추적 중인 블록입니다.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, margin: '0.5rem 0' }}>
          {recentBlocks.map((b, i) => {
            const isTraced = b.number === traced.blockNumber
            return (
              <div key={b.number}>
                <div style={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
                  padding: '0.4rem 0.5rem', fontFamily: 'var(--mono)', fontSize: '0.48rem', lineHeight: 1.6,
                  ...(isTraced ? { borderColor: 'var(--neon)', background: 'rgba(0,255,136,0.03)' } : {}),
                }}>
                  <span style={{ color: 'var(--neon)', fontWeight: 700 }}>Block #{b.number}</span>
                  {isTraced && <span style={{ color: 'var(--gold)', fontSize: '0.4rem', marginLeft: '0.3rem' }}>TRACED</span>}
                  <br />
                  <span style={{ color: 'var(--muted)' }}>parent:</span>{' '}
                  <span style={{ color: 'var(--blue)' }}>{sh(b.parentHash, 8)}</span><br />
                  <span style={{ color: 'var(--muted)' }}>randao:</span>{' '}
                  <span style={{ color: 'var(--gold)' }}>{sh(b.prevrandao, 8)}</span><br />
                  <span style={{ color: 'var(--muted)' }}>hash: &nbsp;</span>{' '}
                  <span style={{ color: 'var(--text)' }}>{sh(b.hash, 8)}</span>
                </div>
                {i < recentBlocks.length - 1 && (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '0.7rem', padding: '0.1rem 0' }}>
                    &darr; hash가 다음 블록의 VRF 입력
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">연결 관계</div>
        <div className="d-flow">
          Block #{(traced.blockNumber || 1) - 1}의 hash = <span className="val">{sh(traced.parentHash, 10)}</span><br />
          <span className="arr">&darr; 이 값이 Block #{traced.blockNumber}의 VRF 입력에 포함</span><br />
          VRF(<span className="val">{sh(traced.parentHash, 6)}</span> || <span className="val">{traced.blockNumber}</span>) = <span className="hl">{sh(traced.prevrandao, 10)}</span><br />
          <span className="arr">&darr; 이 prevrandao가 블록에 기록되고</span><br />
          Block #{traced.blockNumber}의 hash = <span className="val">{sh(traced.blockHash, 10)}</span><br />
          <span className="arr">&darr; 이 hash가 Block #{(traced.blockNumber || 0) + 1}의 VRF 입력이 될 것</span>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">공격 시나리오</div>
        <div className="d-comparison">
          <div className="d-comp-box bad">
            <div className="d-comp-title">"Block #{traced.blockNumber}의 난수를 바꾸고 싶다"</div>
            <div className="d-comp-text">
              난수 = VRF({sh(traced.parentHash, 4)} || {traced.blockNumber})<br />
              VRF는 결정적 &rarr; 출력을 바꾸려면 입력을 바꿔야 함<br />
              &rarr; Block #{(traced.blockNumber || 1) - 1}의 hash를 바꿔야 함<br />
              &rarr; 그러려면 Block #{(traced.blockNumber || 1) - 1} 자체를 바꿔야 함<br />
              &rarr; 그러면 그 이전도... &rarr; <span style={{ color: 'var(--hot)' }}>전체 체인 되돌리기 필요!</span>
            </div>
          </div>
          <div className="d-comp-box bad">
            <div className="d-comp-title">"시퀀서가 거짓 값을 제출"</div>
            <div className="d-comp-text">
              VRF 증명(96바이트 BLS 서명)이 함께 생성됨.<br />
              공개키로 검증: VRF({sh(traced.parentHash, 4)} || {traced.blockNumber}) == {sh(traced.prevrandao, 4)}?<br />
              거짓이면 &rarr; <span style={{ color: 'var(--hot)' }}>검증 실패, 즉시 발각!</span>
            </div>
          </div>
        </div>
      </div>

      <div className="d-section">
        <div className="d-comp-box good">
          <div className="d-comp-title">Block #{traced.blockNumber}의 난수 {sh(traced.prevrandao, 6)}은 안전합니다</div>
          <div className="d-comp-text">
            <span style={{ color: 'var(--neon)' }}>결정적</span>: 입력 {sh(traced.parentHash, 4)}||{traced.blockNumber}에 대해 출력이 하나로 결정<br />
            <span style={{ color: 'var(--neon)' }}>예측 불가</span>: Block #{(traced.blockNumber || 1) - 1}이 확정되기 전에는 아무도 모름<br />
            <span style={{ color: 'var(--neon)' }}>검증 가능</span>: BLS 공개키로 증명 검증 가능<br />
            <span style={{ color: 'var(--neon)' }}>체이닝</span>: 이전 블록 해시에 의존 &rarr; 되돌릴 수 없음
          </div>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">블록 검증 데모</div>
        <VerificationDemo />
      </div>
    </>
  )
}
