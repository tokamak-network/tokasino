# Enshrined VRF: Randomness-Native OP Stack L2 Deep Dive

## 1. 왜 Enshrined VRF가 필요한가?

### 온체인 카지노는 왜 어려운가

블록체인에서 카지노나 갬블링 dApp을 만들려면 **랜덤 숫자**가 필요하다. 주사위를 굴리거나, 카드를 섞거나, 룰렛 결과를 정하려면 누구도 예측하거나 조작할 수 없는 랜덤값이 있어야 한다.

하지만 블록체인은 본질적으로 **결정적(deterministic)** 시스템이다. 모든 노드가 같은 입력에 대해 같은 결과를 내야 합의가 성립한다. 이 구조에서 "진짜 랜덤"을 만드는 것은 근본적인 도전이다.

### 기존 솔루션들의 한계

#### 문제 1: Ethereum의 PREVRANDAO는 조작 가능하다

Ethereum은 The Merge 이후 `PREVRANDAO`라는 값을 블록마다 제공한다. 이 값은 밸리데이터들의 RANDAO 믹스에서 나온다. 언뜻 보면 랜덤처럼 보이지만, 심각한 문제가 있다.

블록을 제안하는 밸리데이터는 자신의 RANDAO reveal 값을 알고 있다. 이 밸리데이터는 두 가지 선택지가 있다: (1) 블록을 정상적으로 제안하거나, (2) 블록 제안을 포기하거나. 블록 제안을 포기하면 PREVRANDAO 값이 달라진다. 즉, 밸리데이터는 최소 **1비트의 영향력**을 행사할 수 있다.

더 심각한 경우, 연속된 슬롯을 담당하는 밸리데이터가 있다면 여러 개의 가능한 PREVRANDAO 값 중에서 자신에게 유리한 것을 골라낼 수 있다. 이것은 높은 금액이 걸린 카지노에서는 치명적인 취약점이다.

EIP-4399의 Security Considerations 섹션에서도 이 문제를 명시적으로 경고하고 있다. PREVRANDAO는 "이전보다 강하지만, 여전히 편향 가능한(biasable)" 랜덤 소스라고 설명한다.

#### 문제 2: Chainlink VRF는 비용과 지연이 크다

Chainlink VRF(Verifiable Random Function)는 현재 가장 널리 쓰이는 온체인 랜덤 솔루션이다. 오프체인에서 랜덤값을 생성하고, 그 값이 올바르게 생성되었음을 수학적으로 증명하는 방식이다.

하지만 실질적인 문제가 있다:

- **비용**: 매 요청마다 LINK 토큰을 지불해야 한다. 카지노처럼 매 베팅마다 랜덤이 필요한 경우, 이 비용이 빠르게 쌓인다.
- **지연**: 랜덤값 요청 후 최소 1~2블록을 기다려야 콜백을 받는다. 사용자 경험이 나빠진다.
- **외부 의존성**: Chainlink 노드 네트워크가 다운되거나 지연되면 dApp도 영향을 받는다.
- **복잡한 통합**: Request-Response 패턴을 구현해야 하므로 컨트랙트 구조가 복잡해진다.

#### 문제 3: Revert 공격으로 즉시 랜덤은 갬블링에 쓸 수 없다

가장 미묘하지만 중요한 문제가 있다. 스마트 컨트랙트에서 랜덤값을 즉시 받아서 결과를 정하면, 공격자는 결과가 불리할 때 트랜잭션을 **revert**(되돌리기)할 수 있다.

예를 들어, 공격자가 다음과 같은 컨트랙트를 만든다고 하자:

```solidity
function attack(Casino casino) external {
    casino.placeBet(100 ether);
    // 내부적으로 랜덤값을 받아서 결과가 정해짐
    // 만약 졌다면...
    require(casino.lastResult() == WIN, "다시 시도");
    // 이겼을 때만 트랜잭션이 성공
}
```

이런 공격이 가능한 이유는 랜덤값 생성과 결과 확인이 **같은 트랜잭션** 안에서 일어나기 때문이다. 공격자는 원하는 결과가 나올 때까지 계속 시도할 수 있다.

