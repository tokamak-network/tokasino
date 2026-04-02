// Enshrined VRF Setup — step-by-step sequencer boot with explanations

import { RPC_URL, CHAIN_ID, contracts } from './config.js'
import { JsonRpcProvider, formatEther } from 'ethers'

const $ = (id) => document.getElementById(id)
const provider = new JsonRpcProvider(RPC_URL)

// ─── Terminal ─────────────────────────────────────────────────────

const term = $('termBody')

function log(level, msg, kv) {
  const cursor = term.querySelector('.term-line:last-child')
  if (cursor?.querySelector('.t-cursor')) cursor.remove()

  const line = document.createElement('div')
  line.className = 'term-line'
  const time = new Date().toLocaleTimeString('en-US', { hour12: false })
  let html = `<span class="t-time">${time}</span>`
  html += `<span class="t-level ${level}">${level.toUpperCase()}</span>`
  html += `<span class="t-msg">${msg}</span>`
  if (kv) html += ` <span class="t-kv">${kv}</span>`
  line.innerHTML = html
  term.appendChild(line)

  const cursorLine = document.createElement('div')
  cursorLine.className = 'term-line'
  cursorLine.innerHTML = '<span class="t-cursor"></span>'
  term.appendChild(cursorLine)
  term.scrollTop = term.scrollHeight
}

// ─── Step management ──────────────────────────────────────────────

// Step IDs in order (matches HTML element IDs)
const stepIds = ['0', '0b', '0c', '1', '2', '3', '4', '5']
const TOTAL_STEPS = stepIds.length
let currentStep = 0
let isRunning = false
let genesisHash = ''

function setStep(id, state) {
  const card = $('step' + id)
  const status = $('step' + id + 'Status')
  card.classList.remove('waiting', 'running', 'done')
  card.classList.add(state)
  if (state === 'running') status.textContent = 'running...'
  else if (state === 'done') status.textContent = 'done'
}

function showData(id, rows) {
  const data = $('step' + id + 'Data')
  data.innerHTML = rows.map(([k, v, cls]) =>
    `<div class="sd-row"><span class="sd-k">${k}</span><span class="sd-v ${cls || ''}">${v}</span></div>`
  ).join('')
  data.classList.add('show')
}

