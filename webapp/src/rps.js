// RPS CHAIN — On-chain Rock Paper Scissors with Roulette Multiplier
// Flow: click hand → instant result → win? roulette spins → done

import {
  getBlockNumber, isConnected, subscribeAccount, getBalance,
  formatEther, getAppKit
} from './appkit.js'

// ===== STATE =====
let playing = false
let soundEnabled = false
let gameCount = 0
let winCount = 0

const HANDS = ['\u270A', '\u270C\uFE0F', '\uD83D\uDD90']
const STEP = 0.01
const MIN_BET = 0.001
const MAX_BET = 1

// ===== DOM REFS =====
const $ = id => document.getElementById(id)
const opponentHand = $('opponentHand')
const opponentSprite = $('opponentSprite')
const vsText = $('vsText')
const handPicker = $('handPicker')
const handBtns = handPicker.querySelectorAll('.hand-btn')
const betAmount = $('betAmount')
const playBtn = $('playBtn')
const errorMsg = $('errorMsg')
const rouletteContainer = $('rouletteContainer')
const wheelCanvas = $('wheelCanvas')
const wheelPointer = $('wheelPointer')
const wheelCtx = wheelCanvas.getContext('2d')
const payoutDisplay = $('payoutDisplay')
const payoutAmount = $('payoutAmount')
const payoutLabel = $('payoutLabel')
const jackpotOverlay = $('jackpotOverlay')
const historyBody = $('historyBody')
const balanceValue = $('balanceValue')
const soundBtn = $('soundBtn')
const toastContainer = $('toastContainer')
const tickerTrack = $('tickerTrack')

// ===== AUDIO (8-bit Web Audio API) =====
const AudioCtx = window.AudioContext || window.webkitAudioContext
let audioCtx = null

function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioCtx()
  return audioCtx
}

function playTone(freq, duration, type = 'square', volume = 0.15) {
  if (!soundEnabled) return
  const ctx = ensureAudio()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

function sfxSelect()  { playTone(800, 0.05) }
function sfxWin()     { playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 100); setTimeout(() => playTone(784, 0.15), 200); setTimeout(() => playTone(1047, 0.2, 'square', 0.2), 350) }
function sfxLose()    { playTone(400, 0.15); setTimeout(() => playTone(350, 0.15), 150); setTimeout(() => playTone(300, 0.2), 300) }
function sfxDraw()    { playTone(440, 0.2) }
function sfxTick()    { playTone(1200, 0.02, 'sine', 0.08) }
function sfxDing()    { playTone(1500, 0.2, 'sine', 0.25) }
function sfxJackpot() {
  for (let i = 0; i < 8; i++) {
    setTimeout(() => playTone(400 + i * 100, 0.15, 'square', 0.2), i * 100)
  }
  setTimeout(() => playTone(1600, 0.4, 'square', 0.3), 800)
}

// ===== SOUND TOGGLE =====
soundBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled
  soundBtn.textContent = soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07'
  if (soundEnabled) { ensureAudio(); playTone(440, 0.05) }
})

// ===== WALLET =====
getAppKit()
subscribeAccount(({ isConnected: conn }) => { if (conn) updateBalance(); updateUI() })

async function updateBalance() {
  if (!isConnected()) return
  try {
    const bal = await getBalance()
    balanceValue.textContent = Number(bal).toFixed(4)
  } catch {}
}

// ===== CLIENT-SIDE RANDOM (demo / offline mode) =====
function localPlay(playerHand) {
  const houseHand = Math.floor(Math.random() * 3)
  let outcome
  if (playerHand === houseHand) {
    outcome = 0 // draw
  } else if ((playerHand + 1) % 3 === houseHand) {
    outcome = 2 // lose
  } else {
    outcome = 1 // win
  }

  let multiplier = 0
  if (outcome === 1) {
    const roll = Math.random() * 100
    if (roll < 40) multiplier = 1
    else if (roll < 70) multiplier = 2
    else if (roll < 88) multiplier = 4
    else if (roll < 97) multiplier = 7
    else multiplier = 20
  }

  return { houseHand, outcome, multiplier }
}

// ===== HAND CLICK → PLAY IMMEDIATELY =====
handBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (playing) return
    const hand = parseInt(btn.dataset.hand)
    sfxSelect()
    playRound(hand, btn)
  })
})