Chainlink VRF 공식 문서에서도 이 문제를 명시적으로 경고한다: "fulfillRandomness 구현이 revert되면, VRF 서비스는 다시 호출을 시도하지 않습니다."

Aptos 블록체인은 이 문제를 "test-and-abort 공격"이라고 부르며, VM 레벨에서 방어하는 방식을 도입했다.

### Enshrined VRF가 해결하려는 것

Enshrined VRF의 목표는 명확하다: **프로토콜 레벨에 검증 가능한 랜덤성을 내장한 L2 체인**을 만들어서, 위의 세 가지 문제를 모두 해결하는 것이다.

- 조작 불가능한 랜덤 (VRF + DRB로 밸리데이터 편향 제거)
- 비용 제로, 즉시 사용 (프로토콜에 내장되어 오라클 불필요)
- Revert 공격 방어 (시스템 콜 + Commit-Reveal 패턴)

---

## 2. Enshrined VRF의 아키텍처

### OP Stack을 기반으로 하는 이유

Enshrined VRF는 독립 체인이 아니라 **OP Stack L2**이다. OP Stack은 Optimism이 만든 L2 프레임워크로, 다음과 같은 인프라를 기본으로 제공한다:

- **L1-L2 브릿지**: Ethereum과 자산을 주고받는 표준화된 방법
- **L1 정산**: L2의 상태를 L1에 주기적으로 기록하여 보안을 상속
- **배치 제출**: L2 트랜잭션 데이터를 L1에 압축 저장
- **Fault Proof**: L2 상태 전환의 정확성을 L1에서 검증 가능

만약 독자적인 L1 체인을 만든다면, 이 모든 것을 처음부터 구축해야 한다. OP Stack을 사용하면 랜덤성이라는 핵심 기능에만 집중할 수 있다.

### 전체 구조

Enshrined VRF의 아키텍처는 크게 세 계층으로 나뉜다:

#### 계층 1: OP Stack 인프라 (Go)

표준 OP Stack 컴포넌트들이 그대로 사용된다:

- **op-node**: L1에서 데이터를 읽어 L2 블록을 파생(derivation)하는 합의 레이어 클라이언트. 시퀀서 역할도 수행한다.
- **op-batcher**: L2 트랜잭션 배치를 L1에 제출하는 서비스.
- **op-proposer**: L2 상태의 output root를 L1에 제안하는 서비스.

이 컴포넌트들은 수정 없이 사용되며, Enshrined VRF의 랜덤성 기능은 전적으로 실행 레이어(EL)에서 처리된다.

#### 계층 2: Enshrined VRF 실행 레이어 (Rust)

표준 OP Stack에서 실행 레이어는 op-geth나 op-reth를 사용한다. Enshrined VRF는 **op-reth를 포크**하여 랜덤성 기능을 추가한다. op-reth는 Rust로 작성된 OP Stack 실행 클라이언트로, 성능과 안정성이 뛰어나다.

Enshrined VRF가 op-reth에 추가하는 것은 세 가지다:

1. **랜덤성 프리컴파일 (주소 0x0b)**: EVM에 새로운 프리컴파일드 컨트랙트를 추가하여, 스마트 컨트랙트가 즉시 랜덤값을 얻을 수 있게 한다.
2. **RandomBeaconHistory 시스템 콜**: 매 블록마다 시스템 주소에서 RandomBeaconHistory 컨트랙트에 해당 블록의 랜덤값을 기록한다.
3. **VRF prevRandao 오버라이드**: 페이로드 빌더에서 prev_randao 값을 VRF 출력으로 대체한다.

#### 계층 3: 합의 레이어 — 랜덤성 생성 (Rust)

op-node가 Engine API를 통해 EL에 블록 생성을 요청할 때, payload attributes에 `prevRandao` 값을 포함한다. Enshrined VRF의 CL은 이 값을 VRF 또는 DRB(Distributed Random Beacon)로 생성한다.

두 가지 모드를 지원한다:

