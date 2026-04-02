// Enshrined VRF — Coin Flip game module (Reown AppKit + ethers.js)

import {
  getReadContract, getWriteContract, getBlockNumber, getAddress,
  isConnected, subscribeAccount, getBalance, parseEther, formatEther
} from './appkit.js'

// --- State ---
let selectedSide = null // 'heads' or 'tails'
let myWins = 0
let myGames = 0
let flipping = false

// --- DOM refs ---
const $ = id => document.getElementById(id)

const btnHeads    = $('btnHeads')
const btnTails    = $('btnTails')
const betInput    = $('betAmount')
const playBtn     = $('playBtn')
const dotStatus   = $('dotStatus')
const connStatus  = $('connStatus')
const blockNum    = $('blockNum')
const balanceEl   = $('balance')
const houseEl     = $('houseBalance')
const totalEl     = $('totalGames')
const winRateEl   = $('winRate')
const historyList = $('historyList')
const overlay     = $('resultOverlay')
const resultCard  = $('resultCard')
const resultEmoji = $('resultEmoji')
const resultTitle = $('resultTitle')
const resultPayout= $('resultPayout')
const resultDetail= $('resultDetail')
const resultSeed  = $('resultSeed')
const resultClose = $('resultClose')

// --- Side selection ---
function selectSide(side) {
  selectedSide = side
  btnHeads.classList.toggle('selected', side === 'heads')
  btnTails.classList.toggle('selected', side === 'tails')
}

btnHeads.addEventListener('click', () => selectSide('heads'))
btnTails.addEventListener('click', () => selectSide('tails'))

// --- Bet presets ---
document.querySelectorAll('.bet-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    betInput.value = btn.dataset.bet
  })
})

// --- Play button visibility based on wallet connection ---
function updateConnectionUI(connected) {
  if (connected) {
    playBtn.style.display = ''
    dotStatus.className = 'dot live'
    const addr = getAddress()
    connStatus.textContent = addr ? shortAddr(addr) : 'Connected'
  } else {
    playBtn.style.display = 'none'
    dotStatus.className = 'dot dead'
    connStatus.textContent = 'Disconnected'
  }
}

function shortAddr(addr) {
  if (!addr) return '\u2014'
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

subscribeAccount(({ isConnected: connected }) => {
  updateConnectionUI(connected)
  if (connected) updateStats()
})

// Initial state
updateConnectionUI(isConnected())

// --- Game logic ---
async function playGame() {
  if (flipping) return
  if (!selectedSide) {
    alert('Pick HEADS or TAILS first!')
    return
  }
  if (!isConnected()) {
    alert('Connect your wallet first!')
    return
  }

  const betEth = betInput.value
  const chosenHeads = selectedSide === 'heads'

  flipping = true
  playBtn.disabled = true
  playBtn.textContent = 'FLIPPING...'

  try {
    const contract = await getWriteContract('coinFlip')
    const tx = await contract.flip(chosenHeads, { value: parseEther(betEth) })

    playBtn.textContent = 'CONFIRMING...'
    const receipt = await tx.wait()

    // Parse GamePlayed event from logs
    const iface = getReadContract('coinFlip').interface
    let found = false

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data })
        if (parsed.name === 'GamePlayed') {
          const { chosenHeads: evChosen, resultHeads: evResult, betAmount: evBet, payout: evPayout, won: evWon, randomSeed: evSeed } = parsed.args

          myGames++
          if (evWon) myWins++

          showResult(evChosen, evResult, evWon, evBet, evPayout, evSeed)
          addHistory(evChosen, evResult, evWon, evBet, evPayout)
          updateStats()
          found = true
          break
        }
      } catch (e) {
        // Not our event, skip
      }
    }

    if (!found) {
      alert('Transaction confirmed but could not parse game result.')
    }
  } catch (e) {
    console.error('Flip error:', e)
    // Don't alert on user rejection
    if (e.code !== 'ACTION_REJECTED' && e.code !== 4001) {
      alert('Error: ' + (e.shortMessage || e.message || e))
    }
  }

  flipping = false
  playBtn.disabled = false
  playBtn.textContent = 'FLIP'
}