async function playRound(playerHand, clickedBtn) {
  playing = true

  // Highlight selected, dim others
  handBtns.forEach(b => {
    b.classList.remove('selected', 'dimmed')
    if (b !== clickedBtn) b.classList.add('dimmed')
  })
  clickedBtn.classList.add('selected')
  setHandsDisabled(true)
  hideBetControls()

  // Instant result from local random
  const result = localPlay(playerHand)
  gameCount++

  // Show opponent hand immediately
  opponentHand.style.display = 'none'
  opponentSprite.textContent = HANDS[result.houseHand]
  opponentSprite.className = 'opponent-sprite show'

  // Show result immediately
  if (result.outcome === 1) {
    winCount++
    sfxWin()
    vsText.textContent = 'WIN!'
    vsText.className = 'vs-text win'

    // Roulette after a brief moment
    await sleep(400)
    await spinRoulette(result.multiplier)

    playBtn.textContent = 'PLAY AGAIN'
    playBtn.className = 'play-btn primary ready'
    playBtn.disabled = false
    playBtn.style.display = ''
  } else if (result.outcome === 2) {
    sfxLose()
    vsText.textContent = 'LOSE'
    vsText.className = 'vs-text lose'

    playBtn.textContent = 'RETRY'
    playBtn.className = 'play-btn primary ready'
    playBtn.disabled = false
    playBtn.style.display = ''
  } else {
    sfxDraw()
    vsText.textContent = 'DRAW'
    vsText.className = 'vs-text draw'

    playBtn.textContent = 'RETRY'
    playBtn.className = 'play-btn primary ready'
    playBtn.disabled = false
    playBtn.style.display = ''
  }

  addHistory(playerHand, result.houseHand, result.outcome, result.multiplier)
  addTickerItem(result.outcome, result.multiplier)
}

// ===== PLAY AGAIN / RETRY button =====
playBtn.addEventListener('click', () => {
  resetToIdle()
})

// ===== BET CONTROLS =====
function getBet() { return parseFloat(betAmount.value) || 0.01 }
function setBet(v) {
  v = Math.max(MIN_BET, Math.min(MAX_BET, v))
  betAmount.value = v.toFixed(v < 0.01 ? 3 : 2)
}

$('betMinus').addEventListener('click', () => setBet(getBet() - STEP))
$('betPlus').addEventListener('click', () => setBet(getBet() + STEP))
$('betX2').addEventListener('click', () => setBet(getBet() * 2))
$('betMax').addEventListener('click', () => setBet(MAX_BET))

function longPress(el, fn) {
  let timer
  el.addEventListener('mousedown', () => { timer = setInterval(fn, 200) })
  el.addEventListener('mouseup', () => clearInterval(timer))
  el.addEventListener('mouseleave', () => clearInterval(timer))
}
longPress($('betMinus'), () => setBet(getBet() - STEP))
longPress($('betPlus'), () => setBet(getBet() + STEP))

function hideBetControls() {
  betAmount.disabled = true
  $('betMinus').disabled = true
  $('betPlus').disabled = true
  $('betX2').disabled = true
  $('betMax').disabled = true
}
function showBetControls() {
  betAmount.disabled = false
  $('betMinus').disabled = false
  $('betPlus').disabled = false
  $('betX2').disabled = false
  $('betMax').disabled = false
}

// ===== UI HELPERS =====
function setHandsDisabled(disabled) {
  handBtns.forEach(btn => btn.classList.toggle('disabled', disabled))
}

function updateUI() {
  // Show/hide bet controls based on wallet connection
  const betRow = $('betControls')
  if (isConnected()) {
    betRow.style.display = ''
  } else {
    betRow.style.display = 'none'
  }
}

// ===== ROULETTE WHEEL =====
// 20 sectors on the wheel, distributed to look varied
const WHEEL_SECTORS = [
  1, 2, 1, 4, 1, 2, 1, 7, 1, 2,
  1, 2, 1, 4, 1, 2, 20, 2, 4, 7
]
const SECTOR_COUNT = WHEEL_SECTORS.length
const SECTOR_ANGLE = (2 * Math.PI) / SECTOR_COUNT

const SECTOR_COLORS = {
  1:  { bg: '#1A1A3E', fg: '#7A7A9E' },
  2:  { bg: '#1A2A3E', fg: '#00F0FF' },
  4:  { bg: '#2A1A3E', fg: '#B026FF' },
  7:  { bg: '#3A1A2E', fg: '#FF2E97' },
  20: { bg: '#3A2A0A', fg: '#FFE600' },
}

