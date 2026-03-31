import { useEffect, useRef } from 'react'
import { getBlockNumber, CHAIN_ID } from '../lib/provider.js'
import { useRandomness } from '../context/RandomnessContext.jsx'

export function useBlockPoller(interval = 3000) {
  const { setBlockNumber } = useRandomness()
  const chainId = CHAIN_ID

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const num = await getBlockNumber()
        if (active) setBlockNumber(num)
      } catch {}
    }
    poll()
    const id = setInterval(poll, interval)
    return () => { active = false; clearInterval(id) }
  }, [interval, setBlockNumber])

  return chainId
}
