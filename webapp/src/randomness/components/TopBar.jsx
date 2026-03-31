import { useRandomness } from '../context/RandomnessContext.jsx'
import { CHAIN_ID } from '../lib/provider.js'

export default function TopBar() {
  const { blockNumber, isTouring, startTour, stopTour } = useRandomness()

  return (
    <div className="top-bar">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <div className="top-logo">TOKASINO</div>
      </div>
      <div className="top-nav">
        <a href="setup.html">Setup</a>
        <a href="demo.html">Demo</a>
        <a href="randomness.html" className="active">Randomness</a>
        <a href="index.html">Games</a>
        <button
          className="tour-btn"
          onClick={isTouring ? stopTour : startTour}
          title={isTouring ? 'Stop tour' : 'Auto-play tour through all stages'}
        >
          {isTouring ? 'Stop Tour' : 'Auto Tour'}
        </button>
      </div>
      <div className="top-right">
        Block <strong>{blockNumber ?? '\u2014'}</strong> &middot; Chain <strong>{CHAIN_ID}</strong>
      </div>
    </div>
  )
}