function completeStep(id) {
  setStep(id, 'done')
  const conn = $('conn' + id)
  if (conn) conn.classList.add('done')

  // Show only this step's bubble
  stepIds.forEach((sid) => {
    const b = $('bubble' + sid)
    if (b) b.classList.toggle('show', sid === id)
  })

  // Scroll bubble into view (bubble is below the card)
  const bubble = $('bubble' + id)
  if (bubble) {
    setTimeout(() => bubble.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100)
  } else {
    const card = $('step' + id)
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const done = currentStep + 1
  $('progressFill').style.width = (done / TOTAL_STEPS * 100) + '%'
  $('progressLabel').textContent = `${done} / ${TOTAL_STEPS}`
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function sh(h, n = 10) {
  if (!h || h.length < 20) return h || '--'
  return h.slice(0, n + 2) + '...' + h.slice(-n)
}

function updateButton() {
  const btn = $('startBtn')
  if (currentStep === 0 && !isRunning) {
    btn.textContent = 'START'
    btn.disabled = false
  } else if (currentStep < TOTAL_STEPS) {
    btn.textContent = 'NEXT STEP'
    btn.disabled = false
  } else {
    btn.style.display = 'none'
    $('demoLink').style.display = 'inline-block'
  }
}

// ─── Step functions ───────────────────────────────────────────────

// Step 1a: Launch EL
async function runStep_0() {
  $('setupStatus').textContent = 'Step 1a: Execution Layer'
  setStep('0', 'running')
  log('info', 'Launching Enshrined VRF OP Stack node')
  await wait(600)
  log('info', 'Loading randomness precompile', 'addr=0x0b')
  await wait(400)
  log('info', 'Precompile registered', 'gas=100 type=ChaCha20')
  await wait(300)

  try {
    const network = await provider.getNetwork()
    const chainId = Number(network.chainId)
    const blockNum = await provider.getBlockNumber()
    log('info', 'EL node is live', `chain_id=${chainId} block=${blockNum}`)
    showData('0', [
      ['Binary', 'enshrined-vrf (op-reth fork)', ''],
      ['Precompile', '0x0b (ChaCha20 CSPRNG)', 'neon'],
      ['Chain ID', chainId.toString(), 'gold'],
      ['RPC', RPC_URL, 'blue'],
      ['Head Block', '#' + blockNum, 'neon'],
    ])
  } catch {
    log('warn', 'EL not reachable, simulating...', `rpc=${RPC_URL}`)
    showData('0', [
      ['Binary', 'enshrined-vrf (op-reth fork)', ''],
      ['Precompile', '0x0b (ChaCha20 CSPRNG)', 'neon'],
      ['Chain ID', CHAIN_ID.toString(), 'gold'],
      ['Status', 'simulated', 'gold'],
    ])
  }
  completeStep('0')
}

// Step 1b: Precompile detail — seed + counter
async function runStep_0b() {
  $('setupStatus').textContent = 'Step 1b: Precompile Detail'
  setStep('0b', 'running')
  log('info', 'Precompile internals: seed + atomic counter')
  await wait(400)
  log('info', 'Counter ensures unique output per call', 'counter=AtomicU64')
  await wait(300)
  log('info', 'mixed = keccak256(seed || counter)')

  showData('0b', [
    ['Input', 'seed (from prevrandao) + counter', ''],
    ['Counter', 'AtomicU64, increments each call', 'neon'],
    ['Mix', 'keccak256(seed || counter)', 'gold'],
    ['Purpose', 'Same TX, different call = different hash', ''],
  ])
  completeStep('0b')
}

// Step 1c: ChaCha20 + final output
async function runStep_0c() {
  $('setupStatus').textContent = 'Step 1c: ChaCha20 Output'
  setStep('0c', 'running')
  log('info', 'ChaCha20 CSPRNG seeded from mixed hash')
  await wait(400)
  log('info', 'Generating 32 bytes of randomness')
  await wait(300)
  log('info', 'Precompile returns random output', 'gas=100')

  showData('0c', [
    ['CSPRNG', 'ChaCha20 (used by Google TLS)', ''],
    ['Seed', 'keccak256(seed || counter)', 'gold'],
    ['Output', '32 bytes (256 bits)', 'neon'],
    ['Gas Cost', '100 (native code)', 'gold'],
    ['Security', 'Double layer: keccak256 + ChaCha20', ''],
  ])
  completeStep('0c')
}

// Step 2: VRF Key
async function runStep_1() {
  $('setupStatus').textContent = 'Step 2: VRF Keypair'
  setStep('1', 'running')
  log('info', 'Generating BLS12-381 VRF keypair')
  await wait(400)

  const fakepk = '0x' + Array.from({ length: 96 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  log('info', 'VRF key pair generated')
  await wait(200)
  log('info', 'Key saved', 'path=vrf_key.bin')
  await wait(200)
  log('info', 'DST: ENSHRINED-VRF-V1')

  showData('1', [
    ['Algorithm', 'BLS12-381 min-sig', ''],
    ['DST', 'ENSHRINED-VRF-V1', 'gold'],
    ['Public Key', sh(fakepk, 16), 'neon'],
    ['Key File', 'vrf_key.bin', 'blue'],
    ['Property', 'Deterministic + Unpredictable + Verifiable', ''],
  ])
  completeStep('1')
}

// Step 3: Engine API
async function runStep_2() {
  $('setupStatus').textContent = 'Step 3: Engine API'
  setStep('2', 'running')
  log('info', 'Connecting to Engine API', 'url=http://localhost:8551')
  await wait(400)
  log('info', 'JWT authentication configured', 'alg=HS256')
  await wait(300)
  log('info', 'Engine API connected')

  showData('2', [
    ['Endpoint', 'http://localhost:8551', 'blue'],
    ['Auth', 'JWT (HS256)', 'gold'],
    ['Methods', 'forkchoiceUpdatedV3, getPayloadV3, newPayloadV3', ''],
    ['Purpose', 'Submit prevRandao + build blocks', ''],
  ])
  completeStep('2')
}

// Step 4: Genesis
async function runStep_3() {
  $('setupStatus').textContent = 'Step 4: Genesis Block'
  setStep('3', 'running')
  log('info', 'Fetching genesis block')
  await wait(300)

  genesisHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  try {
    const genesis = await provider.getBlock(0)
    if (genesis) genesisHash = genesis.hash
  } catch {}

  log('info', 'Genesis block loaded', `hash=${sh(genesisHash, 8)}`)
  await wait(200)
  log('info', 'VRF chain initialized', 'input_0 = genesis_hash || 1')

  showData('3', [
    ['Genesis Hash', sh(genesisHash, 16), 'gold'],
    ['VRF Input #1', sh(genesisHash, 8) + ' || 1', 'neon'],
    ['Chain Start', 'VRF output becomes block 1 prevrandao', ''],
  ])
  completeStep('3')
}

// Step 5: First Block
async function runStep_4() {
  $('setupStatus').textContent = 'Step 5: First Block'
  setStep('4', 'running')
  log('info', 'Computing first VRF output')
  await wait(300)
  log('info', 'VRF.prove(genesis_hash || 1)', 'dst=ENSHRINED-VRF-V1')
  await wait(400)

  let block1Randao = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  let block1Hash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  try {
    const b1 = await provider.getBlock(1)
    if (b1) {
      block1Hash = b1.hash
      block1Randao = b1.prevrandao
        ? '0x' + BigInt(b1.prevrandao).toString(16).padStart(64, '0')
        : block1Randao
    }
  } catch {}

  log('info', 'BLS signature computed (96 bytes)')
  await wait(200)
  log('info', 'keccak256(sig) = prevrandao', `output=${sh(block1Randao, 8)}`)
  await wait(300)
  log('info', 'Block #1 submitted via Engine API')
  await wait(200)
  log('info', 'Block #1 finalized', `hash=${sh(block1Hash, 8)}`)

  showData('4', [
    ['VRF Input', sh(genesisHash, 8) + ' || 1', 'blue'],
    ['BLS Sign', 'sign(sk, input, "ENSHRINED-VRF-V1")', ''],
    ['VRF Output', sh(block1Randao, 16), 'gold'],
    ['Block #1', sh(block1Hash, 16), 'neon'],
    ['Flow', 'forkchoiceUpdatedV3 -> getPayloadV3 -> newPayloadV3', ''],
  ])
  completeStep('4')
}

// Step 6: Deploy Contracts
async function runStep_5() {
  $('setupStatus').textContent = 'Step 6: Contracts'
  setStep('5', 'running')
  log('info', 'Deploying game contracts', 'deployer=0xf39F...2266')
  await wait(400)

  const games = [
    { name: 'InstantDice', key: 'dice', fund: '10' },
    { name: 'CoinFlip', key: 'coinFlip', fund: '10' },
    { name: 'Roulette', key: 'roulette', fund: '10' },
    { name: 'Lottery', key: 'lottery', fund: '0' },
  ]

  const rows = []
  for (const g of games) {
    await wait(350)
    const addr = contracts[g.key]
    log('info', `${g.name} deployed`, `addr=${addr.slice(0, 10)}...`)
    if (g.fund !== '0') {
      await wait(150)
      log('info', `House funded: ${g.fund} ETH`, `contract=${g.name}`)
    }

    let houseBal = g.fund + ' ETH'
    try {
      const bal = await provider.getBalance(addr)
      houseBal = Number(formatEther(bal)).toFixed(1) + ' ETH'
    } catch {}

    rows.push([g.name, `${addr}  (${houseBal})`, 'gold'])
  }

  showData('5', [
    ...rows,
    ['Total Funded', '30 ETH house bankroll', 'neon'],
  ])
  completeStep('5')

  log('info', 'Sequencer setup complete!')
  log('info', 'VRF consensus loop running', `block_time=3s`)
  $('setupStatus').textContent = 'Setup complete'
}

// ─── Step runners array ───────────────────────────────────────────

const steps = [
  runStep_0,   // 1a: Launch EL
  runStep_0b,  // 1b: Precompile detail
  runStep_0c,  // 1c: ChaCha20
  runStep_1,   // 2: VRF Key
  runStep_2,   // 3: Engine API
  runStep_3,   // 4: Genesis
  runStep_4,   // 5: First Block
  runStep_5,   // 6: Contracts
]

async function onButtonClick() {
  if (isRunning) return
  isRunning = true
  $('startBtn').disabled = true

  await steps[currentStep]()
  currentStep++

  isRunning = false
  updateButton()
}

// ─── Init ─────────────────────────────────────────────────────────

$('startBtn').addEventListener('click', onButtonClick)
updateButton()
