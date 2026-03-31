import { useState } from 'react'
import { useDiceContract } from '../../hooks/useDiceContract.js'
import { useRandomness } from '../../context/RandomnessContext.jsx'
import { isConnected } from '../../lib/provider.js'
import { sh, full } from '../../lib/helpers.js'
import { formatEther } from 'ethers'

const DICE_FACES = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685']

export default function TryItDice() {
  const { play, playing, lastResult, error, setError } = useDiceContract()
  const { setDiceTrace } = useRandomness()
  const [chosen, setChosen] = useState(3)

  const handlePlay = async () => {
    const result = await play(chosen)
    if (result) setDiceTrace(result)
  }

  const connected = isConnected()

  return (
    <div className="tryit-container">
      <div className="d-text" style={{ marginBottom: '0.5rem' }}>
        실제로 주사위 컨트랙트를 호출하고, 결과가 파이프라인 어디에서 왔는지 역추적합니다.
      </div>

      {!connected ? (
        <div className="tryit-notice">
          <span style={{ color: 'var(--gold)' }}>지갑을 연결해야 합니다.</span>
          <br />
          <span style={{ color: 'var(--muted)', fontSize: '0.5rem' }}>
            상단 네비게이션에서 Games 페이지의 Connect Wallet을 먼저 사용하세요.
          </span>
        </div>
      ) : (
        <>
          <div className="tryit-dice-pick">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                className={`tryit-dice-btn${chosen === n ? ' selected' : ''}`}
                onClick={() => setChosen(n)}
                disabled={playing}
              >
                {DICE_FACES[n]} {n}
              </button>
            ))}
          </div>

          <button
            className="tryit-play-btn"
            onClick={handlePlay}
            disabled={playing}
          >
            {playing ? 'Rolling...' : `Roll Dice (bet 0.01 ETH on ${chosen})`}
          </button>
        </>
      )}

      {error && (
        <div className="tryit-error">
          Error: {error}
          <button className="tryit-dismiss" onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {lastResult && (
        <div className={`tryit-result ${lastResult.won ? 'win' : 'lose'}`}>
          <div className="tryit-result-header">
            <span className="tryit-result-emoji">{DICE_FACES[lastResult.rolledNumber]}</span>
            <span className={`tryit-result-title ${lastResult.won ? 'win' : 'lose'}`}>
              {lastResult.won ? 'WIN!' : 'LOSE'}
            </span>
          </div>
          <div className="tryit-result-detail">
            Chose: {lastResult.chosenNumber} | Rolled: {lastResult.rolledNumber}
            {lastResult.won && <> | Payout: {formatEther(lastResult.payout)} ETH</>}
          </div>
          <div className="tryit-trace">
            <div className="d-label">Randomness Trace</div>
            <div className="d-flow">
              <span className="label">Block</span> <span className="val">#{lastResult.block.number}</span><br />
              <span className="label">parentHash</span> <span className="val">{sh(lastResult.block.parentHash, 8)}</span><br />
              <span className="label">prevrandao</span> <span className="val">{sh(lastResult.block.prevrandao, 8)}</span><br />
              <span className="label">randomSeed</span> <span className="hl">{sh(lastResult.randomSeed, 8)}</span><br />
              <span className="arr">──── % 6 + 1 ────</span><br />
              <span className="label">result</span> <span className="hl" style={{ fontSize: '0.7rem' }}>{lastResult.rolledNumber} {DICE_FACES[lastResult.rolledNumber]}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
