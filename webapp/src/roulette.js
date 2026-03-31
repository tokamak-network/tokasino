import {
  getReadContract, getWriteContract, getBlockNumber, getAddress,
  isConnected, subscribeAccount, getBalance, parseEther, formatEther
} from './appkit.js'
import { CHAIN_ID } from './config.js'

// --- Constants ---
const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]
const BET_NAMES = ['Number','Red','Black','Even','Odd','Low 1-18','High 19-36','1st 12','2nd 12','3rd 12']
const BET_MULTIPLIERS = ['35:1','2:1','2:1','2:1','2:1','2:1','2:1','3:1','3:1','3:1']

// Standard roulette table layout: 3 rows, 12 columns
const TABLE_ROWS = [
  [3,6,9,12,15,18,21,24,27,30,33,36],
  [2,5,8,11,14,17,20,23,26,29,32,35],
  [1,4,7,10,13,16,19,22,25,28,31,34],
]

// --- State ---
let currentBetType = -1
let currentBetValue = 0
let wins = 0
let losses = 0
let spinning = false

// --- DOM refs ---
const $ = id => document.getElementById(id)
const dotStatus   = $('dotStatus')
const connStatus  = $('connStatus')
const blockNum    = $('blockNum')
const chainId     = $('chainId')
const balanceEl   = $('balance')
const houseEl     = $('house')
const totalGames  = $('totalGames')
const winLoss     = $('winLoss')
const selectedBet = $('selectedBet')
const betAmount   = $('betAmount')
const spinBtn     = $('spinBtn')
const numberGrid  = $('numberGrid')
const zeroBtn     = $('zeroBtn')
const overlay     = $('resultOverlay')
const resultCard  = $('resultCard')
const resultEmoji = $('resultEmoji')
const resultNum   = $('resultNumber')
const resultTitle = $('resultTitle')
const resultPayout= $('resultPayout')
const resultDetail= $('resultDetail')
const resultSeed  = $('resultSeed')
const resultClose = $('resultClose')
const histSection = $('historySection')
const histList    = $('historyList')

// --- Helpers ---
function isRed(n) { return RED_NUMBERS.includes(n) }

function numColorClass(n) {
  if (n === 0) return 'green'
  return isRed(n) ? 'red' : 'black'
}

function shortAddr(addr) {
  if (!addr) return '\u2014'
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

// --- Build number grid ---
function buildGrid() {
  for (const row of TABLE_ROWS) {
    for (const n of row) {
      const btn = document.createElement('button')
      btn.className = 'num-btn ' + (isRed(n) ? 'red' : 'black')
      btn.textContent = n
      btn.dataset.num = n
      btn.addEventListener('click', () => selectNumber(n))
      numberGrid.appendChild(btn)
    }
  }
}

// --- Selection ---
function clearSelection() {
  document.querySelectorAll('.num-btn.selected, .zero-btn.selected, .out-btn.selected').forEach(
    el => el.classList.remove('selected')
  )
}

function selectNumber(n) {
  clearSelection()
  currentBetType = 0
  currentBetValue = n
  if (n === 0) {
    zeroBtn.classList.add('selected')
  } else {
    document.querySelector(`.num-btn[data-num="${n}"]`).classList.add('selected')
  }
  selectedBet.textContent = `Bet: Number ${n} (35:1)`
}

function selectOutside(betType, label) {
  clearSelection()
  currentBetType = betType
  currentBetValue = 0
  document.querySelectorAll('.out-btn').forEach(b => {
    if (b.dataset.label === label) b.classList.add('selected')
  })
  const mult = BET_MULTIPLIERS[betType]
  selectedBet.textContent = `Bet: ${label} (${mult})`
}

// --- Spin ---
async function handleSpin() {
  if (!isConnected()) return
  if (spinning) return
  if (currentBetType < 0) { alert('Select a bet first!'); return }

  const betEth = betAmount.value
  spinning = true
  spinBtn.disabled = true
  spinBtn.textContent = 'SPINNING...'

  try {
    const contract = await getWriteContract('roulette')
    const tx = await contract.spin(currentBetType, currentBetValue, { value: parseEther(betEth) })
    const receipt = await tx.wait()

    if (!receipt || receipt.status === 0) {
      alert('Transaction failed!')
      spinning = false
      spinBtn.disabled = false
      spinBtn.textContent = 'SPIN'
      return
    }

    parseResult(receipt)
  } catch (e) {
    console.error('Spin failed:', e)
    alert('Spin failed: ' + (e.reason || e.message || e))
  }

  spinning = false
  spinBtn.disabled = false
  spinBtn.textContent = 'SPIN'
}

function parseResult(receipt) {
  const iface = getReadContract('roulette').interface
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data })
      if (parsed.name === 'SpinResult') {
        const { betType, betValue, result, betAmount: betAmt, payout, won, randomSeed } = parsed.args

        if (won) wins++; else losses++
        winLoss.textContent = `${wins}/${losses}`

        showResult(
          Number(result), won, payout, Number(betType),
          Number(betValue), randomSeed, betAmt
        )
        addHistory(
          Number(result), won, payout, Number(betType),
          Number(betValue), betAmt
        )
        return
      }
    } catch (e) { /* not our event */ }
  }
  alert('No SpinResult event found in receipt')
}

