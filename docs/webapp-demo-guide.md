# Tokasino 웹앱 & 데모 가이드

## 1. 전체 구조 요약

Tokasino는 **온체인 카지노를 위한 커스텀 블록체인**입니다.

핵심 문제는: 블록체인에서 공정한 난수(랜덤)를 어떻게 만들 것인가?

### 3줄 요약

1. **시퀀서(블록 생성자)**가 매 블록마다 VRF라는 암호학적 서명으로 난수를 만듭니다
2. 그 난수가 블록에 기록되면, **스마트 컨트랙트**가 읽어서 게임 결과를 정합니다
3. **웹앱**에서 플레이어가 베팅하면 한 트랜잭션으로 즉시 결과가 나옵니다

---

## 2. 아키텍처

```
┌─────────────────────────────────────────────────┐
│  웹앱 (Vanilla JS + Vite + ethers.js)           │
│  index / dice / coinflip / roulette / lottery   │
└────────────────────┬────────────────────────────┘
                     │ JSON-RPC (port 8545)
                     ▼
┌─────────────────────────────────────────────────┐
│  실행 레이어 EL (op-reth 포크)                    │
│  • 랜덤 프리컴파일 0x0b (ChaCha20 CSPRNG)       │
│  • 4개 게임 컨트랙트                              │
└────────────────────┬────────────────────────────┘
                     │ Engine API (port 8551)
                     ▼
┌─────────────────────────────────────────────────┐
│  합의 레이어 CL (커스텀 시퀀서)                    │
│  • BLS12-381 VRF로 매 블록 난수 생성              │
│  → block.prevrandao에 VRF 출력값 주입            │
└─────────────────────────────────────────────────┘
```

---

## 3. 난수 파이프라인 (단계별)

### Stage 1: 실행 레이어 (EL)

- 이더리움의 Geth 같은 역할의 **스마트 컨트랙트 실행 엔진**
- **op-reth**를 포크해서 커스텀
- 주소 **0x0b**에 **난수 생성 프리컴파일**을 추가

#### 프리컴파일이란?

솔리디티로 짜면 느리거나 불가능한 연산을 **EVM 엔진 내부에 네이티브 코드로 미리 구현**해둔 것. 특정 주소를 호출하면 바로 실행됩니다.

이더리움 기존 프리컴파일:
- 0x01 = ecrecover (서명 복원)
- 0x02 = SHA-256 해시
- 0x05 = modexp (큰 수 거듭제곱)
- ... 0x0a까지 사용 중

**왜 0x0b?** 기존이 0x0a까지 사용 중이라 충돌 없이 바로 다음 번호(0x0b = 11번)에 배치.

#### 난수 프리컴파일 동작 과정

```
seed(prevrandao) + counter(호출마다 증가)
    ↓ keccak256
0x91f3a7... (32바이트 해시)
    ↓ ChaCha20 시드로 사용
0x7d2e3f... (32바이트 최종 난수)
    가스비: 100 (네이티브 코드라 초고속)
```

- **카운터**: 같은 블록에서 여러 번 호출해도 매번 다른 난수가 나오도록 보장
- **ChaCha20**: Google이 TLS에 쓰는 암호학적 난수 생성기. keccak256 + ChaCha20 이중 구조로 보안 강화

### Stage 2: VRF 키 생성

- **VRF** = Verifiable Random Function (검증 가능한 난수 함수)
- **BLS12-381** 암호 알고리즘으로 키쌍(비밀키 + 공개키) 생성
- DST(Domain Separation Tag): `TOKASINO-VRF-V1`

핵심 성질:
- **결정적**: 같은 입력 → 항상 같은 출력 (시퀀서가 마음대로 바꿀 수 없음)
- **예측 불가**: 비밀키 없이는 출력을 예측할 수 없음
- **검증 가능**: 공개키로 누구나 "이 난수가 진짜인지" 확인 가능

### Stage 3: Engine API 연결

- CL(합의 레이어)이 EL(실행 레이어)에게 블록을 만들라고 지시하는 통로
- JWT(HS256) 인증
- 주요 메서드: `forkchoiceUpdatedV3`, `getPayloadV3`, `newPayloadV3`
- CL이 VRF로 만든 난수를 **prevRandao** 필드에 넣어서 EL에 전달

### Stage 4: 블록 생성

매 블록마다:

```
VRF input = 이전 블록 해시 + 블록 번호
    ↓ BLS12-381 비밀키로 서명
96바이트 BLS 서명 (= VRF 증명)
    ↓ keccak256
32바이트 VRF 출력 = prevrandao
    ↓ Engine API로 EL에 전달
블록 헤더에 기록 → 솔리디티에서 block.prevrandao로 읽기 가능
```

#### 블록 체이닝

```
Block N-1 → hash(0xabc1...)
    ↓
Block N: VRF(0xabc1... || N) = prevrandao(0x3f7e...)
    → hash(0xdef2...)
    ↓
Block N+1: VRF(0xdef2... || N+1) = prevrandao(0x91a4...)
    → ...계속
```