- **VRF 모드**: 단일 시퀀서가 BLS12-381 VRF로 랜덤값을 생성. 간단하지만 시퀀서 신뢰가 필요.
- **DRB 모드**: 여러 노드가 Threshold BLS 서명을 통해 분산 랜덤값을 생성. 1-of-N 정직성만으로 보안 보장.

### Engine API를 통한 CL-EL 연결

OP Stack에서 CL(op-node)과 EL(op-reth)은 **Engine API**로 통신한다. 이 API는 Ethereum의 표준 인터페이스이다.

블록 생성 흐름은 다음과 같다:

1. CL이 `engine_forkchoiceUpdatedV3`를 호출하면서 `payloadAttributes`를 전달한다. 여기에 `prevRandao` 값이 포함된다.
2. EL이 페이로드를 빌드한다. 이때 Enshrined VRF의 EL은 전달받은 `prevRandao`를 VRF 출력으로 오버라이드한다.
3. CL이 `engine_getPayloadV3`로 완성된 페이로드를 가져온다.
4. CL이 `engine_newPayloadV3`로 페이로드를 EL에 제출하고 검증을 받는다.
5. CL이 다시 `engine_forkchoiceUpdatedV3`를 호출하여 새 블록을 canonical chain의 head로 설정한다.

이 과정에서 랜덤값은 `prevRandao` 필드를 통해 자연스럽게 전달된다. 추가적인 프로토콜 변경 없이 기존 Engine API 인터페이스를 그대로 활용한다.

---

## 3. 랜덤성이 생성되는 과정

### VRF (Verifiable Random Function)

VRF는 "검증 가능한 랜덤 함수"이다. 핵심 아이디어는 다음과 같다:

- 비밀키를 가진 사람만 랜덤값을 생성할 수 있다.
- 생성된 랜덤값에는 **증명(proof)**이 함께 나온다.
- 공개키를 아는 누구나 이 증명을 검증하여, 랜덤값이 올바르게 생성되었음을 확인할 수 있다.
- 같은 입력에 대해 항상 같은 출력이 나온다 (결정적).

Enshrined VRF에서 VRF 입력은 `parent_hash + block_number`이다. 시퀀서가 자신의 VRF 비밀키로 이 입력을 서명하면, 32바이트의 랜덤 출력과 증명이 생성된다. 이 출력이 해당 블록의 `prevRandao` 값이 된다.

Enshrined VRF는 BLS12-381 곡선 위의 VRF를 사용한다. BLS12-381은 Ethereum 2.0에서도 사용되는 곡선으로, 효율적인 서명 집계(aggregation)가 가능하다는 장점이 있다.

#### VRF의 한계

VRF 모드에서 시퀀서는 블록을 생성하기 전에 랜덤값을 알 수 있다. 이 자체로는 문제가 아니다 — VRF의 결정성 덕분에 다른 값을 내놓을 수는 없다. 하지만 시퀀서가 특정 트랜잭션의 순서를 조작하거나, 블록 생성을 지연시킬 수 있다는 점은 남아있다.

이 한계를 극복하기 위해 DRB가 도입된다.

### DRB (Distributed Random Beacon)

DRB는 여러 독립적인 노드가 협력하여 랜덤값을 만드는 방식이다. 핵심 보안 속성은: **N명의 참여자 중 단 1명만 정직하면, 최종 랜덤값은 예측 불가능하고 편향 불가능하다.**

Enshrined VRF에서 DRB는 두 가지 방식으로 구현되어 있다:

#### 방식 A: Commit-Reveal 스마트 컨트랙트

L2에 배포된 `DRBCommitReveal.sol` 컨트랙트를 통해 동작한다.

**라운드 흐름:**

