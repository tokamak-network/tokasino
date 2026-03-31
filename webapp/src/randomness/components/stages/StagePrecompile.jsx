import { useRandomness } from '../../context/RandomnessContext.jsx'
import { sh } from '../../lib/helpers.js'
import { usePrecompileCall } from '../../hooks/usePrecompileCall.js'

export default function StagePrecompile() {
  const { traced } = useRandomness()
  const { results, loading, callMultiple, reset } = usePrecompileCall()

  const handleCall = () => {
    reset()
    callMultiple(traced.prevrandao, 3)
  }

  return (
    <>
      <div className="d-section">
        <div className="d-label">왜 프리컴파일이 필요한가?</div>
        <div className="d-text">
          prevrandao <span className="key">{sh(traced.prevrandao, 6)}</span>는 이 블록에서 고정값입니다.
          만약 3개의 게임이 같은 블록에서 실행되면, 셋 다 같은 난수를 보게 됩니다.
          프리컴파일 0x0b는 <span className="key">매 호출마다 다른 난수</span>를 만들어서 이 문제를 해결합니다.
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">실제 프리컴파일 0x0b 호출</div>
        <div className="d-text" style={{ marginBottom: '0.4rem' }}>
          아래 버튼을 누르면 실제로 주소 <span className="key">0x0b</span>에 eth_call을 보내
          반환된 난수를 확인합니다.
        </div>
        <button
          className="precompile-call-btn"
          onClick={handleCall}
          disabled={loading || !traced.prevrandao}
        >
          {loading ? 'Calling...' : 'Call 0x0b x3'}
        </button>
        {results.length > 0 && (
          <div className="d-flow" style={{ marginTop: '0.4rem' }}>
            {results.map((r, i) => (
              <div key={i}>
                <span className="hl">Call #{i + 1}</span>{' '}
                <span className="arr">&rarr;</span>{' '}
                <span className="val">{sh(r, 12)}</span>
                <br />
              </div>
            ))}
            <br />
            <span className="hl">
              {results.length > 1 && results[0] !== results[1]
                ? 'All values are different — each call gets unique randomness!'
                : 'Same seed, same simulated call context — values may match in eth_call mode.'}
            </span>
          </div>
        )}
      </div>

      <div className="d-section">
        <div className="d-label">Block #{traced.blockNumber}에서 3번 호출한다면? (내부 동작)</div>
        <div className="d-flow">
          seed = prevrandao = <span className="val">{sh(traced.prevrandao, 10)}</span><br /><br />
          <span className="hl">1번째 호출 (counter = 0)</span><br />
          &nbsp;&nbsp;mixed = keccak256(<span className="val">{sh(traced.prevrandao, 6)}</span> + <span className="hl">0x00...00</span>)<br />
          &nbsp;&nbsp;ChaCha20(mixed) &rarr; <span className="val">unique 32-byte output</span><br /><br />
          <span className="hl">2번째 호출 (counter = 1)</span><br />
          &nbsp;&nbsp;mixed = keccak256(<span className="val">{sh(traced.prevrandao, 6)}</span> + <span className="hl">0x00...01</span>)<br />
          &nbsp;&nbsp;ChaCha20(mixed) &rarr; <span className="val">different 32-byte output</span><br /><br />
          <span className="hl">3번째 호출 (counter = 2)</span><br />
          &nbsp;&nbsp;mixed = keccak256(<span className="val">{sh(traced.prevrandao, 6)}</span> + <span className="hl">0x00...02</span>)<br />
          &nbsp;&nbsp;ChaCha20(mixed) &rarr; <span className="val">another 32-byte output</span><br /><br />
          같은 seed인데 counter만 다르니까 <span className="hl">3개 모두 완전히 다른 난수!</span>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">Rust 코드 (실제 값 대입)</div>
        <div className="d-code">
          <span className="kw">fn</span> <span className="fn">randomness_precompile</span>(input: &amp;[u8]) {'{\n'}
          {'    '}<span className="kw">let</span> seed = <span className="str">{sh(traced.prevrandao, 8)}</span>;  <span className="cm">// prevrandao</span>{'\n'}
          {'\n'}
          {'    '}<span className="kw">let</span> counter = COUNTER.<span className="fn">fetch_add</span>(<span className="num">1</span>);  <span className="cm">// 0, 1, 2, ...</span>{'\n'}
          {'    '}<span className="kw">let</span> mixed = <span className="fn">keccak256</span>(seed || counter);{'\n'}
          {'\n'}
          {'    '}<span className="kw">let</span> rng = <span className="ty">ChaCha20</span>::<span className="fn">from_seed</span>(mixed);{'\n'}
          {'    '}rng.<span className="fn">fill_bytes</span>(&amp;mut output);  <span className="cm">// 32바이트 반환, gas=100</span>{'\n'}
          {'}'}
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">keccak256 + ChaCha20 이중 구조</div>
        <div className="d-point"><span className="bullet">1.</span><span className="pt-text"><span className="key">keccak256</span> — seed와 counter를 섞어 고유한 값 생성</span></div>
        <div className="d-point"><span className="bullet">2.</span><span className="pt-text"><span className="key">ChaCha20</span> — 그 해시를 시드로 암호학적 난수 생성 (입력↔출력 관계 차단)</span></div>
        <div className="d-point"><span className="bullet">&rarr;</span><span className="pt-text">입력을 알아도 최종 출력 예측 불가 = <span className="key">이중 자물쇠</span></span></div>
      </div>
    </>
  )
}
