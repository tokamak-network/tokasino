// RPS CHAIN — Liquidity Pool Dashboard
// Users deposit ETH to become the "house" and earn from the house edge.

import { isConnected, subscribeAccount, getBalance, getAppKit } from './appkit.js'

// ===== DEMO STATE (simulated pool) =====
let pool = {
  tvl: 12.5,
  utilization: 23,
  yield24h: 0.42,
  games24h: 1234,
  houseProfit24h: 0.85,
}

let myPosition = {
  deposited: 0,
  lpTokens: 0,
  depositTime: null,
}

const activityLog = [
  { time: '2m ago',  type: 'loss',     amount: '+0.05 ETH',  addr: '0x1a2b...3c4d', cls: 'type-loss' },
  { time: '5m ago',  type: 'payout',   amount: '-0.12 ETH',  addr: '0x5e6f...7a8b', cls: 'type-payout' },
  { time: '8m ago',  type: 'deposit',  amount: '+1.00 ETH',  addr: '0x9c0d...1e2f', cls: 'type-deposit' },
  { time: '12m ago', type: 'loss',     amount: '+0.03 ETH',  addr: '0x3a4b...5c6d', cls: 'type-loss' },
  { time: '15m ago', type: 'withdraw', amount: '-0.50 ETH',  addr: '0x7e8f...9a0b', cls: 'type-withdraw' },
  { time: '18m ago', type: 'loss',     amount: '+0.08 ETH',  addr: '0x1c2d...3e4f', cls: 'type-loss' },
  { time: '22m ago', type: 'payout',   amount: '-0.20 ETH',  addr: '0x5a6b...7c8d', cls: 'type-payout' },
  { time: '30m ago', type: 'deposit',  amount: '+2.00 ETH',  addr: '0x9e0f...1a2b', cls: 'type-deposit' },
  { time: '35m ago', type: 'loss',     amount: '+0.01 ETH',  addr: '0x3c4d...5e6f', cls: 'type-loss' },
  { time: '41m ago', type: 'loss',     amount: '+0.04 ETH',  addr: '0x7a8b...9c0d', cls: 'type-loss' },
]

const TYPE_LABELS = {
  deposit:  '\u25B2 Deposit',
  withdraw: '\u25BC Withdraw',
  payout:   '\u2605 Payout',
  loss:     '\u25CF Player Loss',
}

// ===== DOM =====
const $ = id => document.getElementById(id)
const toastContainer = $('toastContainer')

// ===== INIT WALLET =====
getAppKit()
subscribeAccount(() => updateUI())

// ===== TABS =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const tab = btn.dataset.tab
    $('depositTab').style.display = tab === 'deposit' ? '' : 'none'
    $('withdrawTab').style.display = tab === 'withdraw' ? '' : 'none'
  })
})

// ===== DEPOSIT =====
const depositInput = $('depositAmount')
const depositBtn = $('depositBtn')

depositInput.addEventListener('input', updateDepositPreview)

$('depositMax').addEventListener('click', () => {
  depositInput.value = '1.00'
  updateDepositPreview()
})

function updateDepositPreview() {
  const amount = parseFloat(depositInput.value) || 0
  const lpRate = pool.tvl > 0 ? 100 / pool.tvl : 100
  const lp = amount * lpRate
  const shareAfter = pool.tvl > 0 ? (amount / (pool.tvl + amount)) * 100 + (myPosition.deposited / (pool.tvl + amount)) * 100 : 100
  $('depositLpOut').textContent = `~${lp.toFixed(2)} LP`
  $('depositShareAfter').textContent = `~${shareAfter.toFixed(2)}%`
}

depositBtn.addEventListener('click', () => {
  const amount = parseFloat(depositInput.value) || 0
  if (amount <= 0) return

  const lpRate = pool.tvl > 0 ? 100 / pool.tvl : 100
  const lp = amount * lpRate

  myPosition.deposited += amount
  myPosition.lpTokens += lp
  myPosition.depositTime = new Date()
  pool.tvl += amount

  addActivity('deposit', `+${amount.toFixed(2)} ETH`)
  showToast(`Deposited ${amount.toFixed(2)} ETH \u2192 ${lp.toFixed(2)} LP tokens`)
  updateUI()
  depositInput.value = '0.1'
  updateDepositPreview()
})

// ===== WITHDRAW =====
const withdrawInput = $('withdrawAmount')
const withdrawBtn = $('withdrawBtn')

$('withdrawMax').addEventListener('click', () => {
  withdrawInput.value = myPosition.lpTokens.toFixed(2)
  updateWithdrawPreview()
})

document.querySelectorAll('.pct-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pct-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const pct = parseInt(btn.dataset.pct)
    withdrawInput.value = (myPosition.lpTokens * pct / 100).toFixed(2)
    updateWithdrawPreview()
  })
})

withdrawInput.addEventListener('input', updateWithdrawPreview)

function updateWithdrawPreview() {
  const lp = parseFloat(withdrawInput.value) || 0
  const ethRate = myPosition.lpTokens > 0 ? currentValue() / myPosition.lpTokens : 0
  const ethOut = lp * ethRate
  $('withdrawEthOut').textContent = `~${ethOut.toFixed(4)} ETH`
}