1. **라운드 시작**: 누구나 `startRound()`을 호출하여 새 라운드를 시작할 수 있다.
2. **커밋 단계**: 등록된 운영자들이 비밀값의 해시(`keccak256(secret || msg.sender)`)를 제출한다. `msg.sender`를 포함하는 이유는 다른 운영자의 커밋을 복사하는 공격을 방지하기 위해서다.
3. **리빌 단계**: 커밋 기한이 지나면, 운영자들이 원래 비밀값을 공개한다. 컨트랙트는 해시가 커밋과 일치하는지 검증한다.
4. **확정**: 모든 커밋한 운영자가 리빌하면, 컨트랙트는 모든 비밀값을 XOR하고 라운드 ID와 함께 해시하여 최종 랜덤값을 만든다.

```
finalRandomness = keccak256(secret1 XOR secret2 XOR secret3 XOR ... || roundId)
```

**보안 분석:**

- **예측 불가**: 커밋 단계에서 각 운영자의 비밀은 해시 뒤에 숨겨져 있다. 1명이라도 자신의 비밀을 공개 전까지 숨기면, 다른 운영자들은 최종 값을 예측할 수 없다.
- **편향 불가**: 모든 커밋한 운영자가 리빌해야 한다. 리빌을 거부하면 라운드가 만료된다. 따라서 운영자가 결과를 보고 리빌을 거부하는 "마지막 리빌자 공격"은 라운드 만료로 처벌된다.
- **프론트런 방지**: 커밋에 `msg.sender`가 포함되어 있으므로, 다른 운영자의 커밋 트랜잭션을 가로채서 같은 비밀로 커밋하는 것이 불가능하다.

#### 방식 B: Threshold BLS 서명

CL 노드들이 직접 BLS 서명을 교환하여 비콘 출력을 만드는 방식이다.

**흐름:**

1. **DKG (Distributed Key Generation)**: 초기 설정 시 N개 노드가 함께 키를 생성한다. 각 노드는 비밀키의 "조각(share)"을 받고, 그룹 공개키가 만들어진다. 이 과정은 Feldman VSS (Verifiable Secret Sharing)에 기반한다.
2. **부분 서명**: 매 라운드(블록)마다, 각 노드가 라운드 메시지(`"ENSHRINED-VRF-ROUND-" + block_number`)를 자신의 비밀키 조각으로 BLS 서명한다.
3. **P2P 브로드캐스트**: 각 노드가 자신의 부분 서명을 HTTP를 통해 다른 노드들에게 전파한다.
4. **임계값 결합**: threshold(예: 3개 중 2개) 이상의 유효한 부분 서명이 모이면, Lagrange 보간법으로 그룹 서명을 복원한다.
5. **비콘 출력**: 그룹 서명의 keccak256 해시가 해당 블록의 랜덤 비콘 출력이 된다.
6. **블록 제출**: 리더 노드가 이 비콘 출력을 `prevRandao`로 설정하여 Engine API를 통해 EL에 제출한다.

**Threshold BLS의 핵심 속성:**

- T개 이상의 부분 서명이 있으면 그룹 서명을 복원할 수 있다 (T는 threshold).
- T개 미만의 노드가 결탁해도 그룹 서명을 미리 계산할 수 없다.
- 같은 메시지에 대한 그룹 서명은 항상 동일하다 (결정적).
- 그룹 공개키로 그룹 서명을 검증할 수 있다.

이 방식은 drand (League of Entropy가 운영하는 분산 랜덤 비콘)와 같은 원리이다.

### 두 DRB 방식의 비교

| 특성 | Commit-Reveal (컨트랙트) | Threshold BLS (CL 레벨) |
|------|------------------------|----------------------|
| 구현 위치 | L2 스마트 컨트랙트 | CL 노드 간 P2P |
| 참여 방식 | L2에 tx를 보내면 됨 | CL 노드를 운영해야 함 |
| 지연 | 커밋 + 리빌 = 여러 블록 | 블록당 즉시 |
| CL 수정 | 최소 | 필요 |
| 보안 모델 | N-of-N 리빌 필요 | T-of-N 서명 필요 |
| 프로덕션 준비도 | 컨트랙트 완성 | 프로토타입 (Lagrange 개선 필요) |

현재 로드맵에서는 Commit-Reveal을 먼저 운영에 투입하고, 이후 Threshold BLS로 발전시키는 전략을 취하고 있다.

---

