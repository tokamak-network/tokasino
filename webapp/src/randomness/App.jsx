import { useEffect } from 'react'
import { RandomnessProvider, useRandomness, STAGE_ORDER } from './context/RandomnessContext.jsx'
import { useBlockPoller } from './hooks/useBlockPoller.js'
import { useTracedBlock } from './hooks/useTracedBlock.js'
import { useAutoTour } from './hooks/useAutoTour.js'
import TopBar from './components/TopBar.jsx'
import PipelineNav from './components/PipelineNav.jsx'
import DetailPanel from './components/DetailPanel.jsx'

function AppInner() {
  useBlockPoller(3000)
  useTracedBlock()
  useAutoTour()

  const { nextStage, prevStage } = useRandomness()

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        nextStage()
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        prevStage()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [nextStage, prevStage])

  return (
    <div className="container">
      <TopBar />
      <div className="main">
        <PipelineNav />
        <DetailPanel />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <RandomnessProvider>
      <AppInner />
    </RandomnessProvider>
  )
}
