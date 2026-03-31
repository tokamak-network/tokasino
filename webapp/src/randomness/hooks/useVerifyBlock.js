import { useState, useCallback } from 'react'
import { JsonRpcProvider, solidityPackedKeccak256, keccak256 } from 'ethers'
import { RPC_URL } from '../lib/provider.js'
import { formatPrevrandao } from '../lib/helpers.js'

const provider = new JsonRpcProvider(RPC_URL)

export function useVerifyBlock() {
  const [verifyResult, setVerifyResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const verify = useCallback(async (blockNum) => {
    setLoading(true)
    setError(null)
    try {
      const block = await provider.getBlock(blockNum)
      if (!block) {
        setError(`Block #${blockNum} not found`)
        setVerifyResult(null)
        return
      }

      const parentBlock = blockNum > 0 ? await provider.getBlock(blockNum - 1) : null
      const prevrandao = formatPrevrandao(block.prevrandao)

      // Derive what gameSeed would be for a default player
      const player = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      let gameSeed = null
      let diceResult = null
      if (prevrandao) {
        try {
          gameSeed = solidityPackedKeccak256(
            ['uint256', 'uint256', 'address', 'uint256'],
            [prevrandao, block.number, player, 0]
          )
          diceResult = Number(BigInt(gameSeed) % 6n) + 1
        } catch {
          gameSeed = keccak256(prevrandao)
          diceResult = Number(BigInt(gameSeed) % 6n) + 1
        }
      }

      setVerifyResult({
        number: block.number,
        parentHash: block.parentHash,
        hash: block.hash,
        prevrandao,
        timestamp: block.timestamp,
        parentBlockHash: parentBlock?.hash || null,
        parentMatchesVrfInput: parentBlock ? parentBlock.hash === block.parentHash : null,
        gameSeed,
        diceResult,
      })
    } catch (e) {
      setError(e.message)
      setVerifyResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setVerifyResult(null)
    setError(null)
  }, [])

  return { verify, verifyResult, loading, error, reset }
}