## 4. 스마트 컨트랙트에서 랜덤값 사용하기

Enshrined VRF는 세 가지 인터페이스를 제공한다. 각각 다른 보안 속성과 사용 사례를 가진다.

### 인터페이스 1: block.prevrandao

가장 단순한 방법이다. EVM의 기존 `PREVRANDAO` opcode를 그대로 사용한다.

```solidity
uint256 randomSeed = block.prevrandao;
```

Ethereum에서 이 값은 밸리데이터가 편향할 수 있지만, Enshrined VRF에서는 VRF로 생성되므로 결정적이고 검증 가능하다.

- **가스 비용**: 0 (EVM opcode)
- **지연**: 없음 (현재 블록의 값)
- **특징**: 블록당 하나의 값. 같은 블록 안의 모든 tx가 같은 값을 본다.
- **적합한 용도**: 낮은 위험도의 랜덤 (시드값, 비결정적 요소)
- **부적합한 용도**: 동일 블록 내에서 tx별로 다른 랜덤이 필요한 경우

### 인터페이스 2: Randomness Precompile (주소 0x0b)

프리컴파일드 컨트랙트(precompiled contract)는 EVM에 하드코딩된 특수 컨트랙트이다. Ethereum에는 ecrecover(0x01), SHA256(0x02) 등이 이미 있다. Enshrined VRF는 주소 0x0b에 랜덤성 프리컴파일을 추가한다.

```solidity
interface IRandomness {
    function getRandomUint256() external view returns (uint256);
}

IRandomness constant RANDOM = IRandomness(address(0x0b));
uint256 rand = RANDOM.getRandomUint256();
```

내부적으로 **ChaCha20 CSPRNG**(암호학적으로 안전한 의사난수 생성기)를 사용한다. 시드는 블록의 비콘 출력에서 파생되고, 호출마다 원자적 카운터를 증가시켜 고유한 값을 보장한다.

- **가스 비용**: 100 gas (일반 컨트랙트 콜 수준)
- **지연**: 없음 (같은 트랜잭션에서 즉시 반환)
- **특징**: 호출마다 다른 값. 같은 tx 안에서 여러 번 호출하면 매번 다른 랜덤값.
- **적합한 용도**: GameFi 루트 드롭, NFT 민팅, 랜덤 매치메이킹, 게임 내 확률 이벤트
- **부적합한 용도**: 갬블링 — revert 공격에 취약

왜 갬블링에 부적합한가? 프리컴파일은 같은 tx에서 즉시 값을 반환하므로, 앞서 설명한 revert 공격이 가능하다. 결과가 불리하면 tx를 되돌리면 된다.

### 인터페이스 3: RandomBeaconHistory (시스템 컨트랙트)

갬블링과 카지노를 위한 핵심 인터페이스이다.

```solidity
interface IRandomBeaconHistory {
    function getRandomness(uint256 blockHeight) external view returns (bytes32);
}
```

이 컨트랙트는 **시스템 컨트랙트**이다. 일반 사용자나 컨트랙트가 아니라, EL의 블록 실행 과정에서 시스템 주소(`0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`)가 호출한다. 매 블록이 실행될 때, EL이 자동으로 해당 블록의 랜덤값을 이 컨트랙트에 기록한다.

이 방식이 revert 공격을 방어하는 이유:

1. 사용자가 블록 N에서 베팅한다 (`placeBet()`).
2. 이 시점에서 블록 N의 랜덤값은 아직 확정되지 않았다 (블록 N의 실행이 끝나야 기록됨). 따라서 **예측 불가**.
3. 블록 N+1 이후, 사용자가 결과를 정산한다 (`resolveBet()`).
4. 정산 시 블록 N의 확정된 랜덤값을 RandomBeaconHistory에서 읽어온다.
5. 이때 불리한 결과라고 revert해봤자, 랜덤값은 이미 시스템 콜로 기록되어 있으므로 **변경 불가**.

이것이 **Commit-Reveal 패턴**이다:

- **Commit (베팅)**: 랜덤값이 알려지기 전에 행동을 결정한다.
- **Reveal (정산)**: 확정된 랜덤값으로 결과를 정한다.

