// Tokasino Lottery — Reown AppKit + ethers.js

import {
  getReadContract, getWriteContract, getBlockNumber, getAddress,
  isConnected, subscribeAccount, getBalance, parseEther, formatEther,
  getAppKit
} from './appkit.js'

const $ = (id) => document.getElementById(id)

let currentRound = 0
let blocksLeft = 0
let roundStatus = 0 // 0=Open, 1+=Completed

// --- Initialize AppKit (registers <appkit-button>) ---
getAppKit()

// --- Actions ---

async function buyTicket() {
  const num = parseInt($('numberInput').value)
  if (isNaN(num) || num < 0 || num > 99) {
    alert('Pick a number between 0 and 99')
    return
  }
  const btn = $('buyBtn')
  btn.disabled = true
  btn.textContent = 'Sending...'
  try {
    const contract = await getWriteContract('lottery')
    const tx = await contract.buyTicket(num, { value: parseEther('0.01') })
    btn.textContent = 'Confirming...'
    await tx.wait()
    btn.textContent = 'Ticket Bought!'
    $('numberInput').value = ''
    setTimeout(() => { btn.textContent = 'Buy Ticket (0.01 ETH)'; btn.disabled = false }, 1500)
    refresh()
  } catch (e) {
    console.error('buyTicket error:', e)
    btn.textContent = 'Buy Ticket (0.01 ETH)'
    btn.disabled = false
  }
}

async function drawRound() {
  const btn = $('drawBtn')
  btn.disabled = true
  btn.textContent = 'Drawing...'
  try {
    const contract = await getWriteContract('lottery')
    const tx = await contract.draw()
    btn.textContent = 'Confirming...'
    await tx.wait()
    btn.textContent = 'Round Drawn!'
    setTimeout(() => refresh(), 1500)
  } catch (e) {
    console.error('draw error:', e)
    btn.textContent = 'Draw Winner'
    btn.disabled = false
  }
}

async function claimPrize(roundId) {
  const btn = $('claim-' + roundId)
  if (!btn) return
  btn.disabled = true
  btn.textContent = 'Claiming...'
  try {
    const contract = await getWriteContract('lottery')
    const tx = await contract.claimPrize(roundId)
    await tx.wait()
    btn.textContent = 'Claimed!'
    btn.style.background = 'var(--neon)'
  } catch (e) {
    console.error('claim error:', e)
    btn.textContent = 'Claim'
    btn.disabled = false
  }
}

// Expose claimPrize globally for onclick handlers in dynamic HTML
window.claimPrize = claimPrize

// --- Toggle past round details ---
function toggleRound(header) {
  header.classList.toggle('open')
  const body = header.nextElementSibling
  body.classList.toggle('open')
}
window.toggleRound = toggleRound

// --- UI Refresh ---

async function refresh() {
  try {
    const blockNum = await getBlockNumber()
    $('blockNum').textContent = blockNum
    $('dotStatus').className = 'dot live'

    const connected = isConnected()
    const address = getAddress()

    if (connected && address) {
      $('connStatus').textContent = address.slice(0, 6) + '...' + address.slice(-4)
      const bal = await getBalance(address)
      $('balDisplay').textContent = Number(bal).toFixed(3)
    } else {
      $('connStatus').textContent = 'Disconnected'
      $('balDisplay').textContent = '\u2014'
    }

    const lottery = getReadContract('lottery')

    currentRound = Number(await lottery.currentRoundId())
    blocksLeft = Number(await lottery.getBlocksRemaining())
    const info = await lottery.getRoundInfo(currentRound)

    // Destructure tuple: [startBlock, status, ticketCount, winningNumber, prizePool, randomSeed, winnerCount]
    const status = Number(info[1])
    const ticketCount = Number(info[2])
    const prizePool = info[4]
    roundStatus = status

    $('roundId').textContent = '#' + currentRound

    const isOpen = status === 0
    $('roundStatus').textContent = isOpen ? 'Open' : 'Completed'
    $('roundStatus').className = 'info-val ' + (isOpen ? 'neon' : 'gold')
    $('ticketCount').textContent = ticketCount
    $('prizePool').textContent = Number(formatEther(prizePool)).toFixed(4) + ' ETH'
    $('blocksRemaining').textContent = blocksLeft

    const progress = isOpen ? Math.max(0, Math.min(100, ((50 - blocksLeft) / 50) * 100)) : 100
    $('progressFill').style.width = progress + '%'

    // Draw button
    const drawBtn = $('drawBtn')
    drawBtn.disabled = !(isOpen && blocksLeft === 0 && connected)
    if (!isOpen) {
      drawBtn.textContent = 'Round Completed'
    } else if (blocksLeft > 0) {
      drawBtn.textContent = 'Draw Winner (' + blocksLeft + ' blocks left)'
    } else {
      drawBtn.textContent = 'Draw Winner'
    }

    // Buy button enabled only when connected and round is open
    $('buyBtn').disabled = !(connected && isOpen)

    // My tickets
    await refreshMyTickets(lottery, connected, address)

    // Past rounds
    await refreshPastRounds(lottery, connected, address)

  } catch (e) {
    console.error('refresh error:', e)
    $('dotStatus').className = 'dot dead'
    $('connStatus').textContent = 'Disconnected'
  }
}

