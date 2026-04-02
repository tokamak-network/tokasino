import { useState, useEffect, useRef } from 'react'

const TOTAL_DURATION = 4000 // ms for full animation

export default function TimelineComparison() {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const rafRef = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    if (!playing) return
    startRef.current = performance.now()

    const animate = (now) => {
      const elapsed = now - startRef.current
      const p = Math.min(elapsed / TOTAL_DURATION, 1)
      setProgress(p)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setPlaying(false)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing])

  const handlePlay = () => {
    setProgress(0)
    setPlaying(true)
  }

  // Chainlink: request at 0%, wait 0-66%, callback at 66%, result at 66%+
  const clRequestDone = progress >= 0.05
  const clWaiting = progress >= 0.05 && progress < 0.66
  const clCallbackDone = progress >= 0.66
  const clResultDone = progress >= 0.75

  // Enshrined VRF: instant at ~10%
  const tkDone = progress >= 0.15

  return (
    <div className="timeline-comparison">
      <div className="tl-row">
        <div className="tl-label">
          <span style={{ color: 'var(--hot)' }}>Chainlink VRF</span>
        </div>
        <div className="tl-track">
          <div className="tl-bar" style={{ width: `${Math.min(progress / 0.75, 1) * 100}%`, background: 'var(--hot)' }} />
          <div className={`tl-marker ${clRequestDone ? 'done' : ''}`} style={{ left: '5%' }}>
            <div className="tl-marker-dot" style={{ background: clRequestDone ? 'var(--hot)' : 'var(--border)' }} />
            <div className="tl-marker-label">TX 요청</div>
          </div>
          <div className={`tl-marker ${clCallbackDone ? 'done' : ''}`} style={{ left: '45%' }}>
            <div className="tl-marker-dot" style={{ background: clWaiting ? 'var(--gold)' : clCallbackDone ? 'var(--hot)' : 'var(--border)' }}>
              {clWaiting && <span className="tl-waiting-pulse" />}
            </div>
            <div className="tl-marker-label">{clWaiting ? '2블록 대기...' : 'Block N+2'}</div>
          </div>
          <div className={`tl-marker ${clResultDone ? 'done' : ''}`} style={{ left: '85%' }}>
            <div className="tl-marker-dot" style={{ background: clResultDone ? 'var(--hot)' : 'var(--border)' }} />
            <div className="tl-marker-label">{clResultDone ? 'Callback 결과' : '결과?'}</div>
          </div>
        </div>
        <div className="tl-time" style={{ color: clResultDone ? 'var(--hot)' : 'var(--muted)' }}>
          {clResultDone ? '~24s' : '...'}
        </div>
      </div>

      <div className="tl-row">
        <div className="tl-label">
          <span style={{ color: 'var(--neon)' }}>Enshrined VRF</span>
        </div>
        <div className="tl-track">
          <div className="tl-bar" style={{ width: tkDone ? '20%' : `${(progress / 0.15) * 20}%`, background: 'var(--neon)' }} />
          <div className={`tl-marker ${tkDone ? 'done' : ''}`} style={{ left: '5%' }}>
            <div className="tl-marker-dot" style={{ background: progress > 0.02 ? 'var(--neon)' : 'var(--border)' }} />
            <div className="tl-marker-label">TX 전송</div>
          </div>
          <div className={`tl-marker ${tkDone ? 'done' : ''}`} style={{ left: '18%' }}>
            <div className="tl-marker-dot" style={{ background: tkDone ? 'var(--neon)' : 'var(--border)' }} />
            <div className="tl-marker-label">{tkDone ? 'Instant!' : '...'}</div>
          </div>
        </div>
        <div className="tl-time" style={{ color: tkDone ? 'var(--neon)' : 'var(--muted)' }}>
          {tkDone ? '~0s' : '...'}
        </div>
      </div>

      <button className="tl-play-btn" onClick={handlePlay} disabled={playing}>
        {playing ? 'Playing...' : 'Compare Timeline'}
      </button>
    </div>
  )
}
