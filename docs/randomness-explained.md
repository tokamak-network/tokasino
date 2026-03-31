# Tokasino Randomness: 완전 해설

> 이 문서는 Tokasino 블록체인에서 난수(랜덤)가 어떻게 만들어지고, 블록에 기록되고, 게임에 사용되는지를 처음부터 끝까지 설명합니다. 코드 한 줄 한 줄의 의미를 포함합니다.

---

## 목차

1. [왜 블록체인에서 난수가 어려운가?](#1-왜-블록체인에서-난수가-어려운가)
2. [Tokasino의 해결책: VRF를 합의 레이어에 내장](#2-tokasino의-해결책-vrf를-합의-레이어에-내장)
3. [Stage 1: VRF 키 생성 (BLS12-381)](#3-stage-1-vrf-키-생성-bls12-381)
4. [Stage 2: VRF로 난수 계산 (블록 생성 시)](#4-stage-2-vrf로-난수-계산-블록-생성-시)
5. [Stage 3: Engine API를 통한 전달](#5-stage-3-engine-api를-통한-전달)
6. [Stage 4: prevrandao — 블록에 기록된 난수](#6-stage-4-prevrandao--블록에-기록된-난수)
7. [Stage 5: 프리컴파일 0x0b — 호출마다 다른 난수](#7-stage-5-프리컴파일-0x0b--호출마다-다른-난수)
8. [Stage 6: 스마트 컨트랙트에서 난수 사용](#8-stage-6-스마트-컨트랙트에서-난수-사용)
9. [Stage 7: 블록 체이닝 — 난수의 연쇄 보안](#9-stage-7-블록-체이닝--난수의-연쇄-보안)
10. [전체 흐름 요약: 하나의 주사위 게임이 처리되는 과정](#10-전체-흐름-요약-하나의-주사위-게임이-처리되는-과정)
11. [보안 분석: 왜 조작이 불가능한가?](#11-보안-분석-왜-조작이-불가능한가)
12. [부록: 코드 전문과 해설](#12-부록-코드-전문과-해설)

---

## 1. 왜 블록체인에서 난수가 어려운가?

### 근본적 모순

블록체인은 **결정적(deterministic)** 시스템입니다. 전 세계의 모든 노드가 같은 트랜잭션을 실행하면 반드시 같은 결과가 나와야 합니다. 그래야 모두가 동일한 상태에 합의할 수 있습니다.

그런데 "랜덤"이란 **예측할 수 없는 값**을 의미합니다. 만약 어떤 값이 결정적이라면, 그것은 예측 가능하고, 예측 가능하다면 랜덤이 아닙니다.

카지노 게임을 생각해보세요. 주사위를 굴릴 때:
- 플레이어가 결과를 미리 알면 → 항상 이길 수 있으므로 게임이 안 됨
- 카지노(시퀀서)가 결과를 조작할 수 있으면 → 항상 질 수 있으므로 불공정

**양쪽 모두 결과를 예측하거나 조작할 수 없어야** 공정한 게임이 됩니다.

### 기존 접근법의 문제

#### blockhash / block.timestamp 사용

가장 단순한 방법은 블록의 해시나 타임스탬프를 난수로 쓰는 것입니다.

```solidity
// ❌ 이렇게 하면 안 됩니다
uint256 random = uint256(blockhash(block.number - 1));
```

문제: **채굴자/시퀀서가 이 값을 알고 있습니다.** 블록을 만드는 사람이 블록 해시를 이미 알기 때문에, 자신에게 유리한 블록만 제출할 수 있습니다. 예를 들어 카지노 게임에서 시퀀서가 "이 블록에서 이 주사위 결과가 나오면 내가 지니까, 이 트랜잭션을 안 넣어야지"라고 할 수 있습니다.

#### Chainlink VRF (외부 오라클)

Chainlink VRF는 외부 서버(오라클)에서 랜덤값을 생성하고, 그 값이 올바르게 생성되었음을 수학적으로 증명하는 방식입니다.

```
1. 컨트랙트: "난수 하나 줘" (requestRandomWords)
2. Chainlink 노드: VRF 계산 → 결과 + 증명 생성
3. (1~2블록 후) Chainlink 노드: 콜백으로 결과 전달 (fulfillRandomWords)
```

문제점:
- **지연**: 요청 후 1~2블록(최소 12~24초) 기다려야 결과가 옴. "주사위 굴려!"를 누르고 30초 기다려야 하는 카지노는 사용자 경험이 나쁨
- **비용**: 매 요청마다 LINK 토큰을 지불해야 함. 주사위 한 번 굴리는 데 추가 비용 발생
- **외부 의존성**: Chainlink 노드가 다운되면 게임이 멈춤

#### Ethereum의 PREVRANDAO

이더리움 PoS 이후 `block.prevrandao`라는 값이 도입되었습니다. 비콘체인 밸리데이터들의 RANDAO reveal을 믹싱한 값입니다.

문제: 블록을 제안하는 밸리데이터는 자신의 RANDAO reveal을 알고 있어서, 블록을 제안할지 말지를 선택함으로써 **최소 1비트의 영향력**을 행사할 수 있습니다. 연속 슬롯을 가진 밸리데이터는 더 많은 영향력을 가집니다.

---

## 2. Tokasino의 해결책: VRF를 합의 레이어에 내장

Tokasino는 위 문제들을 근본적으로 해결합니다:

**시퀀서(블록 생성자) 자체에 VRF(Verifiable Random Function)를 내장하여, 매 블록마다 검증 가능한 난수를 생성합니다.**

### VRF란 무엇인가?

VRF(Verifiable Random Function)는 세 가지 성질을 가진 암호학적 함수입니다:

1. **결정적(Deterministic)**: 같은 비밀키와 같은 입력이면 항상 같은 출력이 나옵니다. 시퀀서가 "다른 값을 내고 싶어"라고 해도 바꿀 수 없습니다.

2. **예측 불가(Unpredictable)**: 비밀키를 모르는 사람은 출력을 미리 알 수 없습니다. 다음 블록의 난수가 뭔지 아무도 모릅니다.

3. **검증 가능(Verifiable)**: VRF는 결과와 함께 "증명(proof)"을 출력합니다. 공개키를 아는 누구나 이 증명으로 "이 출력이 진짜 이 키로 만들어진 것인지" 확인할 수 있습니다.

비유하자면: **봉인된 편지** 같은 것입니다.
- 봉투(비밀키)로 편지를 봉인하면 안의 내용(난수)이 결정됩니다
- 봉인 전에는 내용을 알 수 없습니다 (예측 불가)
- 봉인을 열면(증명 검증) 편지가 정말 그 봉투로 봉인되었는지 확인할 수 있습니다
- 같은 봉투로 같은 편지를 봉인하면 항상 같은 결과입니다 (결정적)

### Tokasino가 얻는 이점

| 항목 | Chainlink VRF | Tokasino VRF |
|------|-------------|-------------|
| 지연 | 1~2블록 (12~24초) | **0** (같은 트랜잭션에서 즉시) |
| 비용 | LINK 토큰 필요 | **0** (추가 비용 없음) |
| 외부 의존성 | Chainlink 노드 필요 | **없음** (자체 내장) |
| 트랜잭션 수 | 2개 (요청 + 콜백) | **1개** (즉시 결과) |

---

## 3. Stage 1: VRF 키 생성 (BLS12-381)

### VRF 키쌍이란?

시퀀서가 시작될 때 가장 먼저 하는 일은 **VRF 키쌍**을 만드는 것입니다. 키쌍은 비밀키(secret key)와 공개키(public key)로 구성됩니다.

- **비밀키**: 시퀀서만 알고 있는 32바이트 값. 이걸로 VRF 서명을 만듭니다.
- **공개키**: 누구에게나 공개되는 값. 이걸로 VRF 서명을 검증합니다.

### 왜 BLS12-381인가?

BLS12-381은 타원곡선 암호 알고리즘의 이름입니다. 이더리움 2.0의 비콘체인에서도 사용하는 **검증된 알고리즘**입니다.

BLS의 특징:
- **서명이 결정적**: 같은 키 + 같은 메시지 = 항상 같은 서명. (ECDSA는 매번 다른 서명이 나올 수 있음)
- **서명 크기가 작음**: 96바이트 (min-sig 변형 기준)
- **집합 서명 가능**: 여러 서명을 하나로 합칠 수 있음 (DRB 모드에서 활용)

### 실제 코드와 해설

```rust
// vrf.rs — VRF 키쌍 구현

// DST(Domain Separation Tag): 이 서명이 어떤 용도인지 구분하는 태그
// 다른 프로토콜의 BLS 서명과 충돌하지 않도록 고유한 문자열을 사용
const DST: &[u8] = b"TOKASINO-VRF-V1";

pub struct VrfKeyPair {
    pub secret_key: SecretKey,  // BLS 비밀키
    pub public_key: PublicKey,  // BLS 공개키 (비밀키에서 유도)
}

impl VrfKeyPair {
    // 새로운 키쌍 생성
    pub fn generate() -> Result<Self> {
        // 32바이트의 랜덤 값(IKM = Initial Keying Material) 생성
        let mut ikm = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut ikm);

        // IKM으로부터 BLS 비밀키 생성
        let secret_key = SecretKey::key_gen(&ikm, &[])?;

        // 비밀키에서 공개키 유도 (수학적으로 비밀키 × 생성점 G)
        let public_key = secret_key.sk_to_pk();

        Ok(Self { secret_key, public_key })
    }
}
```

**`key_gen(&ikm, &[])`가 하는 일:**
32바이트 랜덤 시드(ikm)를 받아서 BLS12-381 곡선 위의 점(스칼라 값)으로 변환합니다. 이 값이 비밀키가 됩니다.

**`sk_to_pk()`가 하는 일:**
비밀키 `sk`에 대해 `pk = sk × G` (타원곡선 위의 스칼라 곱셈)를 계산합니다. G는 BLS12-381의 생성점(generator point)입니다. 역연산(공개키에서 비밀키 추출)은 이산 로그 문제라 불가능합니다.

### 키 저장

```rust
// 비밀키를 파일로 저장 (32바이트 바이너리)
pub fn save_to_file(&self, path: &Path) -> Result<()> {
    let sk_bytes = self.secret_key.to_bytes();  // 32바이트
    fs::write(path, sk_bytes)?;
    Ok(())
}

// 파일에서 키 로드
pub fn load_from_file(path: &Path) -> Result<Self> {
    let sk_bytes = fs::read(path)?;  // 32바이트 읽기
    let secret_key = SecretKey::from_bytes(&sk_bytes)?;
    let public_key = secret_key.sk_to_pk();  // 공개키는 다시 유도
    Ok(Self { secret_key, public_key })
}
```

시퀀서가 처음 시작하면 키를 생성하고 `vrf_key.bin`에 저장합니다. 다음부터는 이 파일에서 로드합니다. 공개키는 비밀키에서 항상 다시 유도할 수 있으므로 비밀키만 저장하면 됩니다.

---

## 4. Stage 2: VRF로 난수 계산 (블록 생성 시)

### VRF 입력값 구성

매 블록을 생성할 때, 시퀀서는 VRF 입력값을 다음과 같이 만듭니다:

```rust
// main.rs — 블록 생성 시 VRF 계산
async fn produce_block_vrf(
    engine: &EngineClient,
    vrf_key: &vrf::VrfKeyPair,
    head_hash: &mut B256,      // 이전 블록의 해시 (32바이트)
    block_number: &mut u64,    // 현재 블록 번호
) -> Result<()> {
    let next_block = *block_number + 1;

    // VRF 입력 = 이전 블록 해시(32바이트) + 블록 번호(8바이트) = 40바이트
    let vrf_input = [head_hash.as_slice(), &next_block.to_be_bytes()].concat();

    // VRF 계산: 입력 → (32바이트 출력, 96바이트 증명)
    let (vrf_output, _proof) = vrf_key.prove(&vrf_input);

    // VRF 출력을 prevrandao로 사용
    let prev_randao = B256::from(vrf_output);

    submit_block(engine, head_hash, block_number, prev_randao).await
}
```

**왜 이전 블록의 해시를 입력에 포함하는가?**

이전 블록의 해시를 포함하면:
- 이전 블록이 확정되기 전까지 다음 블록의 난수를 계산할 수 없음
- 미래의 난수를 미리 알 수 없음 → 예측 불가 보장
- 블록 간 난수가 체인처럼 연결됨 → 하나를 바꾸면 이후 모두 바뀜

**왜 블록 번호도 포함하는가?**

만약 이전 블록 해시만 쓴다면, 이론적으로 같은 해시를 가진 블록이 있으면(극히 희박하지만) 같은 난수가 나올 수 있습니다. 블록 번호를 추가하면 이 가능성이 완전히 사라집니다.

### VRF 계산 과정 (prove 함수)

```rust
// vrf.rs — VRF 증명 생성
pub fn prove(&self, input: &[u8]) -> ([u8; 32], Vec<u8>) {
    // 1. BLS 서명 생성
    //    input = parent_hash(32bytes) || block_number(8bytes)
    //    DST = "TOKASINO-VRF-V1"
    //    결과: 96바이트 BLS 서명
    let signature = self.secret_key.sign(input, DST, &[]);
    let sig_bytes = signature.to_bytes().to_vec();

    // 2. 서명을 keccak256으로 해싱 → 32바이트 VRF 출력
    //    왜 해싱하는가? BLS 서명은 96바이트인데, EVM에서 쓰기엔 너무 크고
    //    서명 자체는 타원곡선 위의 점이라 "랜덤처럼 보이지 않을 수 있음"
    //    keccak256을 거치면 균일하게 분포된 32바이트 값이 됨
    let output = alloy_primitives::keccak256(&sig_bytes);

    // output = 32바이트 VRF 난수 (이것이 prevrandao가 됨)
    // sig_bytes = 96바이트 VRF 증명 (이것으로 검증 가능)
    (*output, sig_bytes)
}
```

**단계별로 풀어보면:**

```
입력: parent_hash(0xabcd...) || block_number(100)
       = 40바이트 데이터

  ↓ BLS12-381 서명 (비밀키 + DST "TOKASINO-VRF-V1")

서명: 96바이트 BLS 서명 (이것이 "증명")
      = 타원곡선 BLS12-381 위의 점 (G1)

  ↓ keccak256 해싱

출력: 32바이트 (256비트) 난수 (이것이 "prevrandao")
      = 0x3a8f7b2c... (균일 분포)
```

### VRF 검증 과정

누군가 "이 난수가 정말 맞는지" 확인하고 싶으면:

```rust
// vrf.rs — VRF 검증
pub fn verify(
    public_key: &PublicKey,  // 시퀀서의 공개키 (공개)
    input: &[u8],            // parent_hash || block_number (공개)
    output: &[u8; 32],       // prevrandao (공개, 블록에 기록됨)
    proof: &[u8],            // BLS 서명 (96바이트, 증명으로 제공)
) -> bool {
    // 1. 증명(proof)이 유효한 BLS 서명인지 확인
    let signature = Signature::from_bytes(proof)?;
    let verify_result = signature.verify(
        true,        // 서명 유효성 검사
        input,       // 서명된 메시지 (parent_hash || block_number)
        DST,         // "TOKASINO-VRF-V1"
        &[],         // 추가 정보 없음
        public_key,  // 시퀀서의 공개키
        true,        // 공개키 유효성 검사
    );

    // 2. BLS 서명이 유효한가?
    if verify_result != BLST_ERROR::BLST_SUCCESS {
        return false;
    }

    // 3. keccak256(증명) == 주장된 출력인가?
    let expected_output = alloy_primitives::keccak256(proof);
    expected_output.as_slice() == output
}
```

검증에 필요한 것은 모두 공개 정보입니다:
- 공개키: 시퀀서가 공개
- 입력: 이전 블록 해시 + 블록 번호 (블록체인에 기록됨)
- 출력: prevrandao (블록 헤더에 기록됨)
- 증명: 96바이트 BLS 서명 (시퀀서가 제공)

### 결정성 테스트

```rust
#[test]
fn test_deterministic_output() {
    let kp = VrfKeyPair::generate().unwrap();
    let input = b"same input";

    let (out1, _) = kp.prove(input);
    let (out2, _) = kp.prove(input);

    // 같은 키 + 같은 입력 = 항상 같은 출력
    assert_eq!(out1, out2, "VRF output must be deterministic");
}
```

이 테스트가 보여주는 것: **시퀀서가 "다른 난수를 내고 싶어"라고 해도 불가능합니다.** 입력(이전 블록 해시 + 블록 번호)이 정해지면 출력이 하나로 결정됩니다.

---

## 5. Stage 3: Engine API를 통한 전달

### 합의 레이어(CL)와 실행 레이어(EL)의 관계

Tokasino는 OP Stack 아키텍처를 따릅니다:
- **합의 레이어(CL)**: "어떤 블록을 만들지" 결정하는 역할. VRF 난수를 계산.
- **실행 레이어(EL)**: 실제로 트랜잭션을 실행하고 상태를 업데이트하는 역할. op-reth.

둘 사이의 통신은 **Engine API**로 이루어집니다. 이것은 이더리움 2.0에서 비콘체인과 실행 클라이언트 사이에 사용하는 것과 동일한 표준 프로토콜입니다.

### 블록 제출 과정

```rust
// main.rs — Engine API로 블록 제출
async fn submit_block(
    engine: &EngineClient,
    head_hash: &mut B256,
    block_number: &mut u64,
    prev_randao: B256,        // ← VRF에서 계산된 난수!
) -> Result<()> {
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

    // 1단계: "이 속성으로 새 블록을 만들어줘"
    let payload_attributes = json!({
        "timestamp": format!("0x{timestamp:x}"),
        "prevRandao": prev_randao,    // ← 여기! VRF 출력을 prevRandao에 넣음
        "suggestedFeeRecipient": "0x00...00",
        "withdrawals": [],
        "parentBeaconBlockRoot": B256::ZERO,
        "noTxPool": false,            // 멤풀의 트랜잭션을 포함
        "gasLimit": format!("0x{:x}", 30_000_000u64),
    });

    // engine_forkchoiceUpdatedV3: "현재 헤드를 이 블록으로 설정하고, 새 블록을 준비해줘"
    let fcu_response = engine
        .fork_choice_updated(head_hash, head_hash, head_hash, Some(payload_attributes))
        .await?;

    // 2단계: "준비된 블록을 가져와"
    let payload_id = extract_payload_id(&fcu_response)?;
    let payload_response = engine.get_payload(&payload_id).await?;

    // 3단계: "이 블록을 실행하고 유효한지 확인해줘"
    let execution_payload = payload_response.get("executionPayload").cloned()...;
    let new_block_hash = extract_block_hash(&execution_payload)?;
    let new_payload_response = engine
        .new_payload(execution_payload, json!([]), B256::ZERO)
        .await?;

    // 4단계: 유효하면 이 블록을 최종 확정
    if status == "VALID" || status == "ACCEPTED" {
        engine.fork_choice_updated(new_block_hash, new_block_hash, new_block_hash, None).await?;
        *head_hash = new_block_hash;   // 다음 블록의 VRF 입력으로 사용될 해시
        *block_number = next_block;
    }
}
```

**핵심: `prevRandao` 필드**

Engine API의 `payloadAttributes`에 `prevRandao`를 넣으면, EL(op-reth)이 블록을 만들 때 이 값을 블록 헤더의 `prevrandao` 필드에 기록합니다. 그러면 이 블록에 포함된 모든 스마트 컨트랙트에서 `block.prevrandao`로 이 값을 읽을 수 있습니다.

**3단계 Engine API 호출 요약:**

```
CL → EL: forkchoiceUpdatedV3(head, {prevRandao: 0x3a8f...})
          "이 난수로 새 블록 만들어줘"
EL → CL: payloadId = "0x01"
          "준비 중"

CL → EL: getPayloadV3("0x01")
          "다 됐어? 블록 줘"
EL → CL: executionPayload = {blockHash: 0xdef2..., transactions: [...], ...}
          "여기 블록이야"

CL → EL: newPayloadV3(executionPayload)
          "이거 실행해봐"
EL → CL: {status: "VALID"}
          "유효해"

CL → EL: forkchoiceUpdatedV3(0xdef2..., null)
          "OK, 이 블록으로 확정해"
```

---

## 6. Stage 4: prevrandao — 블록에 기록된 난수

### prevrandao란?

`prevrandao`는 이더리움 블록 헤더의 표준 필드입니다. EIP-4399에 의해 도입되었으며, 이전에는 `mixHash`라고 불리던 필드를 대체합니다.

- **이더리움 메인넷**: 비콘체인의 RANDAO 믹스 값이 들어감
- **Tokasino**: **시퀀서의 VRF 출력값**이 들어감

솔리디티에서는 `block.prevrandao`로 접근할 수 있습니다.

### 구체적 예시

```
Block #100의 실제 값들:

parentHash:  0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
number:      100
prevrandao:  0x3a8f7b2c9e1d4a6f0b3c5e8d2a7f9c1e4b6d8a0f2c5e7d9b1a3c5e7f9d0b2a4c
timestamp:   1711900800
hash:        0xdef2345678901234def2345678901234def2345678901234def2345678901234
```

이 블록에서 실행되는 모든 스마트 컨트랙트가 `block.prevrandao`를 읽으면:
```
0x3a8f7b2c9e1d4a6f0b3c5e8d2a7f9c1e4b6d8a0f2c5e7d9b1a3c5e7f9d0b2a4c
```
라는 같은 값을 얻습니다.

### prevrandao의 성질

1. **블록당 하나**: 같은 블록의 100개 트랜잭션이 모두 같은 값을 봅니다
2. **사전 예측 불가**: Block #99가 확정되기 전에는 Block #100의 prevrandao를 아무도 모릅니다
3. **사후 변경 불가**: 블록이 확정되면 prevrandao도 고정됩니다
4. **시퀀서도 조작 불가**: VRF가 결정적이므로, 입력이 정해지면 출력이 하나로 결정됩니다

---

## 7. Stage 5: 프리컴파일 0x0b — 호출마다 다른 난수

### 프리컴파일이란?

프리컴파일(Precompiled Contract)은 EVM에 네이티브 코드로 미리 구현된 함수입니다. 특정 주소를 호출하면 실행됩니다. 솔리디티로 구현하면 비효율적이거나 불가능한 연산을 위해 존재합니다.

이더리움의 기존 프리컴파일:
| 주소 | 기능 | 가스 |
|------|------|------|
| 0x01 | ecrecover (ECDSA 서명 복원) | 3000 |
| 0x02 | SHA-256 해시 | 60+ |
| 0x03 | RIPEMD-160 해시 | 600+ |
| 0x04 | identity (데이터 복사) | 15+ |
| 0x05 | modexp (모듈러 거듭제곱) | 가변 |
| 0x06~0x09 | 타원곡선 연산 | 가변 |
| 0x0a | Blake2f | 가변 |

Tokasino는 **0x0b**에 난수 생성 프리컴파일을 추가했습니다. 기존 0x0a 다음 번호입니다.

### 왜 프리컴파일이 필요한가?

prevrandao는 **블록당 하나의 고정값**입니다. 문제 상황:

```
Block #100에서:
  TX 1: Alice가 주사위 게임 → block.prevrandao = 0x3a8f...
  TX 2: Bob이 주사위 게임   → block.prevrandao = 0x3a8f... (같은 값!)
  TX 3: Alice가 또 게임     → block.prevrandao = 0x3a8f... (또 같은 값!)
```

prevrandao만 그대로 쓰면 같은 블록의 모든 게임이 같은 결과가 나옵니다!

프리컴파일 0x0b는 이 문제를 해결합니다: **내부 카운터를 사용하여 매 호출마다 다른 난수를 반환합니다.**

### 실제 코드와 상세 해설

```rust
// evm.rs — 프리컴파일 구현

// 주소 0x0b에 배치
pub const RANDOMNESS_PRECOMPILE_ADDRESS: Address =
    address!("0x000000000000000000000000000000000000000b");

// 전역 원자적 카운터 — 프로세스 전체에서 공유
// AtomicU64이므로 멀티스레드에서도 안전
static RANDOMNESS_COUNTER: AtomicU64 = AtomicU64::new(0);

// 가스비: 100 (매우 저렴, 네이티브 코드라서)
const RANDOMNESS_GAS: u64 = 100;

fn randomness_precompile(input: &[u8], gas_limit: u64) -> PrecompileResult {
    // 가스 체크
    if gas_limit < RANDOMNESS_GAS {
        return Err(PrecompileError::OutOfGas.into());
    }

    // 1단계: 입력(seed)을 32바이트 배열에 복사
    // seed는 보통 prevrandao에서 유래
    let mut seed = [0u8; 32];
    let len = input.len().min(32);         // 최대 32바이트만 사용
    seed[..len].copy_from_slice(&input[..len]);

    // 2단계: 카운터를 가져오고 1 증가시킴 (원자적 연산)
    // fetch_add: 현재 값을 반환하고, 동시에 1을 더함
    // Ordering::Relaxed: 가장 빠른 메모리 오더링 (여기선 충분)
    let counter = RANDOMNESS_COUNTER.fetch_add(1, Ordering::Relaxed);

    // 3단계: seed(32바이트) + counter(8바이트) = 40바이트를 keccak256
    // 이것으로 seed가 같아도 counter가 다르면 완전히 다른 해시가 나옴
    let mixed = keccak256([seed.as_slice(), &counter.to_le_bytes()].concat());

    // 4단계: 해시를 ChaCha20 CSPRNG의 시드로 사용
    // ChaCha20: Google이 TLS에 사용하는 암호학적 난수 생성기
    let mut rng = ChaCha20Rng::from_seed(*mixed);

    // 5단계: 32바이트 난수 생성
    let mut output = [0u8; 32];
    rng.fill_bytes(&mut output);

    // 반환: 가스 100 + 32바이트 난수
    Ok(PrecompileOutput::new(RANDOMNESS_GAS, Bytes::from(output.to_vec())))
}
```

### 각 단계를 구체적 예시로

```
Block #100에서 프리컴파일이 3번 호출된다면:

=== 1번째 호출 ===
seed    = 0x3a8f7b2c... (prevrandao)
counter = 0
mixed   = keccak256(0x3a8f7b2c...00 + 0x0000000000000000)
        = 0x91f3a712...
ChaCha20(seed: 0x91f3a712...) → output = 0xe7c2d41b...

=== 2번째 호출 ===
seed    = 0x3a8f7b2c... (같은 prevrandao)
counter = 1              (← 여기만 다름!)
mixed   = keccak256(0x3a8f7b2c...00 + 0x0100000000000000)
        = 0x4e28bc93...  (완전히 다른 해시!)
ChaCha20(seed: 0x4e28bc93...) → output = 0x1a9f5c7e... (다른 난수!)

=== 3번째 호출 ===
seed    = 0x3a8f7b2c... (같은 prevrandao)
counter = 2
mixed   = keccak256(0x3a8f7b2c...00 + 0x0200000000000000)
        = 0xd7f15a0e...  (또 다른 해시!)
ChaCha20(seed: 0xd7f15a0e...) → output = 0x8b3e6f0a... (또 다른 난수!)
```

### 왜 keccak256 → ChaCha20 이중 구조인가?

keccak256만으로도 다른 값이 나오는데, 왜 굳이 ChaCha20을 한 번 더 거칠까?

**keccak256만 쓸 경우의 위험:**
- keccak256은 결정적 해시 함수 → 입력을 알면 출력을 계산할 수 있음
- seed(prevrandao)와 counter는 모두 공개 정보
- 누군가 seed와 counter를 알면 → keccak256 출력을 그대로 계산 가능
- 이 자체가 보안 문제는 아니지만 (어차피 결정적 시스템이니까), 추가 방어층을 더하면 더 안전

**ChaCha20을 거치면:**
- ChaCha20은 스트림 암호(stream cipher)
- 시드를 알더라도 내부 상태(state)를 거쳐 출력이 만들어지므로, 입력↔출력 간의 직접적 관계가 훨씬 복잡
- 혹시라도 keccak256에 약점이 발견되더라도 ChaCha20이 두 번째 방어선 역할
- **이중 자물쇠**: 두 개의 독립적인 암호학적 원시함수를 거침

### 프리컴파일 등록

```rust
// evm.rs — 프리컴파일을 EVM에 등록
pub fn tokasino_precompiles() -> &'static Precompiles {
    static INSTANCE: OnceLock<Precompiles> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        // 이더리움 Prague 하드포크의 기존 프리컴파일들을 복사
        let mut precompiles = Precompiles::prague().clone();

        // 우리의 난수 프리컴파일을 추가
        precompiles.extend([Precompile::new(
            PrecompileId::custom("tokasino-randomness"),
            RANDOMNESS_PRECOMPILE_ADDRESS,  // 0x0b
            randomness_precompile,           // 위에서 구현한 함수
        )]);

        precompiles
    })
}
```

`OnceLock`을 사용하여 프리컴파일 세트를 한 번만 생성하고 캐싱합니다.

### 솔리디티에서 프리컴파일 호출하기

```solidity
// IRandomness.sol — 프리컴파일 인터페이스
interface IRandomness {
    function getRandomUint256() external view returns (uint256);
}

library Randomness {
    address internal constant PRECOMPILE = address(0x0b);

    function getRandomUint256() internal view returns (uint256 randomValue) {
        randomValue = IRandomness(PRECOMPILE).getRandomUint256();
    }
}
```

사용법:
```solidity
import {Randomness} from "./IRandomness.sol";

uint256 random = Randomness.getRandomUint256();
// 프리컴파일이 32바이트 난수를 반환
```

---

## 8. Stage 6: 스마트 컨트랙트에서 난수 사용

### 방법 1: block.prevrandao 직접 사용 (게임 컨트랙트)

프리컴파일을 호출하지 않고 `block.prevrandao`를 직접 읽어서 가공하는 방식입니다.
Tokasino의 게임 컨트랙트들(InstantDice, CoinFlip, Roulette)이 이 방식을 사용합니다.

```solidity
// InstantDice.sol — 주사위 게임
function play(uint8 chosenNumber) external payable {
    // prevrandao + 컨텍스트 정보를 섞어서 게임 고유 시드 생성
    bytes32 randomSeed = keccak256(
        abi.encodePacked(
            block.prevrandao,    // VRF 출력 (블록당 고정)
            block.number,        // 블록 번호
            msg.sender,          // 플레이어 주소
            games.length         // 게임 ID (매 게임마다 증가)
        )
    );

    // 시드를 6으로 나눈 나머지 + 1 = 주사위 결과 (1~6)
    rolledNumber = uint8(uint256(randomSeed) % DICE_SIDES) + 1;

    // 결과에 따라 즉시 지급
    won = (rolledNumber == chosenNumber);
    payout = won ? msg.value * 5 : 0;   // 5배 배당

    if (won) {
        (bool ok,) = msg.sender.call{value: payout}("");
    }

    // 이벤트 로그에 시드 기록 → 누구나 결과를 재계산하여 검증 가능
    emit GamePlayed(gameId, msg.sender, chosenNumber,
        rolledNumber, msg.value, payout, won, randomSeed);
}
```

**4가지를 섞는 이유 — 구체적 예시:**

```
Block #100에서:
  prevrandao = 0x3a8f...

  Alice(0xA...)가 Game #42 플레이:
    seed = keccak256(0x3a8f... + 100 + 0xA... + 42) = 0x7c2d...
    result = 0x7c2d... % 6 + 1 = 4

  Bob(0xB...)이 Game #43 플레이 (같은 블록):
    seed = keccak256(0x3a8f... + 100 + 0xB... + 43) = 0xe1f9...
    result = 0xe1f9... % 6 + 1 = 2  (다른 결과!)

  Alice가 Game #44 또 플레이 (같은 블록):
    seed = keccak256(0x3a8f... + 100 + 0xA... + 44) = 0x5a3b...
    result = 0x5a3b... % 6 + 1 = 6  (또 다른 결과!)
```

각 요소의 역할:
- `prevrandao`: 블록 수준의 난수 (VRF로 보장)
- `block.number`: 다른 블록이면 다른 결과
- `msg.sender`: 다른 플레이어면 다른 결과
- `games.length`: 같은 사람이 같은 블록에서 연속 플레이해도 다른 결과

### 방법 2: TokasinoRandom 라이브러리

게임 컨트랙트에서 더 편리하게 사용할 수 있는 라이브러리도 제공됩니다.

```solidity
// TokasinoRandom.sol
library TokasinoRandom {
    function random(uint256 salt) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.number,
            block.timestamp,
            msg.sender,
            salt               // 추가 엔트로피 (게임 ID 등)
        )));
    }

    // 범위 내 난수: min~max (포함)
    function randomRange(uint256 min, uint256 max, uint256 salt) internal view returns (uint256) {
        return min + (random(salt) % (max - min + 1));
    }

    // 주사위 (1~6)
    function rollDice(uint256 salt) internal view returns (uint8) {
        return uint8(random(salt) % 6) + 1;
    }

    // 동전 던지기 (true/false)
    function coinFlip(uint256 salt) internal view returns (bool) {
        return random(salt) % 2 == 0;
    }

    // Fisher-Yates 셔플 (카드 게임 등)
    function shuffle(uint256 length, uint256 salt) internal view returns (uint256[] memory) {
        // 각 swap마다 salt+i를 사용하여 독립적인 난수 생성
        for (uint256 i = length - 1; i > 0; i--) {
            uint256 j = random(salt + i) % (i + 1);
            // swap
        }
    }

    // 가중치 랜덤 선택 (룰렛의 구간 선택 등)
    function weightedRandom(uint256[] memory weights, uint256 salt) internal view returns (uint256) {
        // 가중치 합 계산 → 구간 나누기 → 난수로 선택
    }
}
```

### 방법 3: RandomBeaconHistory (Commit-Reveal 패턴)

가장 높은 보안이 필요한 경우, 과거 블록의 난수를 사용하는 commit-reveal 패턴을 쓸 수 있습니다.

```solidity
// RandomBeaconHistory.sol — 시스템 컨트랙트
contract RandomBeaconHistory {
    // 시스템 주소만 호출 가능 (노드 소프트웨어)
    address public constant SYSTEM_ADDRESS = 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE;

    // 블록 번호 → 난수 매핑
    mapping(uint256 => bytes32) public sourceOfRandomness;

    // 노드가 매 블록 끝에 호출하여 난수를 기록
    function submitRandomness(bytes32 randomSeed, uint64 blockNumber) external {
        require(msg.sender == SYSTEM_ADDRESS);  // 시스템만 호출 가능
        sourceOfRandomness[blockNumber] = randomSeed;
    }

    // 과거 블록의 난수 조회
    function getRandomness(uint256 blockHeight) external view returns (bytes32) {
        bytes32 seed = sourceOfRandomness[blockHeight];
        require(seed != bytes32(0), "not available");
        return seed;
    }
}
```

Commit-Reveal 패턴:
```
Block N: 플레이어가 베팅 (placeBet)
         → bet.blockNumber = N으로 기록
         → 이때 Block N의 난수는 아직 확정되기 전이므로 결과를 모름

Block N+1 이후: 아무나 resolveBet 호출
         → RandomBeaconHistory.getRandomness(N)으로 Block N의 난수 조회
         → 이 난수로 결과 결정
         → 베팅 시점에 난수가 결정되지 않았으므로 시퀀서도 조작 불가
```

---

## 9. Stage 7: 블록 체이닝 — 난수의 연쇄 보안

### 체이닝 구조

```
Block 0 (Genesis)
  hash: 0xgen0...
    ↓
Block 1
  VRF input:  0xgen0... || 1
  prevrandao: VRF(0xgen0... || 1) = 0xaaa1...
  hash:       0xblk1...
    ↓
Block 2
  VRF input:  0xblk1... || 2
  prevrandao: VRF(0xblk1... || 2) = 0xbbb2...
  hash:       0xblk2...
    ↓
Block 3
  VRF input:  0xblk2... || 3
  prevrandao: VRF(0xblk2... || 3) = 0xccc3...
  hash:       0xblk3...
    ↓
  ... 계속 ...
```

각 블록의 해시가 다음 블록의 VRF 입력이 됩니다. 이것은 **난수들이 체인처럼 연결**된다는 것을 의미합니다.

### 체이닝이 제공하는 보안

**Block 50의 난수를 바꾸고 싶다면?**

1. Block 50의 prevrandao를 바꾸려면 → VRF 입력을 바꿔야 함
2. VRF 입력은 Block 49의 해시를 포함 → Block 49의 해시를 바꿔야 함
3. Block 49의 해시를 바꾸려면 → Block 49의 내용을 바꿔야 함
4. Block 49를 바꾸면 해시가 달라짐 → Block 48의 해시도 필요 → ...
5. **결국 제네시스 블록까지 되돌려야 함 → 사실상 불가능**

이것은 블록체인의 불변성(immutability)과 VRF의 결정성이 합쳐진 결과입니다.

---

## 10. 전체 흐름 요약: 하나의 주사위 게임이 처리되는 과정

Alice가 Tokasino에서 주사위 게임을 한다고 합시다.

```
시간순서:

[1] Block #99가 확정됨
    hash = 0xprev99...

[2] 시퀀서가 Block #100 생성 시작
    VRF input = 0xprev99... || 100
    VRF(input) → prevrandao = 0x3a8f...

[3] Alice가 TX 전송: play(3) + 0.01 ETH
    "주사위 3번에 0.01 ETH 베팅"

[4] 시퀀서가 Block #100에 Alice의 TX를 포함
    Engine API: forkchoiceUpdatedV3({prevRandao: 0x3a8f...})

[5] EL(op-reth)이 Block #100 실행
    Alice의 TX 실행:
      block.prevrandao = 0x3a8f...
      randomSeed = keccak256(0x3a8f... + 100 + Alice주소 + 0)
                 = 0x7c2d...
      rolledNumber = 0x7c2d... % 6 + 1 = 4
      won = (4 == 3) = false
      payout = 0

    이벤트 발생: GamePlayed(0, Alice, 3, 4, 0.01ETH, 0, false, 0x7c2d...)

[6] Block #100 확정
    hash = 0xblk100...

[7] 웹앱이 TX receipt를 받아서 이벤트 로그 파싱
    "결과: 4가 나왔습니다. 아쉽게도 졌네요."
    "VRF Seed: 0x7c2d..."

[8] Alice (또는 누구나) 검증 가능:
    keccak256(0x3a8f... + 100 + Alice주소 + 0) = 0x7c2d...
    0x7c2d... % 6 + 1 = 4 ← 맞음! 게임이 공정했음을 확인
```

**전체 소요시간: 블록 시간 1회 (약 3초)**

Chainlink VRF였다면: TX 1 (요청) → 1~2블록 대기 → TX 2 (콜백) = 최소 12~24초 + LINK 비용

---

## 11. 보안 분석: 왜 조작이 불가능한가?

### 공격 시나리오 1: 시퀀서가 난수를 조작하려고 한다

**시도:** 시퀀서가 자신에게 유리한 난수를 만들고 싶음

**실패하는 이유:**
- VRF는 결정적 함수 → 입력(이전 블록 해시 + 블록번호)이 정해지면 출력이 하나로 결정됨
- 다른 값을 제출하면 → 공개키로 VRF 증명을 검증하면 실패 → 즉시 발각
- 시퀀서가 할 수 있는 유일한 선택: 블록을 만들 것인가, 안 만들 것인가 (거부 공격)
- 하지만 블록을 안 만들면 → 네트워크가 멈추고 → 시퀀서 자신도 손해

### 공격 시나리오 2: 플레이어가 결과를 미리 알고 싶다

**시도:** 다음 블록의 prevrandao를 미리 알고 그에 맞게 베팅

**실패하는 이유:**
- prevrandao = VRF(이전 블록 해시 || 블록번호)
- 이전 블록 해시는 그 블록이 확정되기 전까지 모름
- VRF 비밀키를 모르면 출력을 계산할 수 없음
- 즉, **이전 블록이 확정된 후에야** 다음 블록의 난수가 결정됨
- 그때는 이미 베팅 TX가 제출된 후

### 공격 시나리오 3: MEV 봇이 트랜잭션 순서를 조작

**시도:** 멤풀에서 다른 사람의 베팅 TX를 보고, 자기 TX를 먼저/나중에 넣어 이득

**방어:**
- 같은 블록에서 TX 순서가 바뀌어도 각 게임의 seed가 다름 (msg.sender + games.length가 포함)
- TX를 재배열해도 **자기 TX의 결과는 바뀌지 않음**
- 단, 시퀀서가 MEV 봇이기도 하다면 → TX 포함 여부를 선택할 수 있음 → commit-reveal 패턴(RandomBeaconHistory)으로 방어

### 공격 시나리오 4: 과거 난수를 역산

**시도:** 과거 블록의 VRF 증명을 분석하여 비밀키를 역산

**실패하는 이유:**
- BLS12-381의 이산 로그 문제: 공개키 pk = sk × G 에서 sk를 구하는 것은 계산적으로 불가능 (128비트 보안 수준)
- VRF 출력 keccak256(signature)에서 signature를 역산하는 것도 불가능 (keccak256은 일방향 함수)

---

## 12. 부록: 코드 전문과 해설

### 파일 구조

```
crates/
  consensus/src/
    main.rs       — 시퀀서 메인 루프 (블록 생성)
    vrf.rs        — VRF 키쌍 + 증명/검증
    engine.rs     — Engine API 클라이언트
  node/src/
    main.rs       — op-reth 노드 진입점
    evm.rs        — 프리컴파일 0x0b 구현
  contracts/src/
    IRandomness.sol        — 프리컴파일 인터페이스
    TokasinoRandom.sol     — 난수 유틸리티 라이브러리
    RandomBeaconHistory.sol — 블록별 난수 저장 시스템 컨트랙트
    InstantDice.sol        — 주사위 게임 (즉시 해결)
    CoinFlip.sol           — 동전 던지기 (즉시 해결)
    Roulette.sol           — 룰렛 (즉시 해결)
    Lottery.sol            — 복권 (라운드 기반)
```

### 핵심 용어 정리

| 용어 | 의미 |
|------|------|
| **VRF** | Verifiable Random Function. 검증 가능한 난수 함수 |
| **BLS12-381** | 이더리움 2.0이 사용하는 타원곡선 암호 알고리즘 |
| **DST** | Domain Separation Tag. 서명 용도를 구분하는 태그 |
| **prevrandao** | 블록 헤더 필드. VRF 출력값이 여기에 저장됨 |
| **프리컴파일** | EVM에 네이티브로 내장된 함수. 특정 주소에 매핑 |
| **ChaCha20** | 스트림 암호 기반 CSPRNG. 시드를 받아 난수열 생성 |
| **CSPRNG** | Cryptographically Secure Pseudo-Random Number Generator |
| **Engine API** | CL↔EL 통신 프로토콜 (이더리움 2.0 표준) |
| **keccak256** | 이더리움이 사용하는 해시 함수 (SHA-3 계열) |
| **AtomicU64** | Rust의 원자적 64비트 정수. 멀티스레드 안전한 카운터 |
| **seed** | 난수 생성기의 초기값. 같은 시드 = 같은 난수열 |