playBtn.addEventListener('click', playGame)

// --- Result display ---
function sideLabel(isHeads) { return isHeads ? 'HEADS' : 'TAILS' }

function showResult(chosen, result, won, bet, payout, seed) {
  resultCard.className = 'result-card ' + (won ? 'win' : 'lose')

  resultEmoji.textContent = won ? '\uD83C\uDF89' : '\uD83E\uDE99'
  resultEmoji.classList.remove('flipping')
  void resultEmoji.offsetWidth // trigger reflow
  resultEmoji.classList.add('flipping')

  resultTitle.textContent = won ? 'YOU WIN!' : 'YOU LOSE'
  resultTitle.className = 'result-title ' + (won ? 'win' : 'lose')

  const betEth = formatEther(bet)
  const payEth = formatEther(payout)

  resultPayout.textContent = won ? '+' + Number(payEth).toFixed(4) + ' ETH' : ''

  resultDetail.innerHTML =
    `You picked <b>${sideLabel(chosen)}</b> — Result: <b>${sideLabel(result)}</b><br>` +
    `Bet: ${Number(betEth).toFixed(4)} ETH` +
    (won ? ` \u2192 Payout: ${Number(payEth).toFixed(4)} ETH (1.95x)` : '')

  resultSeed.textContent = 'VRF Seed: ' + seed

  overlay.classList.add('show')
}

function closeResult(e) {
  if (e && e.target !== e.currentTarget) return
  overlay.classList.remove('show')
}

overlay.addEventListener('click', closeResult)
resultClose.addEventListener('click', () => overlay.classList.remove('show'))

// --- History ---
function addHistory(chosen, result, won, bet, payout) {
  const betEth = Number(formatEther(bet)).toFixed(3)
  const payEth = Number(formatEther(payout)).toFixed(3)

  const item = document.createElement('div')
  item.className = 'history-item'
  item.innerHTML = `
    <span class="num">#${myGames}</span>
    <span>\uD83E\uDE99</span>
    <span>${sideLabel(chosen)} \u2192 ${sideLabel(result)}</span>
    <span>${won ? '+' + payEth : '-' + betEth}</span>
    <span class="result-tag ${won ? 'win' : 'lose'}">${won ? 'WIN' : 'LOSE'}</span>
  `
  historyList.insertBefore(item, historyList.firstChild)
}

// --- Stats polling ---
async function updateStats() {
  try {
    const block = await getBlockNumber()
    blockNum.textContent = block

    if (isConnected()) {
      const bal = await getBalance()
      balanceEl.textContent = Number(bal).toFixed(3)
    }

    const readContract = getReadContract('coinFlip')
    const [house, total] = await Promise.all([
      readContract.houseBalance(),
      readContract.totalGames(),
    ])

    houseEl.textContent = Number(formatEther(house)).toFixed(1)
    totalEl.textContent = Number(total)

    winRateEl.textContent = myGames > 0
      ? Math.round(myWins / myGames * 100) + '%'
      : '\u2014'

    // Mark chain as live
    dotStatus.className = 'dot live'
    if (!isConnected()) {
      connStatus.textContent = 'Chain Live'
    }
  } catch (e) {
    console.error('Stats error:', e)
  }
}

// --- Keyboard shortcuts ---
document.addEventListener('keydown', e => {
  // Skip if typing in input
  if (e.target.tagName === 'INPUT') return

  if (e.key === 'h' || e.key === 'H') selectSide('heads')
  if (e.key === 't' || e.key === 'T') selectSide('tails')
  if (e.key === 'Enter' && isConnected()) playGame()
})

// --- Init ---
updateStats()
setInterval(updateStats, 3000)
