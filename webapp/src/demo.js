// Tokasino Demo — real-time VRF pipeline dashboard with computation detail

import {
  getReadProvider, getReadContract,
  getBlockNumber, formatEther,
} from './appkit.js'
import { CHAIN_ID, RPC_URL, contracts, abis } from './config.js'
import { Contract, Wallet, JsonRpcProvider, parseEther } from 'ethers'

const $ = (id) => document.getElementById(id)
const sh = (h, n = 8) => h ? h.slice(0, n + 2) + '...' + h.slice(-n) : '--'

// Hardhat account #0
const DEMO_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const demoProvider = new JsonRpcProvider(RPC_URL)
const demoWallet = new Wallet(DEMO_PK, demoProvider)
const shortAddr = demoWallet.address.slice(0, 6) + '...' + demoWallet.address.slice(-4)
$('demoAccount').textContent = shortAddr

// ─── Pipeline (6 stages) ─────────────────────────────────────────

const STAGES = 6
const pipeIds = Array.from({ length: STAGES }, (_, i) => 'pipe' + i)
const arrowIds = Array.from({ length: STAGES - 1 }, (_, i) => 'arrow' + i)

function clearPipe() {
  pipeIds.forEach((id) => {
    const el = $(id)
    el.classList.remove('active', 'pulse', 'active-gold', 'active-hot')
  })
  arrowIds.forEach((id) => $(id).classList.remove('active'))
}

function activatePipe(idx) {
  $(pipeIds[idx]).classList.add('active')
  if (idx > 0) {
    $(arrowIds[idx - 1]).classList.add('active')
    firePacket(idx - 1)
  }
}

function firePacket(arrowIdx) {
  const arrow = $(arrowIds[arrowIdx])
  const pkt = document.createElement('div')
  pkt.className = 'data-packet'
  arrow.style.position = 'relative'
  arrow.appendChild(pkt)
  setTimeout(() => pkt.remove(), 600)
}

function setPV(id, val, dim = false) {
  const el = $(id)
  el.textContent = val
  el.classList.toggle('dim', dim)
}

// ─── VRF detail panel ─────────────────────────────────────────────

const vrfSteps = ['vrfStep1', 'vrfStep2', 'vrfStep3', 'vrfStep4']
const vrfArrows = ['vrfArrow1', 'vrfArrow2', 'vrfArrow3']

function clearVrfSteps() {
  vrfSteps.forEach((id) => $(id).classList.remove('active'))
  vrfArrows.forEach((id) => $(id).classList.remove('active'))
}

function activateVrfStep(idx, delay = 0) {
  setTimeout(() => {
    $(vrfSteps[idx]).classList.add('active')
    if (idx > 0) $(vrfArrows[idx - 1]).classList.add('active')
  }, delay)
}

function showVrfForBlock(block) {
  if (!block) return
  const num = block.number
  const parentHash = block.parentHash
  const prevrandao = block.prevrandao
    ? '0x' + BigInt(block.prevrandao).toString(16).padStart(64, '0')
    : null

  $('vrfBlockLabel').textContent = 'Block #' + num

  clearVrfSteps()

  // Step 1: Input
  activateVrfStep(0, 0)
  $('vrfInput').textContent = sh(parentHash, 10) + ' || ' + num

  // Step 2: BLS Sign
  activateVrfStep(1, 400)
  setTimeout(() => {
    $('vrfSig').textContent = 'BLS_sign(sk, input, "TOKASINO-VRF-V1") = [96 bytes]'
  }, 400)

  // Step 3: VRF Output = prevrandao
  activateVrfStep(2, 800)
  setTimeout(() => {
    $('vrfOutput').textContent = prevrandao || 'N/A'
  }, 800)

  // Step 4: contract usage (idle until game played)
  setTimeout(() => {
    $('vrfGameSeed').textContent = 'awaiting transaction...'
    $('vrfGameSeed').style.color = 'var(--muted)'
  }, 800)
}

// ─── Block feed ───────────────────────────────────────────────────

const provider = getReadProvider()
let lastBlock = 0
let blockEntries = []
let latestBlockData = null

