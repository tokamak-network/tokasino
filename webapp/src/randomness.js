// Tokasino Randomness Deep Dive — interactive pipeline explainer

import { getReadProvider, getBlockNumber, formatEther } from './appkit.js'
import { CHAIN_ID, RPC_URL } from './config.js'
import { JsonRpcProvider } from 'ethers'

const $ = (id) => document.getElementById(id)
const provider = new JsonRpcProvider(RPC_URL)

function sh(h, n = 10) {
  if (!h || h.length < 20) return h || '--'
  return h.slice(0, n + 2) + '...' + h.slice(-n)
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
        <div class="d-label">Tokasino의 해결책</div>
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
    `
  },

  vrf: {
    title: 'VRF: BLS12-381 Signing',
    badge: 'STAGE 1 — CONSENSUS',
    render: (block) => `
      <div class="d-section">
        <div class="d-label">VRF란?</div>
        <div class="d-text">
          <span class="key">VRF</span> = Verifiable Random Function (검증 가능한 난수 함수)<br><br>
          일반 서명과 비슷하지만, 결과가 <span class="key">랜덤처럼 보이면서도 검증 가능</span>합니다.
          비밀키 소유자만 만들 수 있지만, 공개키로 누구나 진위를 확인할 수 있어요.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">입력값 구성</div>
        <div class="d-text">
          매 블록마다 시퀀서가 아래 두 값을 이어붙여 VRF 입력을 만듭니다:
        </div>
        <div class="d-flow">
          <span class="label">parent_hash</span> <span class="val">${block ? sh(block.parentHash, 14) : '0xabcd...'}</span><br>
          <span class="label">block_number</span> <span class="val">${block ? block.number : 'N'}</span><br>
          <span class="arr">&darr;&darr;&darr;</span><br>
          <span class="label">VRF input</span> <span class="hl">parent_hash || block_number</span>
        </div>
        <div class="d-text" style="margin-top:0.3rem;">
          <span class="key">parent_hash</span>를 쓰는 이유: 이전 블록의 결과가 다음 블록의 난수 입력이 됩니다.
          즉, 누군가가 난수를 조작하려면 <span class="key">이전 블록 자체를 바꿔야</span> 하는데, 이미 확정된 블록은 바꿀 수 없어요.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">BLS12-381 서명</div>
        <div class="d-text">
          VRF 입력값을 <span class="key">BLS12-381</span> 비밀키로 서명합니다.
        </div>
        <div class="d-code">
<span class="cm">// Rust — vrf.rs</span>
<span class="kw">const</span> DST: &amp;[<span class="ty">u8</span>] = <span class="str">b"TOKASINO-VRF-V1"</span>;

<span class="kw">pub fn</span> <span class="fn">prove</span>(&amp;self, input: &amp;[<span class="ty">u8</span>]) {
    <span class="kw">let</span> signature = self.secret_key
        .<span class="fn">sign</span>(input, DST, &amp;[]);
    <span class="cm">// signature = 96바이트 BLS 서명 (=VRF 증명)</span>

    <span class="kw">let</span> output = <span class="fn">keccak256</span>(&amp;signature);
    <span class="cm">// output = 32바이트 VRF 출력 (=prevrandao)</span>
}
        </div>
        <div class="d-text">
          <span class="key">DST</span>(Domain Separation Tag)는 <span class="gold">"TOKASINO-VRF-V1"</span>으로,
          다른 용도의 BLS 서명과 충돌하지 않도록 구분하는 태그입니다.<br><br>
          왜 <span class="key">BLS12-381</span>인가요?<br>
        </div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text">이더리움 2.0 비콘체인이 사용하는 것과 <span class="key">같은 곡선</span> — 검증됨</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text">서명이 <span class="key">결정적</span> — 같은 키+입력이면 항상 같은 서명</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text">서명 크기가 작음 (<span class="key">96바이트</span>) — 효율적</span></div>
      </div>
    `
  },

  prevrandao: {
    title: 'prevrandao: Block Random Field',
    badge: 'STAGE 2 — BLOCK',
    render: (block) => {
      const prevrandao = block?.prevrandao
        ? '0x' + BigInt(block.prevrandao).toString(16).padStart(64, '0')
        : null
      return `
      <div class="d-section">
        <div class="d-label">prevrandao란?</div>
        <div class="d-text">
          모든 이더리움 블록 헤더에는 <span class="key">prevrandao</span> 필드가 있습니다.
          원래 이더리움에서는 비콘체인의 RANDAO 믹스 값이 여기에 들어갑니다.<br><br>
          Tokasino에서는 이 필드에 <span class="key">시퀀서가 VRF로 계산한 32바이트 난수</span>를 넣습니다.
          즉, 기존 이더리움 인프라를 그대로 활용하면서 더 안전한 난수를 제공하는 것입니다.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">현재 블록의 실제 값</div>
        <div class="d-live">
          <div class="d-live-cell">
            <div class="d-live-label">Block</div>
            <div class="d-live-val" id="livePrevBlock">${block ? block.number : '--'}</div>
          </div>
          <div class="d-live-cell">
            <div class="d-live-label">Parent Hash</div>
            <div class="d-live-val sm">${block ? sh(block.parentHash, 8) : '--'}</div>
          </div>
          <div class="d-live-cell">
            <div class="d-live-label">prevrandao</div>
            <div class="d-live-val sm">${prevrandao ? sh(prevrandao, 8) : '--'}</div>
          </div>
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">VRF 출력 → prevrandao 전달 과정</div>
        <div class="d-flow">
          <span class="label">1. CL 계산</span> VRF(parent_hash || block_num) = <span class="val">32바이트</span><br>
          <span class="arr">&darr;</span><br>
          <span class="label">2. Engine API</span> <span class="hl">engine_forkchoiceUpdatedV3</span> 호출<br>
          <span class="label"></span> payloadAttributes.<span class="hl">prevRandao</span> = VRF 출력<br>
          <span class="arr">&darr;</span><br>
          <span class="label">3. EL 수신</span> op-reth가 블록 헤더에 prevrandao 기록<br>
          <span class="arr">&darr;</span><br>
          <span class="label">4. Solidity</span> <span class="hl">block.prevrandao</span> 로 읽을 수 있음!
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">prevrandao의 핵심 성질</div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">블록당 하나</span> — 같은 블록의 모든 TX가 같은 값을 봄</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">사전 예측 불가</span> — 블록이 생성되기 전까지 아무도 모름</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">사후 검증 가능</span> — VRF 공개키 + 이전 블록 해시로 누구나 확인</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">시퀀서도 조작 불가</span> — VRF는 결정적 함수. 다른 값을 내면 증명이 실패</span></div>
      </div>
    `}
  },

  precompile: {
    title: 'Precompile 0x0b: Per-Call Randomness',
    badge: 'STAGE 3 — EVM',
    render: () => `
      <div class="d-section">
        <div class="d-label">왜 프리컴파일이 필요한가?</div>
        <div class="d-text">
          prevrandao는 블록당 <span class="key">하나의 고정값</span>입니다.
          만약 한 블록에서 주사위 게임 3판이 실행되면, 셋 다 같은 prevrandao를 보게 됩니다.
          이러면 <span class="key">같은 난수가 나와서</span> 게임이 되지 않아요.<br><br>
          프리컴파일 0x0b는 이 문제를 해결합니다: <span class="key">매 호출마다 다른 난수</span>를 만들어줍니다.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">내부 동작 (Rust 코드)</div>
        <div class="d-code">
<span class="cm">// evm.rs — 프리컴파일 구현</span>
<span class="kw">static</span> COUNTER: <span class="ty">AtomicU64</span> = <span class="ty">AtomicU64</span>::<span class="fn">new</span>(<span class="num">0</span>);

<span class="kw">fn</span> <span class="fn">randomness_precompile</span>(input: &amp;[<span class="ty">u8</span>]) {
    <span class="cm">// 1. seed 추출 (최대 32바이트)</span>
    <span class="kw">let mut</span> seed = [<span class="num">0u8</span>; <span class="num">32</span>];
    seed[..len].<span class="fn">copy_from_slice</span>(&amp;input);

    <span class="cm">// 2. 카운터를 섞어 고유한 해시 생성</span>
    <span class="kw">let</span> counter = COUNTER.<span class="fn">fetch_add</span>(<span class="num">1</span>, Relaxed);
    <span class="kw">let</span> mixed = <span class="fn">keccak256</span>(seed || counter);

    <span class="cm">// 3. ChaCha20 CSPRNG에 시드 투입</span>
    <span class="kw">let mut</span> rng = <span class="ty">ChaCha20Rng</span>::<span class="fn">from_seed</span>(mixed);

    <span class="cm">// 4. 32바이트 난수 생성 &amp; 반환</span>
    rng.<span class="fn">fill_bytes</span>(&amp;<span class="kw">mut</span> output); <span class="cm">// gas: 100</span>
}
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">카운터가 하는 일 (구체적 예시)</div>
        <div class="d-flow">
          같은 블록에서 3번 호출하면:<br><br>
          <span class="label">1번째 호출</span> keccak256(seed + <span class="hl">counter=0</span>) &rarr; ChaCha20 &rarr; <span class="val">0xa1b2...</span><br>
          <span class="label">2번째 호출</span> keccak256(seed + <span class="hl">counter=1</span>) &rarr; ChaCha20 &rarr; <span class="val">0xc3d4...</span><br>
          <span class="label">3번째 호출</span> keccak256(seed + <span class="hl">counter=2</span>) &rarr; ChaCha20 &rarr; <span class="val">0xe5f6...</span><br><br>
          seed는 같지만, counter가 다르므로 <span class="hl">완전히 다른 난수 3개</span>!
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">왜 keccak256 + ChaCha20 이중 구조인가?</div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">keccak256만 쓰면</span> — 입력(seed+counter)을 아는 사람이 출력을 계산할 수 있음</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">ChaCha20을 거치면</span> — 입력↔출력 관계가 끊어져서, seed를 알아도 최종 난수 예측 불가</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text">ChaCha20은 Google이 <span class="key">TLS/HTTPS</span>에 쓰는 암호학적 난수 생성기</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text">이 모든 과정이 네이티브 코드라 가스비 단 <span class="key">100</span></span></div>
      </div>
    `
  },

  contract: {
    title: 'Smart Contract: Game Seed',
    badge: 'STAGE 4 — SOLIDITY',
    render: () => `
      <div class="d-section">
        <div class="d-label">컨트랙트에서 난수 사용하기</div>
        <div class="d-text">
          게임 컨트랙트는 <span class="key">block.prevrandao</span>를 직접 읽어서
          플레이어별, 게임별로 고유한 난수를 만듭니다.
          프리컴파일 0x0b를 호출하지 않고도 쓸 수 있어요.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">InstantDice 예시</div>
        <div class="d-code">
<span class="kw">function</span> <span class="fn">play</span>(<span class="ty">uint8</span> chosenNumber) <span class="kw">external payable</span> {
    <span class="ty">bytes32</span> randomSeed = <span class="fn">keccak256</span>(
        <span class="fn">abi.encodePacked</span>(
            block.<span class="fn">prevrandao</span>,  <span class="cm">// VRF 출력 (블록당 고정)</span>
            block.number,       <span class="cm">// 현재 블록 번호</span>
            msg.sender,         <span class="cm">// 플레이어 주소</span>
            games.length        <span class="cm">// 게임 ID (매 게임마다 증가)</span>
        )
    );

    <span class="cm">// randomSeed를 6으로 나눈 나머지 + 1 = 주사위 결과</span>
    <span class="ty">uint8</span> rolled = <span class="ty">uint8</span>(<span class="ty">uint256</span>(randomSeed) % <span class="num">6</span>) + <span class="num">1</span>;
}
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">왜 prevrandao만 안 쓰고 4가지를 섞나요?</div>
        <div class="d-flow">
          prevrandao만 쓰면:<br>
          &nbsp;&nbsp;같은 블록에서 Alice와 Bob이 주사위를 굴리면 <span style="color:var(--hot);">같은 결과!</span><br><br>
          4가지를 섞으면:<br>
          &nbsp;&nbsp;Alice: keccak256(prevrandao + block + <span class="hl">Alice주소</span> + gameId) = <span class="val">다른 결과</span><br>
          &nbsp;&nbsp;Bob: &nbsp;keccak256(prevrandao + block + <span class="hl">Bob주소</span> + gameId) = <span class="val">다른 결과</span>
        </div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">prevrandao</span> — 블록 수준의 난수 (VRF 보장)</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">block.number</span> — 다른 블록이면 다른 결과</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">msg.sender</span> — 다른 플레이어면 다른 결과</span></div>
        <div class="d-point"><span class="bullet">&bull;</span><span class="pt-text"><span class="key">games.length</span> — 같은 사람이 같은 블록에서 두 번 해도 다른 결과</span></div>
      </div>

      <div class="d-section">
        <div class="d-label">투명성</div>
        <div class="d-text">
          게임 결과와 함께 <span class="key">randomSeed</span>가 이벤트 로그에 기록됩니다.
          누구나 이 seed를 가지고 결과를 <span class="key">재계산</span>해서 게임이 공정했는지 검증할 수 있어요.
        </div>
      </div>
    `
  },

  chaining: {
    title: 'Block Chaining: Tamper-Proof',
    badge: 'STAGE 5 — SECURITY',
    render: (block) => `
      <div class="d-section">
        <div class="d-label">블록 체이닝이 왜 중요한가?</div>
        <div class="d-text">
          각 블록의 VRF 입력에는 <span class="key">이전 블록의 해시</span>가 포함됩니다.
          이건 블록체인의 해시 체인과 VRF 난수 체인이 <span class="key">하나로 엮인다</span>는 뜻이에요.
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">체이닝 구조</div>
        <div class="d-flow">
          <span class="hl">Block N-1</span><br>
          &nbsp;&nbsp;hash = <span class="val">0xabc1...</span><br>
          &nbsp;&nbsp;&darr;<br>
          <span class="hl">Block N</span><br>
          &nbsp;&nbsp;VRF input = <span class="val">0xabc1...</span> || N<br>
          &nbsp;&nbsp;prevrandao = VRF(<span class="val">0xabc1...</span> || N) = <span class="val">0x3f7e...</span><br>
          &nbsp;&nbsp;hash = <span class="val">0xdef2...</span><br>
          &nbsp;&nbsp;&darr;<br>
          <span class="hl">Block N+1</span><br>
          &nbsp;&nbsp;VRF input = <span class="val">0xdef2...</span> || N+1<br>
          &nbsp;&nbsp;prevrandao = VRF(<span class="val">0xdef2...</span> || N+1) = <span class="val">0x91a4...</span><br>
          &nbsp;&nbsp;&darr; ...계속
        </div>
      </div>

      <div class="d-section">
        <div class="d-label">공격 시나리오와 방어</div>
        <div class="d-comparison">
          <div class="d-comp-box bad">
            <div class="d-comp-title">공격: "Block N의 난수를 바꾸고 싶다"</div>
            <div class="d-comp-text">
              VRF는 결정적 → 입력이 같으면 출력이 같음.
              난수를 바꾸려면 입력(이전 블록 해시)을 바꿔야 함.
              이전 블록을 바꾸려면 그 이전도... → 체인 전체를 뒤집어야 함!
            </div>
          </div>
          <div class="d-comp-box bad">
            <div class="d-comp-title">공격: "시퀀서가 다른 값을 제출"</div>
            <div class="d-comp-text">
              VRF 증명(96바이트 BLS 서명)과 공개키로 검증 가능.
              올바르지 않은 난수 → 증명 검증 실패 → 즉시 발각.
            </div>
          </div>
        </div>
        <div class="d-comp-box good" style="margin-top:0.5rem;">
          <div class="d-comp-title">결론: 시퀀서도 난수를 조작할 수 없다</div>
          <div class="d-comp-text">
            입력이 정해지면 출력이 하나로 결정됨 (결정적).<br>
            출력을 미리 알 수 없음 (예측 불가).<br>
            다른 값을 주장하면 증명으로 들통남 (검증 가능).<br>
            이전 블록에 의존하므로 체인을 되돌려야 함 (체이닝).<br><br>
            이 4가지 성질이 합쳐져서 <span style="color:var(--neon); font-weight:700;">trustless on-chain randomness</span>가 됩니다.
          </div>
        </div>
      </div>
    `
  },
}

// ─── Navigation ───────────────────────────────────────────────────

const stageOrder = ['problem', 'vrf', 'prevrandao', 'precompile', 'contract', 'chaining']
let currentStage = 'problem'
let latestBlock = null

function showStage(stage) {
  currentStage = stage
  const s = stages[stage]

  // Update active node
  document.querySelectorAll('.pipe-node').forEach((n) => n.classList.remove('active'))
  document.querySelector(`.pipe-node[data-stage="${stage}"]`)?.classList.add('active')

  // Update detail
  $('detailTitle').textContent = s.title
  $('detailBadge').textContent = s.badge
  $('detailBody').innerHTML = s.render(latestBlock)
}

// Click handlers
document.querySelectorAll('.pipe-node').forEach((node) => {
  node.addEventListener('click', () => showStage(node.dataset.stage))
})

// Keyboard nav
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
    const block = await provider.getBlock(num)
    latestBlock = block

    $('topBlock').textContent = num
    $('topChain').textContent = CHAIN_ID

    const prevrandao = block?.prevrandao
      ? '0x' + BigInt(block.prevrandao).toString(16).padStart(64, '0')
      : null

    $('valVrfInput').textContent = sh(block.parentHash, 6) + ' || ' + num
    $('valPrevrandao').textContent = prevrandao ? sh(prevrandao, 6) : '--'

    // Re-render current stage with fresh data
    const s = stages[currentStage]
    $('detailBody').innerHTML = s.render(latestBlock)
  } catch {}
}

// ─── Init ─────────────────────────────────────────────────────────

showStage('problem')
poll()
setInterval(poll, 3000)
