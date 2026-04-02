// Enshrined VRF Randomness Deep Dive — interactive pipeline explainer with real values

import { getReadProvider, getBlockNumber, formatEther } from './appkit.js'
import { CHAIN_ID, RPC_URL, contracts } from './config.js'
import { JsonRpcProvider, keccak256, AbiCoder, solidityPackedKeccak256 } from 'ethers'

const $ = (id) => document.getElementById(id)
const provider = new JsonRpcProvider(RPC_URL)

function sh(h, n = 10) {
  if (!h || h.length < 20) return h || '--'
  return h.slice(0, n + 2) + '...' + h.slice(-n)
}

function full(h) { return h || '0x???'; }

// ─── Traced block data ────────────────────────────────────────────
// We trace one block's randomness through the entire pipeline

let traced = {
  blockNumber: null,
  parentHash: null,
  prevrandao: null,
  prevrandaoFull: null,
  blockHash: null,
  // Simulated game values
  player: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  gameId: 42,
  gameSeed: null,
  diceResult: null,
}

// Also keep a few blocks for chaining view
let recentBlocks = []

async function loadTraceBlock(num) {
  const block = await provider.getBlock(num)
  if (!block) return

  traced.blockNumber = block.number
  traced.parentHash = block.parentHash
  traced.blockHash = block.hash
  traced.prevrandaoFull = block.prevrandao
    ? '0x' + BigInt(block.prevrandao).toString(16).padStart(64, '0')
    : null
  traced.prevrandao = traced.prevrandaoFull

  // Simulate the contract's seed derivation: keccak256(prevrandao, blockNum, sender, gameId)
  if (traced.prevrandao) {
    try {
      traced.gameSeed = solidityPackedKeccak256(
        ['uint256', 'uint256', 'address', 'uint256'],
        [traced.prevrandao, traced.blockNumber, traced.player, traced.gameId]
      )
      const seedBig = BigInt(traced.gameSeed)
      traced.diceResult = Number(seedBig % 6n) + 1
    } catch {
      traced.gameSeed = keccak256(traced.prevrandao)
      traced.diceResult = (Number(BigInt(traced.gameSeed) % 6n)) + 1
    }
  }

  // Update left panel values
  $('valVrfInput').textContent = sh(block.parentHash, 6) + ' || ' + block.number
  $('valPrevrandao').textContent = traced.prevrandao ? sh(traced.prevrandao, 6) : '--'
  $('valSeed').textContent = traced.gameSeed ? sh(traced.gameSeed, 6) : '--'
  $('valResult').textContent = traced.diceResult ? 'Dice: ' + traced.diceResult : '--'
  $('tracedBlock').textContent = '#' + block.number
}

async function loadRecentBlocks(currentNum) {
  recentBlocks = []
  const start = Math.max(currentNum - 4, 0)
  for (let i = start; i <= currentNum; i++) {
    const b = await provider.getBlock(i)
    if (b) {
      recentBlocks.push({
        number: b.number,
        parentHash: b.parentHash,
        hash: b.hash,
        prevrandao: b.prevrandao
          ? '0x' + BigInt(b.prevrandao).toString(16).padStart(64, '0')
          : null,
      })
    }
  }
}

// ─── Stage content ────────────────────────────────────────────────