async function pollBlocks() {
  try {
    const num = await getBlockNumber()
    if (num <= lastBlock) return

    const start = lastBlock === 0 ? Math.max(num - 8, 0) : lastBlock + 1
    for (let n = start; n <= num; n++) {
      const block = await provider.getBlock(n)
      if (!block) continue
      addBlockEntry(block, n === num)
      if (n === num) {
        latestBlockData = block
        if (start > 1) animateNewBlock(block)
        showVrfForBlock(block)
      }
    }

    lastBlock = num
    $('topBlock').textContent = num
    $('topChain').textContent = CHAIN_ID
    $('dotStatus').className = 'dot live'
    $('blockCount').textContent = blockEntries.length + ' blocks'
  } catch {
    $('dotStatus').className = 'dot dead'
  }
}

function addBlockEntry(block, isNew) {
  const num = block.number
  const parentHash = block.parentHash
  const prevrandao = block.prevrandao
    ? '0x' + BigInt(block.prevrandao).toString(16).padStart(64, '0')
    : null

  const feed = $('blockFeed')
  const entry = document.createElement('div')
  entry.className = 'block-entry'
  entry.id = 'block-' + num
  entry.innerHTML = `
    <div class="be-top">
      <span class="be-num">#${num}</span>
      ${isNew ? '<span class="be-new">NEW</span>' : ''}
    </div>
    <div class="be-row"><span class="be-label">parent</span><span class="be-val blue">${sh(parentHash, 12)}</span></div>
    <div class="be-row"><span class="be-label">prevrandao</span><span class="be-val gold">${sh(prevrandao, 12)}</span></div>
  `
  // Click to show VRF detail for this block
  entry.addEventListener('click', () => {
    feed.querySelectorAll('.block-entry').forEach((e) => e.classList.remove('selected'))
    entry.classList.add('selected')
    showVrfForBlock(block)
  })
  feed.prepend(entry)
  blockEntries.push(num)

  if (blockEntries.length > 40) {
    const old = blockEntries.shift()
    document.getElementById('block-' + old)?.remove()
  }

  // Remove previous NEW tags
  feed.querySelectorAll('.be-new').forEach((tag, i) => { if (i > 0) tag.remove() })
}

function animateNewBlock(block) {
  const num = block.number
  const parentHash = block.parentHash
  const prevrandao = block.prevrandao
    ? '0x' + BigInt(block.prevrandao).toString(16).padStart(64, '0')
    : null

  clearPipe()

  // Stage 0: VRF Input
  setTimeout(() => {
    activatePipe(0)
    setPV('pipe0Val', sh(parentHash, 4) + '||' + num)
    $('pipeDetail').innerHTML = `<span class="hl">Block #${num}</span>: input = parent_hash || block_number`
  }, 0)

  // Stage 1: BLS Sign
  setTimeout(() => {
    activatePipe(1)
    setPV('pipe1Val', 'BLS signing...')
    $('pipeDetail').innerHTML = `BLS12-381 sign with DST <span class="gold">"TOKASINO-VRF-V1"</span>`
  }, 500)

  // Stage 2: keccak256
  setTimeout(() => {
    activatePipe(2)
    setPV('pipe2Val', sh(prevrandao, 4))
    $('pipeDetail').innerHTML = `keccak256(signature) = <span class="gold">${sh(prevrandao, 6)}</span>`
  }, 1000)

  // Stage 3: prevrandao set
  setTimeout(() => {
    activatePipe(3)
    setPV('pipe3Val', sh(prevrandao, 4))
    $('pipeDetail').innerHTML = `prevrandao = <span class="gold">${sh(prevrandao, 6)}</span> injected via Engine API`
  }, 1500)

  // Settle
  setTimeout(() => {
    clearPipe()
    for (let i = 0; i < 4; i++) $(pipeIds[i]).classList.add('pulse')
    setPV('pipe4Val', 'awaiting tx', true)
    setPV('pipe5Val', '\u2014', true)
    $('pipeDetail').innerHTML = `Block #${num} ready &mdash; prevrandao = <span class="gold">${sh(prevrandao, 6)}</span>`
  }, 2800)
}

// ─── Demo balance ─────────────────────────────────────────────────

async function updateBalance() {
  try {
    const bal = await demoProvider.getBalance(demoWallet.address)
    $('demoBalance').textContent = Number(formatEther(bal)).toFixed(2) + ' ETH'
  } catch {}
}
updateBalance()