```solidity
contract Casino {
    IRandomBeaconHistory constant BEACON = IRandomBeaconHistory(BEACON_ADDRESS);

    struct Bet {
        address player;
        uint256 amount;
        uint256 choice;
        uint256 blockNumber;
    }

    mapping(uint256 => Bet) public bets;
    uint256 public nextBetId;

    // Phase 1: 베팅 (블록 N) — 이 시점에서 랜덤값은 아직 미확정
    function placeBet(uint256 choice) external payable {
        bets[nextBetId] = Bet({
            player: msg.sender,
            amount: msg.value,
            choice: choice,
            blockNumber: block.number
        });
        nextBetId++;
    }

    // Phase 2: 정산 (블록 N+1 이후) — 확정된 랜덤값으로 판정
    function resolveBet(uint256 betId) external {
        Bet storage bet = bets[betId];
        require(block.number > bet.blockNumber, "Too early");

        bytes32 rand = BEACON.getRandomness(bet.blockNumber);
        uint256 result = uint256(rand) % 6 + 1; // 주사위 1-6

        if (result == bet.choice) {
            // 승리 — 배당금 지급
            payable(bet.player).transfer(bet.amount * 6);
        }
        // revert해도 소용없음 — 랜덤값은 이미 확정됨
    }
}
```

- **가스 비용**: 일반 스토리지 읽기 수준
- **지연**: 최소 1블록 (다음 블록에서 정산 가능)
- **특징**: revert 공격 면역, 시스템 콜로 기록되어 사용자가 변조 불가
- **적합한 용도**: 카지노, 갬블링, 고액 베팅, 복권
- **부적합한 용도**: 즉시 결과가 필요한 경우 (1블록 대기 필요)

### 세 인터페이스 비교 요약

| 속성 | block.prevrandao | Precompile 0x0b | RandomBeaconHistory |
|------|-----------------|-----------------|---------------------|
| 지연 | 즉시 | 즉시 | 1블록 |
| 가스 | 0 | 100 | ~2100 (SLOAD) |
| tx별 고유값 | 아니오 | 예 | 해당 없음 |
| Revert 방어 | 없음 | 없음 | 있음 |
| 갬블링 적합 | 아니오 | 아니오 | 예 |
| GameFi 적합 | 일부 | 예 | 가능 (지연 감수) |

---

## 5. 보안 모델

### Phase별 보안 속성

Enshrined VRF의 보안은 발전 단계에 따라 강화된다:

#### Phase 1: VRF Only (단일 시퀀서)

- **검증 가능(Verifiable)**: VRF 증명으로 랜덤값이 올바르게 생성되었음을 검증할 수 있다.
- **Revert 방어**: RandomBeaconHistory 시스템 콜로 보장.
- **위조 불가(Forgery-proof)**: VRF의 결정성으로 다른 값을 내놓을 수 없다.
- **편향 가능(Biasable)**: 시퀀서가 트랜잭션 순서를 조작하거나 블록 생성을 지연시킬 수 있다.
- **예측 가능(Predictable)**: 시퀀서가 블록 생성 전에 랜덤값을 안다.

#### Phase 1: VRF + DRB (분산 랜덤 비콘 추가)

- **편향 불가(Unbiasable)**: DRB 참여자 중 1명이라도 정직하면 편향 불가.
- **예측 불가(Unpredictable)**: Commit-Reveal 또는 Threshold 서명으로 누구도 미리 알 수 없다.
- 나머지 속성은 Phase 1 VRF와 동일.

#### Phase 2: Threshold BLS (완전 분산)

- 모든 속성이 분산 밸리데이터에 의해 보장된다.
- 임계값(threshold) 미만의 결탁으로는 어떤 공격도 불가능하다.

### Revert 공격 방어 메커니즘 상세

Revert 공격 방어는 두 가지 레벨에서 작동한다:

**레벨 1: 시스템 콜 주입**

