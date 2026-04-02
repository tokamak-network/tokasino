import { useRandomness } from '../../context/RandomnessContext.jsx'
import { sh, full } from '../../lib/helpers.js'

export default function StageVrf() {
  const { traced } = useRandomness()

  return (
    <>
      <div className="d-section">
        <div className="d-label">VRF란?</div>
        <div className="d-text">
          <span className="key">VRF</span> = Verifiable Random Function (검증 가능한 난수 함수)<br /><br />
          비밀키 소유자만 만들 수 있지만, 공개키로 누구나 진위를 확인할 수 있습니다.
          같은 입력이면 <span className="key">항상 같은 출력</span> — 시퀀서가 마음대로 바꿀 수 없어요.
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">Block #{traced.blockNumber}의 실제 VRF 입력</div>
        <div className="d-flow">
          <span className="label">parent_hash</span> <span className="val">{full(traced.parentHash)}</span><br />
          <span className="label">block_number</span> <span className="val">{traced.blockNumber}</span><br />
          <span className="arr">─────────────────────────────────────</span><br />
          <span className="label">VRF input</span>{' '}
          <span className="hl">parent_hash({traced.parentHash ? Math.floor(traced.parentHash.length / 2) - 1 : 32}bytes) || block_number(8bytes)</span>
        </div>
        <div className="d-text" style={{ marginTop: '0.3rem' }}>
          <span className="key">parent_hash</span>는 Block #{(traced.blockNumber || 1) - 1}의 해시입니다.
          이전 블록이 확정되어야 다음 블록의 난수 입력이 결정되므로, <span className="key">미래의 난수를 미리 알 수 없습니다</span>.
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">BLS12-381 서명 과정</div>
        <div className="d-code">
          <span className="cm">// 시퀀서가 실행하는 Rust 코드 (vrf.rs)</span>{'\n'}
          <span className="kw">const</span> DST = <span className="str">"ENSHRINED-VRF-V1"</span>;{'\n\n'}
          input = <span className="str">{sh(traced.parentHash, 6)}</span> || <span className="num">{traced.blockNumber}</span>{'\n\n'}
          signature = BLS.<span className="fn">sign</span>(secret_key, input, DST){'\n'}
          <span className="cm">// signature = 96바이트 BLS 서명</span>{'\n'}
          <span className="cm">// 이것이 VRF "증명(proof)" — 공개키로 검증 가능</span>{'\n\n'}
          output = <span className="fn">keccak256</span>(signature){'\n'}
          <span className="cm">// output = <span style={{ color: 'var(--gold)' }}>{sh(traced.prevrandao, 10)}</span></span>{'\n'}
          <span className="cm">// 이 32바이트가 블록의 prevrandao가 됩니다!</span>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">이 단계의 핵심</div>
        <div className="d-point"><span className="bullet">&bull;</span><span className="pt-text">입력: <span className="key">{sh(traced.parentHash, 6)} || {traced.blockNumber}</span></span></div>
        <div className="d-point"><span className="bullet">&bull;</span><span className="pt-text">출력: <span className="key">{sh(traced.prevrandao, 6)}</span> (이 값이 다음 Stage로 전달)</span></div>
        <div className="d-point"><span className="bullet">&bull;</span><span className="pt-text">비밀키 없이는 이 출력을 <span className="key">예측 불가능</span></span></div>
        <div className="d-point"><span className="bullet">&bull;</span><span className="pt-text">공개키로 <span className="key">검증 가능</span> — 시퀀서가 거짓 값을 내면 즉시 발각</span></div>
      </div>
    </>
  )
}