// ─── Dice game ────────────────────────────────────────────────────

let selectedNum = null
const diceChars = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685']

$('dicePicker').addEventListener('click', (e) => {
  const btn = e.target.closest('.dice-btn')
  if (!btn) return
  document.querySelectorAll('.dice-btn').forEach((b) => b.classList.remove('selected'))
  btn.classList.add('selected')
  selectedNum = Number(btn.dataset.num)
  $('rollBtn').disabled = false
})

document.querySelectorAll('.bet-preset').forEach((btn) => {
  btn.addEventListener('click', () => { $('betAmount').value = btn.dataset.bet })
})

$('rollBtn').addEventListener('click', async () => {
  if (!selectedNum) return
  const btn = $('rollBtn')
  const trace = $('txTrace')

  btn.disabled = true
  btn.textContent = 'ROLLING...'
  $('traceStatus').textContent = 'pending'
  $('traceStatus').style.color = 'var(--gold)'
  trace.innerHTML = ''

  clearPipe()
  clearVrfSteps()

  const betVal = $('betAmount').value || '0.01'

  try {
    // TX submit
    addTL(trace, 'Action', `play(${selectedNum})`, 'neon')
    addTL(trace, 'Bet', `${betVal} ETH`)
    addSep(trace)

    activatePipe(0)
    setPV('pipe0Val', 'tx pending...')

    const contract = new Contract(contracts.dice, abis.dice, demoWallet)
    const tx = await contract.play(selectedNum, { value: parseEther(betVal) })
    addTL(trace, 'TX', sh(tx.hash, 10), 'gold')

    // Waiting for block with VRF
    activatePipe(1)
    setPV('pipe1Val', 'signing block...')
    $('pipeDetail').innerHTML = 'Sequencer producing new block with VRF for this transaction...'

    const receipt = await tx.wait()
    const block = await provider.getBlock(receipt.blockNumber)
    const parentHash = block.parentHash
    const prevrandao = block.prevrandao
      ? '0x' + BigInt(block.prevrandao).toString(16).padStart(64, '0')
      : null

    // Refresh block feed
    await pollBlocks()
    const blockEl = document.getElementById('block-' + receipt.blockNumber)
    if (blockEl) {
      $('blockFeed').querySelectorAll('.block-entry').forEach((e) => e.classList.remove('selected'))
      blockEl.classList.add('selected', 'highlight')
      setTimeout(() => blockEl.classList.remove('highlight'), 3000)
    }

    addTL(trace, 'Block', '#' + receipt.blockNumber, 'neon')
    addTL(trace, 'Gas', receipt.gasUsed.toString())
    addSep(trace)

    // Animate full VRF pipeline
    // Stage 0: Input
    setPV('pipe0Val', sh(parentHash, 4) + '||' + receipt.blockNumber)
    addTL(trace, 'VRF Input', sh(parentHash, 12) + ' || ' + receipt.blockNumber, 'blue')

    // VRF detail panel - step 1
    $('vrfBlockLabel').textContent = 'Block #' + receipt.blockNumber
    clearVrfSteps()
    activateVrfStep(0)
    $('vrfInput').textContent = sh(parentHash, 10) + ' || ' + receipt.blockNumber

    // Stage 1: BLS sign
    setTimeout(() => {
      activatePipe(2)
      setPV('pipe1Val', 'BLS signed')
      setPV('pipe2Val', sh(prevrandao, 4))
      activateVrfStep(1)
      $('vrfSig').textContent = 'BLS_sign(sk, input, "TOKASINO-VRF-V1")'
      addTL(trace, 'BLS Sign', 'signature = 96-byte proof', 'gold')
    }, 300)

    // Stage 2-3: keccak → prevrandao
    setTimeout(() => {
      activatePipe(3)
      setPV('pipe3Val', sh(prevrandao, 4))
      activateVrfStep(2)
      $('vrfOutput').textContent = prevrandao
      addTL(trace, 'prevrandao', prevrandao, 'gold')
      $('pipeDetail').innerHTML = `keccak256(sig) = prevrandao = <span class="gold">${sh(prevrandao, 6)}</span>`
    }, 600)

    // Parse game result
    const gameEvent = receipt.logs
      .map((log) => { try { return contract.interface.parseLog(log) } catch { return null } })
      .find((e) => e?.name === 'GamePlayed')

    if (gameEvent) {
      const { chosenNumber, rolledNumber, won, payout, randomSeed } = gameEvent.args
      const rolled = Number(rolledNumber)
      const isWin = won
      const payoutEth = formatEther(payout)

      // Stage 4: Contract seed
      setTimeout(() => {
        activatePipe(4)
        setPV('pipe4Val', sh(randomSeed.toString(), 4))
        activateVrfStep(3)
        $('vrfGameSeed').textContent = randomSeed.toString()
        $('vrfGameSeed').style.color = 'var(--gold)'
        addSep(trace)
        addTL(trace, 'Game Seed', randomSeed.toString(), 'gold')
        addTL(trace, 'Formula', `keccak256(prevrandao, #${receipt.blockNumber}, ${shortAddr}, gameId)`)
        addTL(trace, 'Dice', `${rolled}  ${diceChars[rolled]}`, isWin ? 'neon' : 'hot')
      }, 900)

      // Stage 5: Result
      setTimeout(() => {
        activatePipe(5)
        const resultText = isWin
          ? `${diceChars[rolled]} WIN +${payoutEth}`
          : `${diceChars[rolled]} LOSE`
        setPV('pipe5Val', resultText)
        $('pipe5Val').style.color = isWin ? 'var(--neon)' : 'var(--hot)'
        $(pipeIds[5]).classList.add(isWin ? 'active-gold' : 'active-hot')

        addTL(trace, 'Result', isWin ? 'WIN!' : 'LOSE', isWin ? 'neon' : 'hot')
        if (isWin) addTL(trace, 'Payout', '+' + payoutEth + ' ETH', 'gold')

        $('traceStatus').textContent = isWin ? 'win' : 'lose'
        $('traceStatus').style.color = isWin ? 'var(--neon)' : 'var(--hot)'

        $('pipeDetail').innerHTML = `<span class="hl">VRF(#${receipt.blockNumber})</span> &rarr; <span class="gold">${sh(prevrandao, 4)}</span> &rarr; seed &rarr; rolled <strong>${rolled}</strong> ${isWin ? '<span class="hl">WIN!</span>' : '<span style="color:var(--hot)">LOSE</span>'}`

        showResult(isWin, rolled, payoutEth, randomSeed.toString())
      }, 1300)
    }
  } catch (err) {
    addTL(trace, 'Error', err.message || 'TX failed', 'hot')
    $('traceStatus').textContent = 'error'
    $('traceStatus').style.color = 'var(--hot)'
    clearPipe()
  }

  btn.disabled = false
  btn.textContent = 'ROLL DICE'
  updateBalance()
})