RandomBeaconHistory에 랜덤값을 기록하는 것은 EL의 블록 실행 로직에 하드코딩되어 있다. 사용자 트랜잭션이 아니라 시스템 주소에서 호출된다. 따라서:

- 사용자가 이 호출을 막을 수 없다.
- 사용자가 이 호출의 결과를 변경할 수 없다.
- 한번 기록된 값은 변경 불가능하다.

**레벨 2: Commit-Reveal 시간 분리**

베팅(commit)과 정산(reveal)이 다른 블록에서 일어나므로:

- 베팅 시점에 랜덤값이 존재하지 않는다 → 예측 불가.
- 정산 시점에 랜덤값은 이미 확정되어 있다 → 변경 불가.
- 정산을 revert해도 랜덤값은 그대로이므로 → 재시도해도 결과 동일.

---

## 6. 기술 스택

### 실행 레이어 (Rust)

- **베이스**: op-reth (공식 Rust OP Stack 실행 클라이언트)
- **EVM**: revm + op-revm
- **VRF**: blst (BLS12-381, NCC 감사 완료)
- **CSPRNG**: rand_chacha (ChaCha20)
- **프리컴파일**: revm의 프리컴파일 인터페이스로 주소 0x0b에 등록

### 합의 레이어 / 인프라 (Go)

- **op-node**: Optimism의 공식 롤업 노드
- **op-batcher**: 배치 제출 서비스
- **op-proposer**: Output root 제안 서비스

### 스마트 컨트랙트 (Solidity)

- **RandomBeaconHistory.sol**: 블록별 랜덤값 저장소 (시스템 컨트랙트)
- **DRBCommitReveal.sol**: 분산 랜덤 비콘 Commit-Reveal 프로토콜
- **IRandomness.sol**: 프리컴파일 인터페이스
- **VrfRandom.sol**: 유틸리티 라이브러리 (random(), rollDice(), coinFlip(), shuffle() 등)
- **CasinoExample.sol**: Commit-Reveal 패턴 데모 카지노
- **InstantDice.sol**: 프리컴파일 기반 즉시 주사위 게임

### 암호학 라이브러리

- **blst**: BLS12-381 VRF 및 Threshold BLS (NCC 보안 감사 완료)
- **rand_chacha**: ChaCha20 기반 CSPRNG (NIST 표준)
- 향후: **blsful** + **gennaro-dkg** (프로덕션 Threshold BLS DKG)

---

## 7. 유사 프로젝트와의 비교

### SKALE

SKALE은 현재 프로덕션에서 네이티브 threshold 랜덤을 제공하는 유일한 EVM 체인이다. BLS-RANDAO 방식으로 밸리데이터들이 합의 과정에서 랜덤을 생성한다. 개발자는 `getRandomBytes()`를 호출하면 된다. Enshrined VRF와 가장 유사한 접근이지만, SKALE은 독립 L1이고 Enshrined VRF는 OP Stack L2이다.

### Oasis Sapphire

TEE(Trusted Execution Environment) 안에서 랜덤을 생성하는 방식이다. 하드웨어 보안에 의존하므로 approach가 근본적으로 다르다. TEE가 침해되면 보안이 무너진다.

### Aptos

Move VM에 네이티브 랜덤을 내장했다. `#[randomness]` 어트리뷰트를 사용하면 VM이 자동으로 랜덤을 주입한다. 특히 "test-and-abort" 공격을 VM 레벨에서 방어하는 것이 특징이다 — 트랜잭션이 abort되어도 랜덤은 소비된 것으로 처리한다. Enshrined VRF의 RandomBeaconHistory 접근과는 다른 방식이지만, 같은 문제(revert 공격)를 해결한다.

### Sui

DKG + Threshold 암호화로 합의와 병렬로 랜덤을 생성한다. `sui::random` 모듈을 통해 접근한다. Epoch 기반으로 키를 생성하며, Enshrined VRF의 DRB 모드와 유사한 원리이다.

### Chainlink VRF

오프체인 오라클 방식이다. 어떤 체인에서든 사용할 수 있다는 장점이 있지만, 비용과 지연이 발생한다. Enshrined VRF는 체인 자체에 랜덤을 내장하므로 이 문제가 없다.