async function refreshMyTickets(lottery, connected, address) {
  const el = $('myTickets')
  if (!connected || !address) {
    el.innerHTML = '<div class="empty-msg">Connect wallet to see tickets</div>'
    return
  }
  try {
    const tickets = await lottery.getMyTickets(currentRound, address)
    if (tickets.length === 0) {
      el.innerHTML = '<div class="empty-msg">No tickets this round</div>'
    } else {
      el.innerHTML = '<div class="ticket-list">' +
        tickets.map(n => '<span class="ticket-num">' + String(Number(n)).padStart(2, '0') + '</span>').join('') +
        '</div>'
    }
  } catch {
    el.innerHTML = '<div class="empty-msg">No tickets this round</div>'
  }
}

async function refreshPastRounds(lottery, connected, address) {
  const el = $('pastRounds')
  if (currentRound <= 1) {
    el.innerHTML = '<div class="empty-msg">No past rounds</div>'
    return
  }

  let html = ''
  const start = Math.max(1, currentRound - 10)
  for (let r = currentRound - 1; r >= start; r--) {
    try {
      const info = await lottery.getRoundInfo(r)
      const status = Number(info[1])
      if (status === 0) continue // still open, skip

      const winningNumber = Number(info[3])
      const poolEth = Number(formatEther(info[4])).toFixed(4)
      const ticketCount = Number(info[2])
      const winnerCount = Number(info[6])
      const randomSeed = info[5]

      let claimHtml = ''
      if (connected && address) {
        try {
          const myTickets = await lottery.getMyTickets(r, address)
          const hasWinning = myTickets.some(t => Number(t) === winningNumber)
          if (hasWinning) {
            const claimed = await lottery.hasClaimed(r, address)
            if (!claimed) {
              claimHtml = '<button class="claim-btn" id="claim-' + r + '" onclick="claimPrize(' + r + ')">Claim</button>'
            } else {
              claimHtml = '<span style="color:var(--neon);font-family:var(--mono);font-size:0.7rem">Claimed</span>'
            }
          }
        } catch {}
      }

      html += '<div class="round-item">' +
        '<div class="round-header" onclick="toggleRound(this)">' +
          '<span>Round #' + r + '</span>' +
          '<span style="display:flex;align-items:center;gap:0.8rem">' +
            '<span style="color:var(--gold)">W:' + String(winningNumber).padStart(2, '0') + '</span>' +
            '<span>' + poolEth + ' ETH</span>' +
            '<span class="arrow">&#9654;</span>' +
          '</span>' +
        '</div>' +
        '<div class="round-body">' +
          '<div>Winning Number: <span style="color:var(--gold)">' + String(winningNumber).padStart(2, '0') + '</span></div>' +
          '<div>Prize Pool: ' + poolEth + ' ETH (90% to winners)</div>' +
          '<div>Tickets Sold: ' + ticketCount + '</div>' +
          '<div>Winners: ' + winnerCount + '</div>' +
          '<div>Seed: <span style="font-size:0.6rem;word-break:break-all">' + randomSeed + '</span></div>' +
          (claimHtml ? '<div style="margin-top:0.5rem">' + claimHtml + '</div>' : '') +
        '</div>' +
      '</div>'
    } catch {
      // round info not available
    }
  }

  el.innerHTML = html || '<div class="empty-msg">No past rounds</div>'
}

// --- Event listeners ---
$('buyBtn').addEventListener('click', buyTicket)
$('drawBtn').addEventListener('click', drawRound)

// --- Account subscription ---
subscribeAccount((account) => {
  refresh()
})

// --- Init + polling ---
refresh()
setInterval(refresh, 3000)
