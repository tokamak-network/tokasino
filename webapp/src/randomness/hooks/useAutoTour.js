import { useEffect, useRef } from 'react'
import { useRandomness, STAGE_ORDER } from '../context/RandomnessContext.jsx'

export function useAutoTour() {
  const { isTouring, tourSpeed, nextStage, setCurrentStage, stopTour } = useRandomness()
  const stageRef = useRef(0)

  useEffect(() => {
    if (!isTouring) {
      stageRef.current = 0
      return
    }

    // Start from the first stage
    setCurrentStage(STAGE_ORDER[0])
    stageRef.current = 0

    const id = setInterval(() => {
      stageRef.current++
      if (stageRef.current >= STAGE_ORDER.length) {
        stopTour()
        return
      }
      setCurrentStage(STAGE_ORDER[stageRef.current])
    }, tourSpeed)

    return () => clearInterval(id)
  }, [isTouring, tourSpeed, setCurrentStage, stopTour])
}