| 프로젝트 | 방식 | EVM | L2 | 비용 | 지연 |
|---------|------|-----|----|------|------|
| Enshrined VRF | VRF + DRB precompile | 예 | OP Stack | 무료 | 즉시 |
| SKALE | Threshold BLS | 예 | 아니오 (L1) | 무료 | 즉시 |
| Aptos | Weighted VRF | 아니오 (Move) | 아니오 | 무료 | 즉시 |
| Sui | Threshold DKG/BLS | 아니오 (Move) | 아니오 | 무료 | 즉시 |
| Oasis | VRF + TEE | 예 | 아니오 | 무료 | 즉시 |
| Chainlink VRF | 오프체인 오라클 | 예 | 체인 무관 | LINK 지불 | 1-2블록 |

---

## 8. 개발 현황 및 로드맵

### Phase 0: 프로토타입 (완료)

- 랜덤성 프리컴파일 (ChaCha20 CSPRNG) 구현
- RandomBeaconHistory 시스템 컨트랙트 구현
- VRF 합의 레이어 (BLS12-381) 구현
- CL-EL 통합 (Engine API 경유)
- CasinoExample E2E 테스트 통과

### Phase 1: OP Stack 통합 (진행 중)

- DRB Commit-Reveal 컨트랙트 완성
- Threshold BLS DRB 노드 프로토타입 (3노드, HTTP P2P)
- op-reth 포크 및 랜덤성 통합 (진행 예정)
- DRB seed를 VRF 입력에 혼합 (진행 예정)
- 표준 OP Stack 배포 (진행 예정)
- Ethereum 테스트넷 L1 정산 (진행 예정)

### Phase 2: 프로덕션 (계획)

- DRB 운영자 노드 클라이언트
- Threshold BLS 비콘 (분산 밸리데이터)
- Gennaro DKG (적대적 환경에서의 키 생성)
- 메인넷 배포
- Superchain 호환성

---

## 9. 핵심 개념 용어 정리

- **VRF (Verifiable Random Function)**: 비밀키로 입력을 서명하여 검증 가능한 랜덤 출력을 만드는 함수. 같은 입력에 항상 같은 출력.
- **BLS12-381**: Ethereum 2.0에서 사용되는 타원 곡선. 서명 집계에 효율적.
- **DRB (Distributed Random Beacon)**: 여러 참여자가 협력하여 편향 불가능한 랜덤을 만드는 프로토콜.
- **Commit-Reveal**: 먼저 비밀의 해시를 제출(commit)하고, 나중에 원본을 공개(reveal)하는 2단계 프로토콜.
- **Threshold BLS**: N명 중 T명 이상의 서명을 결합하면 그룹 서명이 복원되는 서명 방식.
- **DKG (Distributed Key Generation)**: 여러 참여자가 서로의 비밀을 모르면서 공동 키를 생성하는 프로토콜.
- **CSPRNG (Cryptographically Secure Pseudo-Random Number Generator)**: 암호학적으로 안전한 의사난수 생성기. Enshrined VRF는 ChaCha20을 사용.
- **Precompile**: EVM에 하드코딩된 컨트랙트. 네이티브 코드로 실행되어 효율적.
- **System Contract**: 블록 실행 과정에서 시스템 주소가 자동으로 호출하는 컨트랙트.
- **prevRandao**: EVM 블록 헤더의 필드. 원래 Ethereum에서는 RANDAO 믹스, Enshrined VRF에서는 VRF 출력.
- **Engine API**: CL과 EL이 통신하는 표준 HTTP/JSON-RPC 인터페이스.
- **OP Stack**: Optimism의 L2 프레임워크. op-node, op-batcher, op-proposer로 구성.
- **Revert 공격**: 스마트 컨트랙트에서 불리한 결과가 나오면 트랜잭션을 되돌리는 공격.
- **Lagrange 보간법**: 여러 점을 지나는 다항식을 복원하는 수학적 기법. Threshold 서명 결합에 사용.
