import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const RandomnessContext = createContext(null)

const STAGE_ORDER = ['problem', 'vrf', 'prevrandao', 'precompile', 'contract', 'chaining']

const INITIAL_TRACED = {
  blockNumber: null,
  parentHash: null,
  prevrandao: null,
  blockHash: null,
  player: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  gameId: 42,
  gameSeed: null,
  diceResult: null,
}

export function RandomnessProvider({ children }) {
  const [currentStage, setCurrentStage] = useState('problem')
  const [traced, setTraced] = useState(INITIAL_TRACED)
  const [recentBlocks, setRecentBlocks] = useState([])
  const [blockNumber, setBlockNumber] = useState(null)
  const [isTouring, setIsTouring] = useState(false)
  const [tourSpeed, setTourSpeed] = useState(8000)
  // For "Try it" dice: store the last played game's trace
  const [diceTrace, setDiceTrace] = useState(null)

  const nextStage = useCallback(() => {
    setCurrentStage(prev => {
      const idx = STAGE_ORDER.indexOf(prev)
      return idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : prev
    })
  }, [])

  const prevStage = useCallback(() => {
    setCurrentStage(prev => {
      const idx = STAGE_ORDER.indexOf(prev)
      return idx > 0 ? STAGE_ORDER[idx - 1] : prev
    })
  }, [])

  const startTour = useCallback(() => setIsTouring(true), [])
  const stopTour = useCallback(() => setIsTouring(false), [])

  const value = useMemo(() => ({
    currentStage, setCurrentStage,
    traced, setTraced,
    recentBlocks, setRecentBlocks,
    blockNumber, setBlockNumber,
    isTouring, setIsTouring, tourSpeed, setTourSpeed,
    startTour, stopTour,
    nextStage, prevStage,
    diceTrace, setDiceTrace,
    STAGE_ORDER,
  }), [currentStage, traced, recentBlocks, blockNumber, isTouring, tourSpeed, diceTrace, nextStage, prevStage, startTour, stopTour])

  return (
    <RandomnessContext.Provider value={value}>
      {children}
    </RandomnessContext.Provider>
  )
}

export function useRandomness() {
  const ctx = useContext(RandomnessContext)
  if (!ctx) throw new Error('useRandomness must be used within RandomnessProvider')
  return ctx
}

export { STAGE_ORDER }
