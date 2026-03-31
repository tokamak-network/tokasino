// Tokasino Game Hub — polls block number and card stats

import { getReadContract, getBlockNumber, getAppKit, formatEther } from './appkit.js'
import { CHAIN_ID } from './config.js'

const $ = (id) => document.getElementById(id)

async function pollStatus() {
  try {
    const blockNum = await getBlockNumber()
    $('blockNum').textContent = blockNum
    $('chainId').textContent = CHAIN_ID
    $('dotStatus').className = 'dot live'
  } catch {
    $('dotStatus').className = 'dot dead'
  }
}

async function pollCardStats() {
  const games = [
    { key: 'dice', name: 'dice', method: 'totalGames' },
    { key: 'coinflip', name: 'coinFlip', method: 'totalGames' },
    { key: 'roulette', name: 'roulette', method: 'totalGames' },
    { key: 'lottery', name: 'lottery', method: 'currentRoundId' },
  ]

  for (const g of games) {
    try {
      const contract = getReadContract(g.name)
      const house = await contract.houseBalance()
      $(g.key + '-house').textContent = Number(formatEther(house)).toFixed(1)
    } catch {}
    try {
      const contract = getReadContract(g.name)
      const total = await contract[g.method]()
      $(g.key + '-games').textContent = total.toString()
    } catch {}
  }
}

async function poll() {
  await pollStatus()
  await pollCardStats()
}

// Initialize AppKit (triggers side effects, registers <appkit-button>)
getAppKit()

poll()
setInterval(poll, 3000)
