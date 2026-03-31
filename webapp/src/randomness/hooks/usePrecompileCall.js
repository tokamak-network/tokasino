import { useState, useCallback } from 'react'
import { JsonRpcProvider } from 'ethers'
import { RPC_URL } from '../lib/provider.js'

const provider = new JsonRpcProvider(RPC_URL)
const PRECOMPILE_ADDR = '0x000000000000000000000000000000000000000b'

export function usePrecompileCall() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const callPrecompile = useCallback(async (seed) => {
    setLoading(true)
    try {
      // Call the precompile with seed as calldata
      const data = seed || '0x' + '00'.repeat(32)
      const result = await provider.call({ to: PRECOMPILE_ADDR, data })
      setResults(prev => [...prev, result])
      return result
    } catch (e) {
      console.error('Precompile call failed:', e)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const callMultiple = useCallback(async (seed, count = 3) => {
    setLoading(true)
    setResults([])
    try {
      const data = seed || '0x' + '00'.repeat(32)
      const newResults = []
      for (let i = 0; i < count; i++) {
        const result = await provider.call({ to: PRECOMPILE_ADDR, data })
        newResults.push(result)
      }
      setResults(newResults)
      return newResults
    } catch (e) {
      console.error('Precompile calls failed:', e)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => setResults([]), [])

  return { results, loading, callPrecompile, callMultiple, reset }
}