withdrawBtn.addEventListener('click', () => {
  const lp = parseFloat(withdrawInput.value) || 0
  if (lp <= 0 || lp > myPosition.lpTokens) return

  const ethRate = myPosition.lpTokens > 0 ? currentValue() / myPosition.lpTokens : 0
  const ethOut = lp * ethRate

  const ratio = lp / myPosition.lpTokens
  myPosition.deposited -= myPosition.deposited * ratio
  myPosition.lpTokens -= lp
  pool.tvl -= ethOut

  if (myPosition.lpTokens < 0.001) {
    myPosition.deposited = 0
    myPosition.lpTokens = 0
    myPosition.depositTime = null
  }

  addActivity('withdraw', `-${ethOut.toFixed(2)} ETH`)
  showToast(`Withdrew ${ethOut.toFixed(4)} ETH`)
  updateUI()
  withdrawInput.value = '0'
  updateWithdrawPreview()
})

// ===== CURRENT VALUE (simulated growth) =====
function currentValue() {
  if (myPosition.deposited === 0) return 0
  // Simulate ~0.5% growth per session
  return myPosition.deposited * 1.005
}

function earnings() {
  return currentValue() - myPosition.deposited
}

function poolShare() {
  if (pool.tvl === 0) return 0
  return (currentValue() / pool.tvl) * 100
}

// ===== UPDATE UI =====
function updateUI() {
  // Pool stats
  $('tvl').textContent = pool.tvl.toFixed(2)
  $('utilPct').textContent = pool.utilization + '%'
  $('utilBar').style.width = pool.utilization + '%'
  $('yieldPct').textContent = '+' + pool.yield24h.toFixed(2) + '%'
  $('gamesToday').textContent = pool.games24h.toLocaleString()
  $('houseProfit').textContent = '+' + pool.houseProfit24h.toFixed(2)

  // My position
  $('myDeposit').textContent = myPosition.deposited.toFixed(2) + ' ETH'
  $('myValue').textContent = currentValue().toFixed(4) + ' ETH'
  const earn = earnings()
  $('myEarnings').textContent = (earn >= 0 ? '+' : '') + earn.toFixed(4) + ' ETH'
  $('myEarnings').style.color = earn >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)'
  $('myShare').textContent = poolShare().toFixed(2) + '%'

  updateDepositPreview()
  updateWithdrawPreview()
}

// ===== ACTIVITY LOG =====
function renderActivity() {
  const body = $('activityBody')
  body.innerHTML = ''
  for (const entry of activityLog) {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${entry.time}</td>
      <td class="${entry.cls}">${TYPE_LABELS[entry.type]}</td>
      <td>${entry.amount}</td>
      <td style="color:var(--text-muted)">${entry.addr}</td>
    `
    body.appendChild(row)
  }
}

function addActivity(type, amount) {
  const addr = 'You'
  const cls = 'type-' + type
  activityLog.unshift({ time: 'Just now', type, amount, addr, cls })
  if (activityLog.length > 20) activityLog.pop()
  renderActivity()
}

// ===== TOAST =====
function showToast(message) {
  const toast = document.createElement('div')
  toast.className = 'toast success'
  toast.innerHTML = `<div class="bar"></div><span style="padding-left:8px;">${message}</span>`
  toastContainer.appendChild(toast)
  setTimeout(() => { if (toast.parentNode) toast.remove() }, 3000)
}

// ===== SIMULATED LIVE ACTIVITY =====
function simulateActivity() {
  const types = ['loss', 'loss', 'loss', 'payout', 'loss']
  const type = types[Math.floor(Math.random() * types.length)]
  const amount = (Math.random() * 0.15 + 0.01).toFixed(2)
  const sign = type === 'payout' ? '-' : '+'
  const hex = '0123456789abcdef'
  const addr = '0x' + Array.from({length: 4}, () => hex[Math.floor(Math.random() * 16)]).join('') + '...' + Array.from({length: 4}, () => hex[Math.floor(Math.random() * 16)]).join('')

  activityLog.unshift({
    time: 'Just now',
    type,
    amount: `${sign}${amount} ETH`,
    addr,
    cls: 'type-' + type,
  })
  if (activityLog.length > 20) activityLog.pop()

  // Update pool stats slightly
  if (type === 'loss') {
    pool.tvl += parseFloat(amount)
    pool.houseProfit24h += parseFloat(amount)
  } else {
    pool.tvl -= parseFloat(amount)
    pool.houseProfit24h -= parseFloat(amount)
  }
  pool.games24h++
  pool.utilization = Math.min(95, Math.max(5, pool.utilization + (Math.random() - 0.45) * 3))
  pool.yield24h = Math.max(0, pool.yield24h + (Math.random() - 0.4) * 0.05)

  renderActivity()
  updateUI()
}

// ===== INIT =====
renderActivity()
updateUI()

// Live simulation every 8-15 seconds
setInterval(simulateActivity, 8000 + Math.random() * 7000)