function drawWheel(highlightIdx) {
  const W = wheelCanvas.width
  const cx = W / 2
  const cy = W / 2
  const r = W / 2 - 4

  wheelCtx.clearRect(0, 0, W, W)

  for (let i = 0; i < SECTOR_COUNT; i++) {
    const mult = WHEEL_SECTORS[i]
    const startAngle = i * SECTOR_ANGLE - Math.PI / 2
    const endAngle = startAngle + SECTOR_ANGLE
    const colors = SECTOR_COLORS[mult]

    // Sector
    wheelCtx.beginPath()
    wheelCtx.moveTo(cx, cy)
    wheelCtx.arc(cx, cy, r, startAngle, endAngle)
    wheelCtx.closePath()
    wheelCtx.fillStyle = (highlightIdx === i) ? colors.fg : colors.bg
    wheelCtx.fill()

    // Border
    wheelCtx.strokeStyle = 'rgba(0,240,255,0.15)'
    wheelCtx.lineWidth = 1
    wheelCtx.stroke()

    // Text
    wheelCtx.save()
    wheelCtx.translate(cx, cy)
    wheelCtx.rotate(startAngle + SECTOR_ANGLE / 2)
    wheelCtx.textAlign = 'center'
    wheelCtx.textBaseline = 'middle'
    wheelCtx.font = mult === 20 ? 'bold 22px "Press Start 2P"' : '18px "Press Start 2P"'
    wheelCtx.fillStyle = (highlightIdx === i) ? colors.bg : colors.fg
    // Glow for ×20
    if (mult === 20 && highlightIdx !== i) {
      wheelCtx.shadowColor = colors.fg
      wheelCtx.shadowBlur = 12
    }
    wheelCtx.fillText(`\xD7${mult}`, r * 0.65, 0)
    wheelCtx.shadowBlur = 0
    wheelCtx.restore()
  }

  // Center circle
  wheelCtx.beginPath()
  wheelCtx.arc(cx, cy, 30, 0, 2 * Math.PI)
  wheelCtx.fillStyle = '#0A0A1A'
  wheelCtx.fill()
  wheelCtx.strokeStyle = 'rgba(0,240,255,0.3)'
  wheelCtx.lineWidth = 2
  wheelCtx.stroke()

  // Outer ring glow
  wheelCtx.beginPath()
  wheelCtx.arc(cx, cy, r, 0, 2 * Math.PI)
  wheelCtx.strokeStyle = 'rgba(0,240,255,0.3)'
  wheelCtx.lineWidth = 3
  wheelCtx.stroke()
}

function findSectorIndex(targetMult) {
  const indices = []
  for (let i = 0; i < SECTOR_COUNT; i++) {
    if (WHEEL_SECTORS[i] === targetMult) indices.push(i)
  }
  return indices[Math.floor(Math.random() * indices.length)]
}

async function spinRoulette(targetMult) {
  rouletteContainer.classList.add('show')
  wheelCanvas.style.transition = 'none'
  wheelCanvas.style.transform = 'none'

  const targetIdx = findSectorIndex(targetMult)

  // Rapid random highlight cycle, then slow down and land on target
  const totalSteps = 30
  let current = Math.floor(Math.random() * SECTOR_COUNT)

  for (let step = 0; step < totalSteps; step++) {
    // Speed: fast at start, slow at end
    const delay = 40 + Math.pow(step / totalSteps, 2) * 250

    // On the last step, land on the target sector
    if (step === totalSteps - 1) {
      current = targetIdx
    } else {
      // Random jump (avoid staying on same sector)
      let next = current
      while (next === current) next = Math.floor(Math.random() * SECTOR_COUNT)
      current = next
    }

    drawWheel(current)
    sfxTick()
    await sleep(delay)
  }

  // Final highlight
  sfxDing()
  drawWheel(targetIdx)
  wheelPointer.classList.add('bounce')
  setTimeout(() => wheelPointer.classList.remove('bounce'), 1000)

  // Effects
  if (targetMult === 20) {
    await showJackpot()
  } else if (targetMult >= 4) {
    spawnCoinParticles(targetMult >= 7 ? 15 : 5)
  }

  payoutDisplay.classList.add('show')
  payoutLabel.textContent = `\xD7${targetMult} MULTIPLIER`
  payoutAmount.textContent = `\xD7${targetMult}`

  vsText.textContent = `\xD7${targetMult}`
  vsText.className = 'vs-text win'
}