// ─── Helpers ──────────────────────────────────────────────────────

function addTL(el, k, v, cls) {
  const d = document.createElement('div')
  d.className = 'tl'
  d.innerHTML = `<span class="tl-k">${k}</span><span class="tl-v ${cls || ''}">${v}</span>`
  el.appendChild(d)
  el.scrollTop = el.scrollHeight
}

function addSep(el) {
  const d = document.createElement('div')
  d.className = 't-sep'
  el.appendChild(d)
}

function showResult(won, rolled, payoutEth, seed) {
  $('resultEmoji').textContent = diceChars[rolled] || rolled
  $('resultCard').className = 'result-card ' + (won ? 'win' : 'lose')
  $('resultTitle').textContent = won ? 'YOU WIN!' : 'YOU LOSE'
  $('resultTitle').className = 'result-title ' + (won ? 'win' : 'lose')
  $('resultPayout').textContent = won ? '+' + payoutEth + ' ETH' : 'Better luck next time'
  $('resultPayout').style.color = won ? 'var(--gold)' : 'var(--muted)'
  $('resultDetail').textContent = `Rolled: ${rolled}`
  $('resultSeed').textContent = `VRF Seed: ${seed}`
  $('resultOverlay').classList.add('show')
}

$('resultClose').addEventListener('click', () => $('resultOverlay').classList.remove('show'))
$('resultOverlay').addEventListener('click', (e) => {
  if (e.target === $('resultOverlay')) $('resultOverlay').classList.remove('show')
})

// ─── Init ─────────────────────────────────────────────────────────

pollBlocks()
setInterval(pollBlocks, 2000)