function showResult(result, won, payoutWei, betType, betValue, seed, betAmountWei) {
  const color = numColorClass(result)
  const payoutEth = parseFloat(formatEther(payoutWei))
  const betEth = parseFloat(formatEther(betAmountWei))

  resultCard.className = 'result-card ' + (won ? 'win' : 'lose')
  resultEmoji.textContent = won ? '\uD83C\uDF89' : '\uD83D\uDE14'

  resultNum.textContent = result
  resultNum.className = 'result-number rn-' + color

  resultTitle.textContent = won ? 'YOU WIN!' : 'YOU LOSE'
  resultTitle.className = 'result-title ' + (won ? 'win' : 'lose')

  resultPayout.textContent = won
    ? '+' + payoutEth.toFixed(4) + ' ETH'
    : '-' + betEth.toFixed(4) + ' ETH'

  resultDetail.textContent =
    `Bet: ${BET_NAMES[betType]}${betType === 0 ? ' ' + betValue : ''} | Result: ${result} (${color})`

  resultSeed.textContent = 'seed: ' + seed

  overlay.classList.add('show')
}

function closeResult(e) {
  if (e && e.target !== overlay && !e.target.classList.contains('result-close')) return
  overlay.classList.remove('show')
}

function addHistory(result, won, payoutWei, betType, betValue, betAmountWei) {
  histSection.style.display = 'block'
  const color = numColorClass(result)
  const payoutEth = parseFloat(formatEther(payoutWei))
  const betEth = parseFloat(formatEther(betAmountWei))
  const count = histList.children.length + 1

  const item = document.createElement('div')
  item.className = 'history-item'
  item.innerHTML = `
    <span class="num">#${count}</span>
    <span class="history-color hc-${color}">${result}</span>
    <span>${BET_NAMES[betType]}${betType === 0 ? ' ' + betValue : ''}</span>
    <span>${betEth.toFixed(3)} ETH</span>
    <span class="result-tag ${won ? 'win' : 'lose'}">${won ? '+' + payoutEth.toFixed(4) : 'LOSS'}</span>
  `
  histList.prepend(item)
}

// --- Wallet connection state ---
function updateSpinButton() {
  if (isConnected()) {
    spinBtn.style.display = ''
  } else {
    spinBtn.style.display = 'none'
  }
}

// --- Polling ---
async function pollStatus() {
  try {
    const bn = await getBlockNumber()
    blockNum.textContent = bn
    chainId.textContent = CHAIN_ID
    dotStatus.className = 'dot live'
    const addr = getAddress()
    connStatus.textContent = addr ? shortAddr(addr) : 'Connected'
  } catch (e) {
    dotStatus.className = 'dot dead'
    connStatus.textContent = 'Disconnected'
  }
}

async function pollStats() {
  try {
    const contract = getReadContract('roulette')
    const house = await contract.houseBalance()
    houseEl.textContent = parseFloat(formatEther(house)).toFixed(2)
  } catch (e) { /* ignore */ }

  try {
    const contract = getReadContract('roulette')
    const total = await contract.totalGames()
    totalGames.textContent = Number(total)
  } catch (e) { /* ignore */ }

  try {
    const addr = getAddress()
    if (addr) {
      const bal = await getBalance(addr)
      balanceEl.textContent = parseFloat(bal).toFixed(3)
    }
  } catch (e) { /* ignore */ }
}

async function poll() {
  await pollStatus()
  await pollStats()
  updateSpinButton()
}

// --- Event listeners ---
zeroBtn.addEventListener('click', () => selectNumber(0))

document.querySelectorAll('.out-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectOutside(parseInt(btn.dataset.betType), btn.dataset.label)
  })
})

document.querySelectorAll('.bet-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    betAmount.value = btn.dataset.bet
  })
})

spinBtn.addEventListener('click', handleSpin)

overlay.addEventListener('click', closeResult)
resultClose.addEventListener('click', () => overlay.classList.remove('show'))

subscribeAccount(() => updateSpinButton())

// --- Init ---
buildGrid()
poll()
setInterval(poll, 3000)
