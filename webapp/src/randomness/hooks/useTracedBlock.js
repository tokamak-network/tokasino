import { useEffect } from 'react'
import { JsonRpcProvider, solidityPackedKeccak256, keccak256 } from 'ethers'
import { RPC_URL } from '../lib/provider.js'
import { formatPrevrandao } from '../lib/helpers.js'
import { useRandomness } from '../context/RandomnessContext.jsx'

const provider = new JsonRpcProvider(RPC_URL)

export function useTracedBlock() {
  const { blockNumber, setTraced, setRecentBlocks } = useRandomness()

  useEffect(() => {
    if (blockNumber == null) return
    let active = true

    async function load() {
      const block = await provider.getBlock(blockNumber)
      if (!block || !active) return

      const prevrandao = formatPrevrandao(block.prevrandao)
      const player = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      const gameId = 42

      let gameSeed = null
      let diceResult = null
      if (prevrandao) {
        try {
          gameSeed = solidityPackedKeccak256(
            ['uint256', 'uint256', 'address', 'uint256'],
            [prevrandao, block.number, player, gameId]
          )
          diceResult = Number(BigInt(gameSeed) % 6n) + 1
        } catch {
          gameSeed = keccak256(prevrandao)
          diceResult = Number(BigInt(gameSeed) % 6n) + 1
        }
      }

      if (active) {
        setTraced({
          blockNumber: block.number,
          parentHash: block.parentHash,
          prevrandao,
          blockHash: block.hash,
          player, gameId, gameSeed, diceResult,
        })
      }

      // Load recent blocks for chaining view
      const recent = []
      const start = Math.max(block.number - 4, 0)
      for (let i = start; i <= block.number; i++) {
        const b = await provider.getBlock(i)
        if (b && active) {
          recent.push({
            number: b.number,
            parentHash: b.parentHash,
            hash: b.hash,
            prevrandao: formatPrevrandao(b.prevrandao),
          })
        }
      }
      if (active) setRecentBlocks(recent)
    }

    load()
    return () => { active = false }
  }, [blockNumber, setTraced, setRecentBlocks])
}