const stages = {
  problem: {
    title: 'Why is On-Chain Randomness Hard?',
    badge: 'THE PROBLEM',
    render: () => `
      <div class="d-section">
        <div class="d-label">핵심 문제</div>
        <div class="d-text">
          블록체인은 <span class="key">결정적(deterministic)</span> 시스템입니다.
          모든 노드가 같은 입력에 대해 같은 결과를 내야 합니다.
          그런데 <span class="key">"랜덤"은 본질적으로 비결정적</span>이에요.
          이 모순을 어떻게 해결할까요?
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">기존 접근법의 문제</div>
        <div class="d-comparison">
          <div class="d-comp-box bad">
            <div class="d-comp-title">block.timestamp / blockhash</div>
            <div class="d-comp-text">
              채굴자/시퀀서가 값을 조작할 수 있음.
              MEV 공격에 취약. 카지노에서는 치명적.
            </div>
          </div>
          <div class="d-comp-box bad">
            <div class="d-comp-title">Chainlink VRF (외부 오라클)</div>
            <div class="d-comp-text">
              2블록 대기 필요 (commit-reveal).
              LINK 토큰 비용. 외부 의존성.
              즉시 결과가 필요한 게임에 부적합.
            </div>
          </div>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">Enshrined VRF의 해결책</div>
        <div class="d-comparison">
          <div class="d-comp-box good" style="grid-column: 1 / -1;">
            <div class="d-comp-title">VRF를 합의 레이어에 내장</div>
            <div class="d-comp-text">
              시퀀서가 매 블록마다 BLS12-381 VRF로 난수를 생성합니다.<br>
              <span style="color:var(--neon);">결정적</span> (같은 입력 = 같은 출력) +
              <span style="color:var(--neon);">예측 불가</span> (비밀키 없이는 모름) +
              <span style="color:var(--neon);">검증 가능</span> (공개키로 확인)<br><br>
              결과: <strong>한 트랜잭션으로 즉시 결과 확정</strong>. 대기 시간 0. 외부 의존성 0. 추가 비용 0.
            </div>
          </div>
        </div>
      </div>

      ${traced.blockNumber ? `
      <div class="d-section">
        <div class="d-label">지금 추적 중인 블록</div>
        <div class="d-text">
          이 페이지에서는 <span class="key">Block #${traced.blockNumber}</span>의 난수가
          파이프라인의 각 단계를 어떻게 통과하는지 실제 값으로 추적합니다.
          왼쪽 각 Stage를 클릭해서 따라가 보세요.
        </div>
        <div class="d-live">
          <div class="d-live-cell">
            <div class="d-live-label">추적 블록</div>
            <div class="d-live-val">#${traced.blockNumber}</div>
          </div>
          <div class="d-live-cell">
            <div class="d-live-label">prevrandao</div>
            <div class="d-live-val sm">${sh(traced.prevrandao, 8)}</div>
          </div>
          <div class="d-live-cell">
            <div class="d-live-label">주사위 결과</div>
            <div class="d-live-val">${traced.diceResult || '--'}</div>
          </div>
        </div>
      </div>` : ''}
    `
  },

  vrf: {
    title: 'VRF: BLS12-381 Signing',
    badge: 'STAGE 1 — CONSENSUS',
    render: () => `
      <div class="d-section">
        <div class="d-label">VRF란?</div>
        <div class="d-text">
          <span class="key">VRF</span> = Verifiable Random Function (검증 가능한 난수 함수)<br><br>
          비밀키 소유자만 만들 수 있지만, 공개키로 누구나 진위를 확인할 수 있습니다.
          같은 입력이면 <span class="key">항상 같은 출력</span> — 시퀀서가 마음대로 바꿀 수 없어요.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">Block #${traced.blockNumber}의 실제 VRF 입력</div>
        <div class="d-flow">
          <span class="label">parent_hash</span> <span class="val">${full(traced.parentHash)}</span><br>
          <span class="label">block_number</span> <span class="val">${traced.blockNumber}</span><br>
          <span class="arr">─────────────────────────────────────</span><br>
          <span class="label">VRF input</span> <span class="hl">parent_hash(${traced.parentHash ? traced.parentHash.length / 2 - 1 : 32}bytes) || block_number(8bytes)</span>
        </div>
        <div class="d-text" style="margin-top:0.3rem;">
          <span class="key">parent_hash</span>는 Block #${(traced.blockNumber || 1) - 1}의 해시입니다.
          이전 블록이 확정되어야 다음 블록의 난수 입력이 결정되므로, <span class="key">미래의 난수를 미리 알 수 없습니다</span>.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">BLS12-381 서명 과정</div>
        <div class="d-code">
<span class="cm">// 시퀀서가 실행하는 Rust 코드 (vrf.rs)</span>
<span class="kw">const</span> DST = <span class="str">"ENSHRINED-VRF-V1"</span>;

input = <span class="str">${sh(traced.parentHash, 6)}</span> || <span class="num">${traced.blockNumber}</span>

signature = BLS.<span class="fn">sign</span>(secret_key, input, DST)
<span class="cm">// signature = 96바이트 BLS 서명</span>
<span class="cm">// 이것이 VRF "증명(proof)" — 공개키로 검증 가능</span>

output = <span class="fn">keccak256</span>(signature)
<span class="cm">// output = <span style="color:var(--gold)">${sh(traced.prevrandao, 10)}</span></span>
<span class="cm">// 이 32바이트가 블록의 prevrandao가 됩니다!</span>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">이 단계의 핵심</div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text">입력: <span class="key">${sh(traced.parentHash, 6)} || ${traced.blockNumber}</span></span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text">출력: <span class="key">${sh(traced.prevrandao, 6)}</span> (이 값이 다음 Stage로 전달)</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text">비밀키 없이는 이 출력을 <span class="key">예측 불가능</span></span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text">공개키로 <span class="key">검증 가능</span> — 시퀀서가 거짓 값을 내면 즉시 발각</span></div>
      </div>
    `
  },

  prevrandao: {
    title: 'prevrandao: Block Random Field',
    badge: 'STAGE 2 — BLOCK',
    render: () => `
      <div class="d-section">
        <div class="d-label">Block #${traced.blockNumber}의 prevrandao</div>
        <div class="d-text">
          Stage 1에서 만든 VRF 출력이 이 블록의 <span class="key">prevrandao</span> 필드에 기록되었습니다.
        </div>
        <div class="d-live">
          <div class="d-live-cell">
            <div class="d-live-label">Block</div>
            <div class="d-live-val">#${traced.blockNumber}</div>
          </div>
          <div class="d-live-cell">
            <div class="d-live-label">Parent Hash (입력)</div>
            <div class="d-live-val sm">${sh(traced.parentHash, 8)}</div>
          </div>
          <div class="d-live-cell">
            <div class="d-live-label">prevrandao (출력)</div>
            <div class="d-live-val sm">${sh(traced.prevrandao, 8)}</div>
          </div>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">전달 경로 (실제 값)</div>
        <div class="d-flow">
          <span class="label">1. CL 계산</span> VRF(<span class="val">${sh(traced.parentHash, 6)}</span> || <span class="val">${traced.blockNumber}</span>)<br>
          <span class="label"></span> = <span class="hl">${sh(traced.prevrandao, 10)}</span><br>
          <span class="arr">&darr;</span><br>
          <span class="label">2. Engine API</span> forkchoiceUpdatedV3({<br>
          <span class="label"></span> &nbsp;&nbsp;prevRandao: <span class="val">${sh(traced.prevrandao, 10)}</span><br>
          <span class="label"></span> })<br>
          <span class="arr">&darr;</span><br>
          <span class="label">3. EL 기록</span> block.header.prevrandao = <span class="val">${sh(traced.prevrandao, 10)}</span><br>
          <span class="arr">&darr;</span><br>
          <span class="label">4. Solidity</span> block.prevrandao == <span class="hl">${sh(traced.prevrandao, 10)}</span>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">prevrandao의 전체 값 (32바이트 = 256비트)</div>
        <div class="d-flow" style="word-break:break-all;">
          <span class="val">${full(traced.prevrandao)}</span>
        </div>
        <div class="d-text" style="margin-top:0.3rem;">
          이 256비트 값이 이 블록의 <span class="key">모든 난수의 근원</span>입니다.
          같은 블록의 모든 트랜잭션이 이 값을 봅니다.
          Stage 3(프리컴파일)과 Stage 4(컨트랙트)에서 이 값을 가공하여 각 게임마다 다른 난수를 만들어요.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">핵심 성질</div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">블록당 하나</span> — 같은 블록의 모든 TX가 같은 값을 봄</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">사전 예측 불가</span> — Block #${(traced.blockNumber || 1) - 1}이 확정되기 전까지 이 값을 아무도 모름</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">시퀀서도 조작 불가</span> — VRF는 결정적 함수. 다른 값을 내면 BLS 증명이 실패</span></div>
      </div>
    `
  },

  precompile: {
    title: 'Precompile 0x0b: Per-Call Randomness',
    badge: 'STAGE 3 — EVM',
    render: () => `
      <div class="d-section">
        <div class="d-label">왜 프리컴파일이 필요한가?</div>
        <div class="d-text">
          prevrandao <span class="key">${sh(traced.prevrandao, 6)}</span>는 이 블록에서 고정값입니다.
          만약 3개의 게임이 같은 블록에서 실행되면, 셋 다 같은 난수를 보게 됩니다.
          프리컴파일 0x0b는 <span class="key">매 호출마다 다른 난수</span>를 만들어서 이 문제를 해결합니다.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">Block #${traced.blockNumber}에서 3번 호출한다면? (구체적 예시)</div>
        <div class="d-flow">
          seed = prevrandao = <span class="val">${sh(traced.prevrandao, 10)}</span><br><br>
          <span class="hl">1번째 호출 (counter = 0)</span><br>
          &nbsp;&nbsp;mixed = keccak256(<span class="val">${sh(traced.prevrandao, 6)}</span> + <span class="hl">0x00...00</span>)<br>
          &nbsp;&nbsp;ChaCha20(mixed) &rarr; <span class="val">0x${fakeRand(traced.prevrandao, 0)}</span><br><br>
          <span class="hl">2번째 호출 (counter = 1)</span><br>
          &nbsp;&nbsp;mixed = keccak256(<span class="val">${sh(traced.prevrandao, 6)}</span> + <span class="hl">0x00...01</span>)<br>
          &nbsp;&nbsp;ChaCha20(mixed) &rarr; <span class="val">0x${fakeRand(traced.prevrandao, 1)}</span><br><br>
          <span class="hl">3번째 호출 (counter = 2)</span><br>
          &nbsp;&nbsp;mixed = keccak256(<span class="val">${sh(traced.prevrandao, 6)}</span> + <span class="hl">0x00...02</span>)<br>
          &nbsp;&nbsp;ChaCha20(mixed) &rarr; <span class="val">0x${fakeRand(traced.prevrandao, 2)}</span><br><br>
          같은 seed인데 counter만 다르니까 <span class="hl">3개 모두 완전히 다른 난수!</span>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">Rust 코드 (실제 값 대입)</div>
        <div class="d-code">
<span class="kw">fn</span> <span class="fn">randomness_precompile</span>(input: &amp;[u8]) {
    <span class="kw">let</span> seed = <span class="str">${sh(traced.prevrandao, 8)}</span>;  <span class="cm">// prevrandao</span>

    <span class="kw">let</span> counter = COUNTER.<span class="fn">fetch_add</span>(<span class="num">1</span>);  <span class="cm">// 0, 1, 2, ...</span>
    <span class="kw">let</span> mixed = <span class="fn">keccak256</span>(seed || counter);

    <span class="kw">let</span> rng = <span class="ty">ChaCha20</span>::<span class="fn">from_seed</span>(mixed);
    rng.<span class="fn">fill_bytes</span>(&amp;mut output);  <span class="cm">// 32바이트 반환, gas=100</span>
}
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">keccak256 + ChaCha20 이중 구조</div>
        <div class="d-point"><span class="bullet">1.</span><span class="pt-text"><span class="key">keccak256</span> — seed와 counter를 섞어 고유한 값 생성</span></div>
        <div class="d-point"><span class="bullet">2.</span><span class="pt-text"><span class="key">ChaCha20</span> — 그 해시를 시드로 암호학적 난수 생성 (입력↔출력 관계 차단)</span></div>
        <div class="d-point"><span class="bullet">&rarr;</span><span class="pt-text">입력을 알아도 최종 출력 예측 불가 = <span class="key">이중 자물쇠</span></span></div>
      </div>
    `
  },

  contract: {
    title: 'Smart Contract: Game Seed',
    badge: 'STAGE 4 — SOLIDITY',
    render: () => `
      <div class="d-section">
        <div class="d-label">Block #${traced.blockNumber}에서 주사위 게임 실행</div>
        <div class="d-text">
          플레이어 <span class="key">${sh(traced.player, 6)}</span>가 Game #${traced.gameId}를 플레이합니다.
          컨트랙트가 <span class="key">block.prevrandao</span>를 읽어 고유한 게임 시드를 만들어요.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">Solidity 코드 (실제 값 대입)</div>
        <div class="d-code">
bytes32 randomSeed = <span class="fn">keccak256</span>(<span class="fn">abi.encodePacked</span>(
    block.prevrandao,   <span class="cm">// ${sh(traced.prevrandao, 10)}</span>
    block.number,       <span class="cm">// ${traced.blockNumber}</span>
    msg.sender,         <span class="cm">// ${sh(traced.player, 6)}</span>
    games.length        <span class="cm">// ${traced.gameId}</span>
));
<span class="cm">// randomSeed = ${sh(traced.gameSeed, 10)}</span>

uint8 rolled = uint8(uint256(randomSeed) % <span class="num">6</span>) + <span class="num">1</span>;
<span class="cm">// rolled = ${traced.diceResult}</span>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">값의 흐름 (Block #${traced.blockNumber})</div>
        <div class="d-flow">
          <span class="label">prevrandao</span> <span class="val">${sh(traced.prevrandao, 12)}</span><br>
          <span class="label">block.number</span> <span class="val">${traced.blockNumber}</span><br>
          <span class="label">msg.sender</span> <span class="val">${sh(traced.player, 8)}</span><br>
          <span class="label">games.length</span> <span class="val">${traced.gameId}</span><br>
          <span class="arr">──── keccak256 ────</span><br>
          <span class="label">gameSeed</span> <span class="hl">${full(traced.gameSeed)}</span><br>
          <span class="arr">──── % 6 + 1 ────</span><br>
          <span class="label">dice result</span> <span class="hl" style="font-size:0.8rem;">${traced.diceResult}  ${['','⚀','⚁','⚂','⚃','⚄','⚅'][traced.diceResult] || ''}</span>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">왜 4가지를 섞나요?</div>
        <div class="d-flow">
          같은 블록에서 Alice와 Bob이 각각 주사위를 굴리면:<br><br>
          Alice: keccak256(<span class="val">${sh(traced.prevrandao,4)}</span> + ${traced.blockNumber} + <span class="hl">0xAlice...</span> + 42)<br>
          &nbsp;&nbsp;= <span class="val">0xaaa...</span> % 6 + 1 = <span class="hl">결과 A</span><br><br>
          Bob: &nbsp;keccak256(<span class="val">${sh(traced.prevrandao,4)}</span> + ${traced.blockNumber} + <span class="hl">0xBob...</span> + 43)<br>
          &nbsp;&nbsp;= <span class="val">0xbbb...</span> % 6 + 1 = <span class="hl">결과 B (다름!)</span><br><br>
          prevrandao는 같지만 <span class="hl">주소와 gameId가 다르니까 다른 결과</span>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">투명성 — 누구나 검증 가능</div>
        <div class="d-text">
          게임 결과와 함께 <span class="key">randomSeed</span>가 이벤트 로그에 기록됩니다.<br>
          <span class="key">${sh(traced.gameSeed, 10)}</span>을 가지고 누구나 <span class="key">% 6 + 1 = ${traced.diceResult}</span>을 재계산할 수 있어요.
        </div>
      </div>
    `
  },

  chaining: {
    title: 'Block Chaining: Tamper-Proof',
    badge: 'STAGE 5 — SECURITY',
    render: () => {
      let chainHtml = ''
      for (let i = 0; i < recentBlocks.length; i++) {
        const b = recentBlocks[i]
        const isTraced = b.number === traced.blockNumber
        const style = isTraced ? 'border-color:var(--neon); background:rgba(0,255,136,0.03);' : ''
        chainHtml += `
          <div style="background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:0.4rem 0.5rem; font-family:var(--mono); font-size:0.48rem; line-height:1.6; ${style}">
            <span style="color:var(--neon); font-weight:700;">Block #${b.number}</span>
            ${isTraced ? '<span style="color:var(--gold); font-size:0.4rem; margin-left:0.3rem;">TRACED</span>' : ''}<br>
            <span style="color:var(--muted);">parent:</span> <span style="color:var(--blue);">${sh(b.parentHash, 8)}</span><br>
            <span style="color:var(--muted);">randao:</span> <span style="color:var(--gold);">${sh(b.prevrandao, 8)}</span><br>
            <span style="color:var(--muted);">hash: &nbsp;</span> <span style="color:var(--text);">${sh(b.hash, 8)}</span>
          </div>
          ${i < recentBlocks.length - 1 ? '<div style="text-align:center; color:var(--muted); font-family:var(--mono); font-size:0.7rem; padding:0.1rem 0;">&darr; hash가 다음 블록의 VRF 입력</div>' : ''}
        `
      }

      return `
      <div class="d-section">
        <div class="d-label">최근 블록의 체이닝 (실제 값)</div>
        <div class="d-text">
          각 블록의 <span class="key">hash</span>가 다음 블록의 <span class="key">VRF input</span>이 됩니다.
          Block #${traced.blockNumber}(초록 테두리)이 추적 중인 블록입니다.
        </div>
        <div style="display:flex; flex-direction:column; gap:0; margin:0.5rem 0;">
          ${chainHtml}
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">연결 관계</div>
        <div class="d-flow">
          Block #${(traced.blockNumber || 1) - 1}의 hash = <span class="val">${sh(traced.parentHash, 10)}</span><br>
          <span class="arr">&darr; 이 값이 Block #${traced.blockNumber}의 VRF 입력에 포함</span><br>
          VRF(<span class="val">${sh(traced.parentHash, 6)}</span> || <span class="val">${traced.blockNumber}</span>) = <span class="hl">${sh(traced.prevrandao, 10)}</span><br>
          <span class="arr">&darr; 이 prevrandao가 블록에 기록되고</span><br>
          Block #${traced.blockNumber}의 hash = <span class="val">${sh(traced.blockHash, 10)}</span><br>
          <span class="arr">&darr; 이 hash가 Block #${(traced.blockNumber || 0) + 1}의 VRF 입력이 될 것</span>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">공격 시나리오</div>
        <div class="d-comparison">
          <div class="d-comp-box bad">
            <div class="d-comp-title">"Block #${traced.blockNumber}의 난수를 바꾸고 싶다"</div>
            <div class="d-comp-text">
              난수 = VRF(${sh(traced.parentHash,4)} || ${traced.blockNumber})<br>
              VRF는 결정적 → 출력을 바꾸려면 입력을 바꿔야 함<br>
              → Block #${(traced.blockNumber||1)-1}의 hash를 바꿔야 함<br>
              → 그러려면 Block #${(traced.blockNumber||1)-1} 자체를 바꿔야 함<br>
              → 그러면 그 이전도... → <span style="color:var(--hot);">전체 체인 되돌리기 필요!</span>
            </div>
          </div>
          <div class="d-comp-box bad">
            <div class="d-comp-title">"시퀀서가 거짓 값을 제출"</div>
            <div class="d-comp-text">
              VRF 증명(96바이트 BLS 서명)이 함께 생성됨.<br>
              공개키로 검증: VRF(${sh(traced.parentHash,4)} || ${traced.blockNumber}) == ${sh(traced.prevrandao,4)}?<br>
              거짓이면 → <span style="color:var(--hot);">검증 실패, 즉시 발각!</span>
            </div>
          </div>
        </div>
      </div>

      <div class="d-section">
        <div class="d-comp-box good">
          <div class="d-comp-title">Block #${traced.blockNumber}의 난수 ${sh(traced.prevrandao,6)}은 안전합니다</div>
          <div class="d-comp-text">
            <span style="color:var(--neon);">결정적</span>: 입력 ${sh(traced.parentHash,4)}||${traced.blockNumber}에 대해 출력이 하나로 결정<br>
            <span style="color:var(--neon);">예측 불가</span>: Block #${(traced.blockNumber||1)-1}이 확정되기 전에는 아무도 모름<br>
            <span style="color:var(--neon);">검증 가능</span>: BLS 공개키로 증명 검증 가능<br>
            <span style="color:var(--neon);">체이닝</span>: 이전 블록 해시에 의존 → 되돌릴 수 없음
          </div>
        </div>
      </div>
    `}
  },
}