// ===== JACKPOT =====
async function showJackpot() {
  sfxJackpot()
  const flash = document.createElement('div')
  flash.className = 'jackpot-flash'
  document.body.appendChild(flash)
  setTimeout(() => flash.remove(), 200)

  jackpotOverlay.classList.add('show')
  spawnCoinParticles(40)
  await sleep(2500)
  jackpotOverlay.classList.remove('show')
}

function spawnCoinParticles(count) {
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div')
    coin.className = 'coin-particle'
    coin.textContent = '\uD83E\uDE99'
    coin.style.left = Math.random() * 100 + 'vw'
    coin.style.top = -20 + 'px'
    coin.style.animationDuration = (1.5 + Math.random() * 1) + 's'
    coin.style.animationDelay = Math.random() * 0.5 + 's'
    document.body.appendChild(coin)
    setTimeout(() => coin.remove(), 3000)
  }
}

// ===== HISTORY =====
function addHistory(playerH, houseH, outcome, multiplier) {
  const outcomeText = outcome === 1 ? 'WIN' : outcome === 2 ? 'LOSE' : 'DRAW'
  const outcomeClass = outcome === 1 ? 'tag-win' : outcome === 2 ? 'tag-lose' : 'tag-draw'

  const row = document.createElement('tr')
  row.innerHTML = `
    <td>${gameCount}</td>
    <td>${HANDS[playerH]}</td>
    <td>${HANDS[houseH]}</td>
    <td class="${outcomeClass}">${outcomeText}</td>
    <td>${outcome === 1 ? '\xD7' + multiplier : '\u2014'}</td>
    <td class="${outcomeClass}">${outcome === 1 ? '\xD7' + multiplier : outcomeText}</td>
  `
  historyBody.insertBefore(row, historyBody.firstChild)
}

// ===== TICKER =====
function addTickerItem(outcome, multiplier) {
  let text, cls
  if (outcome === 1) {
    text = `WIN \u2192 \uD83C\uDFB0 \xD7${multiplier}`
    cls = multiplier >= 20 ? 'ticker-item jackpot' : 'ticker-item win'
  } else if (outcome === 2) {
    text = `\uD83D\uDC80 LOSE`
    cls = 'ticker-item lose'
  } else {
    text = `\uD83E\uDD1D DRAW`
    cls = 'ticker-item'
  }

  const span = document.createElement('span')
  span.className = cls
  span.textContent = text
  tickerTrack.appendChild(span)
}

// ===== TOAST =====
function showToast(message, type = 'info') {
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.innerHTML = `
    <div class="bar"></div>
    <span style="padding-left:8px;">${message}</span>
    <button class="close-btn" onclick="this.parentElement.remove()">\xD7</button>
  `
  toastContainer.appendChild(toast)
  const timeout = type === 'error' ? 5000 : 3000
  setTimeout(() => { if (toast.parentNode) toast.remove() }, timeout)
  while (toastContainer.children.length > 3) toastContainer.removeChild(toastContainer.firstChild)
}

// ===== RESET =====
function resetToIdle() {
  playing = false
  handBtns.forEach(b => b.classList.remove('selected', 'dimmed', 'disabled'))
  opponentHand.textContent = '?'
  opponentHand.style.display = ''
  opponentHand.style.animation = ''
  opponentHand.className = 'opponent-hand pulsing'
  opponentSprite.className = 'opponent-sprite'
  vsText.textContent = 'VS'
  vsText.className = 'vs-text pulsing'
  rouletteContainer.classList.remove('show')
  payoutDisplay.classList.remove('show')
  jackpotOverlay.classList.remove('show')
  playBtn.style.display = 'none'
  errorMsg.style.display = 'none'
  showBetControls()
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return
  if (e.key === '1' || e.key === 'r' || e.key === 'R') handBtns[0].click()
  if (e.key === '2' || e.key === 's' || e.key === 'S') handBtns[1].click()
  if (e.key === '3' || e.key === 'p' || e.key === 'P') handBtns[2].click()
  if (e.key === 'Enter') playBtn.click()
  if (e.key === 'Escape') resetToIdle()
})

// ===== POLLING =====
async function poll() {
  try {
    await getBlockNumber()
    if (isConnected()) updateBalance()
  } catch {}
}
poll()
setInterval(poll, 5000)

// ===== UTILS =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ===== INIT =====
playBtn.style.display = 'none'
updateUI()
