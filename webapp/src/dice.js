// Enshrined VRF — Instant Dice (Reown AppKit + ethers.js)

import {
  getReadContract, getWriteContract, getBlockNumber, getAddress,
  isConnected, subscribeAccount, getBalance, shortAddr, parseEther, formatEther
} from './appkit.js'
import { CHAIN_ID } from './config.js'

const DICE_EMOJI = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685']

let selectedDice = null
let myWins = 0
let myGames = 0
let statsInterval = null

// --- DOM refs ---
const $dot = document.getElementById('dotStatus')
const $blockNum = document.getElementById('blockNum')
const $chainId = document.getElementById('chainId')
const $balance = document.getElementById('balance')
const $house = document.getElementById('houseBalance')
const $totalGames = document.getElementById('totalGames')
const $winRate = document.getElementById('winRate')
const $betAmount = document.getElementById('betAmount')
const $playBtn = document.getElementById('playBtn')
const $historyList = document.getElementById('historyList')
const $overlay = document.getElementById('resultOverlay')
const $resultCard = document.getElementById('resultCard')

// --- Dice selection ---
function selectDice(num) {
  selectedDice = num
  document.querySelectorAll('.dice-btn').forEach(b => b.classList.remove('selected'))
  document.querySelector('[data-num="' + num + '"]').classList.add('selected')
}

document.getElementById('dicePicker').addEventListener('click', (e) => {
  const btn = e.target.closest('.dice-btn')
  if (btn) selectDice(parseInt(btn.dataset.num))
})

// --- Bet presets ---
document.querySelectorAll('.bet-preset').forEach(b => {
  b.addEventListener('click', () => { $betAmount.value = b.dataset.bet })
})

// --- Wallet connection state ---
function updatePlayButton() {
  if (isConnected()) {
    $playBtn.style.display = ''
  } else {
    $playBtn.style.display = 'none'
  }
}

subscribeAccount(({ isConnected: connected }) => {
  updatePlayButton()
  if (connected) {
    updateStats()
  }
})

// --- Play button ---
$playBtn.addEventListener('click', playGame)

async function playGame() {
  if (!selectedDice) { alert('Pick a number first!'); return }

  const betEth = $betAmount.value

  $playBtn.disabled = true
  $playBtn.textContent = 'ROLLING...'

  try {
    const contract = await getWriteContract('dice')
    const tx = await contract.play(selectedDice, { value: parseEther(betEth) })

    $playBtn.textContent = 'CONFIRMING...'
    const receipt = await tx.wait()

    // Parse GamePlayed event from receipt logs
    const readContract = getReadContract('dice')
    let found = false
    for (const log of receipt.logs) {
      try {
        const parsed = readContract.interface.parseLog({ topics: log.topics, data: log.data })
        if (parsed && parsed.name === 'GamePlayed') {
          const { chosenNumber, rolledNumber, betAmount, payout, won, randomSeed } = parsed.args

          myGames++
          if (won) myWins++

          showResult(
            Number(chosenNumber),
            Number(rolledNumber),
            won,
            betAmount,
            payout,
            randomSeed
          )
          addHistory(Number(chosenNumber), Number(rolledNumber), won, payout)
          updateStats()
          found = true
          break
        }
      } catch (e) { /* not our event */ }
    }

    if (!found) {
      alert('Transaction confirmed but no GamePlayed event found.')
    }
  } catch (e) {
    console.error(e)
    // 4001 = user rejected, ACTION_REJECTED = ethers v6
    if (e.code !== 4001 && e.code !== 'ACTION_REJECTED') {
      alert('Error: ' + (e.shortMessage || e.message || e))
    }
  }

  $playBtn.disabled = false
  $playBtn.textContent = 'ROLL DICE'
}

// --- Result overlay ---
function showResult(chosen, rolled, won, bet, payout, seed) {
  $resultCard.className = 'result-card ' + (won ? 'win' : 'lose')
  document.getElementById('resultEmoji').textContent = won ? '\uD83C\uDF89' : DICE_EMOJI[rolled]

  const $title = document.getElementById('resultTitle')
  $title.textContent = won ? 'YOU WIN!' : 'YOU LOSE'
  $title.className = 'result-title ' + (won ? 'win' : 'lose')

  document.getElementById('resultPayout').textContent =
    won ? '+' + formatEther(payout) + ' ETH' : ''

  document.getElementById('resultDetail').innerHTML =
    'You picked ' + DICE_EMOJI[chosen] + ' <b>' + chosen + '</b> \u2014 Rolled ' +
    DICE_EMOJI[rolled] + ' <b>' + rolled + '</b><br>' +
    'Bet: ' + formatEther(bet) + ' ETH' +
    (won ? ' \u2192 Payout: ' + formatEther(payout) + ' ETH (5x)' : '')

  document.getElementById('resultSeed').textContent = 'VRF Seed: ' + seed

  $overlay.classList.add('show')
}

function closeResult(e) {
  if (e && e.target !== e.currentTarget && !e.target.closest('.result-close')) return
  $overlay.classList.remove('show')
}

$overlay.addEventListener('click', closeResult)
document.getElementById('resultClose').addEventListener('click', () => $overlay.classList.remove('show'))

// --- History ---
function addHistory(chosen, rolled, won, payout) {
  const item = document.createElement('div')
  item.className = 'history-item'
  const betVal = parseFloat($betAmount.value).toFixed(3)
  item.innerHTML =
    '<span class="num">#' + myGames + '</span>' +
    '<span>' + DICE_EMOJI[rolled] + '</span>' +
    '<span>Picked ' + chosen + ', Rolled ' + rolled + '</span>' +
    '<span>' + (won ? '+' + formatEther(payout) : '-' + betVal) + '</span>' +
    '<span class="result-tag ' + (won ? 'win' : 'lose') + '">' + (won ? 'WIN' : 'LOSE') + '</span>'
  $historyList.insertBefore(item, $historyList.firstChild)
}

// --- Stats polling ---
async function updateStats() {
  try {
    const block = await getBlockNumber()
    $blockNum.textContent = block
    $chainId.textContent = CHAIN_ID

    if (isConnected()) {
      const bal = await getBalance()
      $balance.textContent = parseFloat(bal).toFixed(3)
    }

    const readContract = getReadContract('dice')
    const house = await readContract.houseBalance()
    $house.textContent = parseFloat(formatEther(house)).toFixed(1)

    const total = await readContract.totalGames()
    $totalGames.textContent = Number(total)

    $winRate.textContent = myGames > 0 ? Math.round(myWins / myGames * 100) + '%' : '\u2014'
  } catch (e) { /* silent */ }
}

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return
  const n = parseInt(e.key)
  if (n >= 1 && n <= 6) selectDice(n)
  if (e.key === 'Enter' && isConnected()) playGame()
})

// --- Init ---
;(async () => {
  try {
    $dot.className = 'dot live'
    updatePlayButton()
    updateStats()
    statsInterval = setInterval(updateStats, 3000)
  } catch (e) {
    $dot.className = 'dot dead'
  }
})()