각 블록의 해시가 다음 블록의 VRF 입력이 되므로, 어떤 블록의 난수도 조작할 수 없는 구조.

### Stage 5: 게임 컨트랙트

```solidity
bytes32 randomSeed = keccak256(abi.encodePacked(
    block.prevrandao,   // VRF 출력 (블록당 고정)
    block.number,       // 현재 블록 번호
    msg.sender,         // 플레이어 주소
    games.length        // 게임 ID
));

uint8 rolled = uint8(uint256(randomSeed) % 6) + 1;  // 주사위 결과
```

4가지를 섞는 이유:
- **prevrandao**: 블록 수준의 난수 (VRF 보장)
- **block.number**: 다른 블록이면 다른 결과
- **msg.sender**: 다른 플레이어면 다른 결과
- **games.length**: 같은 사람이 같은 블록에서 두 번 해도 다른 결과

### Stage 6: 컨트랙트 배포

| 컨트랙트 | 게임 | 배당 | 하우스 펀딩 |
|----------|------|------|-----------|
| InstantDice | 1-6 선택 주사위 | 5x | 10 ETH |
| CoinFlip | 앞/뒤 동전 | 1.95x | 10 ETH |
| Roulette | 유러피안 룰렛 | 최대 36x | 10 ETH |
| Lottery | 라운드제 복권 | 상금풀 | 티켓 판매 |

---

## 4. 왜 안전한가?

- **시퀀서도 조작 불가**: VRF는 결정적 함수라서 입력이 정해지면 출력이 하나로 결정됨
- **예측 불가**: 이전 블록이 확정되기 전까지 다음 난수를 아무도 모름
- **검증 가능**: BLS 공개키로 VRF 증명을 검증할 수 있음
- **체이닝**: 블록 N의 해시 → 블록 N+1의 입력 → 연쇄적으로 연결되어 되돌릴 수 없음

---

## 5. 웹앱 페이지 구성

### 데모 관련 페이지

| 페이지 | URL | 설명 |
|--------|-----|------|
| **Setup** | `/setup.html` | 시퀀서 부팅 과정을 단계별로 시뮬레이션. 각 단계마다 한국어 말풍선 설명 포함. NEXT STEP 버튼으로 하나씩 진행. |
| **Demo** | `/demo.html` | 실시간 VRF 파이프라인 대시보드. 블록 생성 시 6단계 파이프라인 애니메이션. 주사위 게임 직접 플레이 가능 (Hardhat 기본 계정 사용, 지갑 연결 불필요). |
| **Randomness** | `/randomness.html` | 난수 생성 과정을 실제 블록 데이터 값으로 단계별 설명. 좌측 파이프라인 클릭 → 우측에 상세 설명 + 실제 hex 값 표시. |

### 게임 페이지

| 페이지 | URL | 설명 |
|--------|-----|------|
| **Hub** | `/index.html` | 4개 게임 카드 + 하우스 잔고/게임 수 실시간 표시 |
| **Dice** | `/dice.html` | 1-6 선택, 5x 배당, 즉시 결과 |
| **Coin Flip** | `/coinflip.html` | 앞/뒤 선택, 1.95x 배당 |
| **Roulette** | `/roulette.html` | 유러피안 룰렛, 최대 36x |
| **Lottery** | `/lottery.html` | 라운드제 복권, 0-99 번호 선택 |

### 데모 흐름 (권장 순서)

1. **Setup** → START 버튼으로 시퀀서 부팅 과정 체험 (각 단계 말풍선 읽기)
2. **Randomness** → 난수 파이프라인 각 Stage 클릭하며 실제 값으로 이해
3. **Demo** → 실시간 블록 + VRF 애니메이션 보면서 주사위 게임 플레이
4. **Game Hub** → 4개 게임 직접 체험

---

## 6. 기술 스택

| 영역 | 기술 |
|------|------|
| 실행 레이어 | op-reth 포크 (Rust) |
| 합의 레이어 | 커스텀 시퀀서 (Rust, Tokio) |
| VRF | BLS12-381 (blst 라이브러리) |
| 프리컴파일 | ChaCha20 CSPRNG (rand_chacha) |
| 스마트 컨트랙트 | Solidity 0.8.28, Foundry |
| 웹앱 | Vanilla JS, Vite, ethers.js v6 |
| 지갑 연결 | Reown AppKit + EthersAdapter |
| 체인 | Chain ID 7777, RPC localhost:8545 |

---

## 7. 로컬 실행

```bash
# 1. 노드 실행 (별도 터미널)
# EL + CL이 실행 중이어야 합니다

# 2. 컨트랙트 배포
./scripts/deploy-contracts.sh

# 3. 웹앱 실행
cd webapp
npm install
npx vite dev

# 4. 브라우저에서 열기
# http://localhost:5173/setup.html  (데모 시작)
# http://localhost:5173/demo.html   (실시간 대시보드)
# http://localhost:5173/randomness.html (난수 설명)
```