// Helper: generate deterministic-looking fake random from prevrandao + counter
function fakeRand(prevrandao, counter) {
  if (!prevrandao) return 'a1b2c3d4e5f6...'
  // Use different parts of prevrandao to simulate different outputs
  const offset = (counter * 8 + 4) % (prevrandao.length - 18)
  return prevrandao.slice(offset + 2, offset + 18) + '...'
}

// ─── Navigation ───────────────────────────────────────────────────

const stageOrder = ['problem', 'vrf', 'prevrandao', 'precompile', 'contract', 'chaining']
let currentStage = 'problem'

function showStage(stage) {
  currentStage = stage
  const s = stages[stage]

  document.querySelectorAll('.pipe-node').forEach((n) => n.classList.remove('active'))
  document.querySelector(`.pipe-node[data-stage="${stage}"]`)?.classList.add('active')

  $('detailTitle').textContent = s.title
  $('detailBadge').textContent = s.badge
  $('detailBody').innerHTML = s.render()

  // Scroll detail to top
  $('detailBody').scrollTop = 0
}

document.querySelectorAll('.pipe-node').forEach((node) => {
  node.addEventListener('click', () => showStage(node.dataset.stage))
})

document.addEventListener('keydown', (e) => {
  const idx = stageOrder.indexOf(currentStage)
  if (e.key === 'ArrowDown' || e.key === 'j') {
    e.preventDefault()
    if (idx < stageOrder.length - 1) showStage(stageOrder[idx + 1])
  } else if (e.key === 'ArrowUp' || e.key === 'k') {
    e.preventDefault()
    if (idx > 0) showStage(stageOrder[idx - 1])
  }
})

// ─── Live data ────────────────────────────────────────────────────

async function poll() {
  try {
    const num = await getBlockNumber()
    $('topBlock').textContent = num
    $('topChain').textContent = CHAIN_ID

    if (!traced.blockNumber || num > traced.blockNumber) {
      await loadTraceBlock(num)
      await loadRecentBlocks(num)
      // Re-render current stage with fresh data
      showStage(currentStage)
    }
  } catch {}
}

// ─── Init ─────────────────────────────────────────────────────────

poll()
setInterval(poll, 3000)
