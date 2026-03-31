import { useState } from 'react'
import { useVerifyBlock } from '../../hooks/useVerifyBlock.js'
import { sh, full } from '../../lib/helpers.js'
import { useRandomness } from '../../context/RandomnessContext.jsx'

export default function VerificationDemo() {
  const { blockNumber } = useRandomness()
  const { verify, verifyResult, loading, error, reset } = useVerifyBlock()
  const [inputBlock, setInputBlock] = useState('')

  const handleVerify = () => {
    const num = parseInt(inputBlock, 10)
    if (isNaN(num) || num < 0) return
    verify(num)
  }

  const handleQuickVerify = () => {
    if (blockNumber) {
      setInputBlock(String(blockNumber))
      verify(blockNumber)
    }
  }

  return (
    <div className="verify-container">
      <div className="d-text" style={{ marginBottom: '0.4rem' }}>
        블록 번호를 입력하면 해당 블록의 prevrandao와 VRF 입력을 확인할 수 있습니다.
      </div>

      <div className="verify-input-row">
        <input
          type="number"
          className="verify-input"
          placeholder="Block number"
          value={inputBlock}
          onChange={e => setInputBlock(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
        />
        <button className="verify-btn" onClick={handleVerify} disabled={loading || !inputBlock}>
          {loading ? 'Loading...' : 'Verify'}
        </button>
        <button className="verify-btn quick" onClick={handleQuickVerify} disabled={loading || !blockNumber}>
          Current
        </button>
      </div>

      {error && (
        <div className="verify-error">{error}</div>
      )}

      {verifyResult && (
        <div className="verify-result">
          <div className="d-live">
            <div className="d-live-cell">
              <div className="d-live-label">Block</div>
              <div className="d-live-val">#{verifyResult.number}</div>
            </div>
            <div className="d-live-cell">
              <div className="d-live-label">Timestamp</div>
              <div className="d-live-val sm">{new Date(verifyResult.timestamp * 1000).toLocaleTimeString()}</div>
            </div>
            <div className="d-live-cell">
              <div className="d-live-label">Dice Result</div>
              <div className="d-live-val">{verifyResult.diceResult || '--'}</div>
            </div>
          </div>

          <div className="d-flow" style={{ marginTop: '0.5rem' }}>
            <span className="label">parentHash</span> <span className="val" style={{ wordBreak: 'break-all' }}>{full(verifyResult.parentHash)}</span><br />
            <span className="label">prevrandao</span> <span className="hl" style={{ wordBreak: 'break-all' }}>{full(verifyResult.prevrandao)}</span><br />
            <span className="label">blockHash</span> <span className="val" style={{ wordBreak: 'break-all' }}>{full(verifyResult.hash)}</span><br />
            <span className="arr">─────────────────────────────</span><br />
            <span className="label">VRF input</span> <span className="hl">{sh(verifyResult.parentHash, 6)} || {verifyResult.number}</span><br />
            <span className="label">VRF output</span> <span className="hl">{sh(verifyResult.prevrandao, 6)}</span>
          </div>

          {verifyResult.parentMatchesVrfInput !== null && (
            <div style={{ marginTop: '0.4rem' }}>
              <div className={`d-comp-box ${verifyResult.parentMatchesVrfInput ? 'good' : 'bad'}`}>
                <div className="d-comp-title">
                  {verifyResult.parentMatchesVrfInput
                    ? 'Parent hash matches previous block — chain integrity verified'
                    : 'WARNING: Parent hash mismatch!'}
                </div>
                <div className="d-comp-text">
                  Block #{verifyResult.number - 1}의 hash가 Block #{verifyResult.number}의 parentHash와{' '}
                  {verifyResult.parentMatchesVrfInput
                    ? <span style={{ color: 'var(--neon)' }}>일치합니다</span>
                    : <span style={{ color: 'var(--hot)' }}>불일치합니다</span>
                  }
                </div>
              </div>
            </div>
          )}

          <div className="d-flow" style={{ marginTop: '0.4rem' }}>
            <span className="label">gameSeed</span> <span className="val" style={{ wordBreak: 'break-all' }}>{full(verifyResult.gameSeed)}</span><br />
            <span className="arr">──── % 6 + 1 ────</span><br />
            <span className="label">dice</span> <span className="hl">{verifyResult.diceResult} {['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'][verifyResult.diceResult] || ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}
