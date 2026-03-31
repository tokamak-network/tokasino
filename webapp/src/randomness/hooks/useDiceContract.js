import { useState, useCallback } from 'react'
import { JsonRpcProvider, solidityPackedKeccak256, keccak256 } from 'ethers'
import { getWriteContract, getReadContract, parseEther, isConnected, RPC_URL } from '../lib/provider.js'
import { formatPrevrandao } from '../lib/helpers.js'

const provider = new JsonRpcProvider(RPC_URL)

export function useDiceContract() {
  const [playing, setPlaying] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [error, setError] = useState(null)

  const play = useCallback(async (chosenNumber, betEth = '0.01') => {
    if (!isConnected()) {
      setError('Wallet not connected')
      return null
    }

    setPlaying(true)
    setError(null)

    try {
      const contract = await getWriteContract('dice')
      const tx = await contract.play(chosenNumber, { value: parseEther(betEth) })
      const receipt = await tx.wait()

      // Parse GamePlayed event
      const readContract = getReadContract('dice')
      let gameEvent = null
      for (const log of receipt.logs) {
        try {
          const parsed = readContract.interface.parseLog({ topics: log.topics, data: log.data })
          if (parsed?.name === 'GamePlayed') {
            gameEvent = parsed.args
            break
          }
        } catch {}
      }

      if (!gameEvent) {
        setError('Could not parse game event')
        return null
      }

      // Load the block to trace the randomness pipeline
      const block = await provider.getBlock(receipt.blockNumber)
      const prevrandao = formatPrevrandao(block?.prevrandao)

      const result = {
        gameId: Number(gameEvent.gameId),
        chosenNumber: Number(gameEvent.chosenNumber),
        rolledNumber: Number(gameEvent.rolledNumber),
        won: gameEvent.won,
        payout: gameEvent.payout,
        randomSeed: gameEvent.randomSeed,
        block: {
          number: receipt.blockNumber,
          parentHash: block?.parentHash,
          prevrandao,
          hash: block?.hash,
        },
      }

      setLastResult(result)
      return result
    } catch (e) {
      if (e.code !== 'ACTION_REJECTED' && e.code !== 4001) {
        setError(e.shortMessage || e.message)
      }
      return null
    } finally {
      setPlaying(false)
    }
  }, [])

  return { play, playing, lastResult, error, setError }
}
