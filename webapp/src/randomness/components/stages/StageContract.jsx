import { useRandomness } from '../../context/RandomnessContext.jsx'
import { sh, full } from '../../lib/helpers.js'
import TryItDice from '../features/TryItDice.jsx'

const DICE_FACES = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685']

export default function StageContract() {
  const { traced } = useRandomness()

  return (
    <>
      <div className="d-section">
        <div className="d-label">Block #{traced.blockNumber}에서 주사위 게임 실행</div>
        <div className="d-text">
          플레이어 <span className="key">{sh(traced.player, 6)}</span>가 Game #{traced.gameId}를 플레이합니다.
          컨트랙트가 <span className="key">block.prevrandao</span>를 읽어 고유한 게임 시드를 만들어요.
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">Solidity 코드 (실제 값 대입)</div>
        <div className="d-code">
          {'bytes32 randomSeed = '}<span className="fn">keccak256</span>(<span className="fn">abi.encodePacked</span>({'\n'}
          {'    block.prevrandao,   '}<span className="cm">// {sh(traced.prevrandao, 10)}</span>{'\n'}
          {'    block.number,       '}<span className="cm">// {traced.blockNumber}</span>{'\n'}
          {'    msg.sender,         '}<span className="cm">// {sh(traced.player, 6)}</span>{'\n'}
          {'    games.length        '}<span className="cm">// {traced.gameId}</span>{'\n'}
          {'));\n'}
          <span className="cm">// randomSeed = {sh(traced.gameSeed, 10)}</span>{'\n\n'}
          {'uint8 rolled = uint8(uint256(randomSeed) % '}<span className="num">6</span>{') + '}<span className="num">1</span>{';\n'}
          <span className="cm">// rolled = {traced.diceResult}</span>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">값의 흐름 (Block #{traced.blockNumber})</div>
        <div className="d-flow">
          <span className="label">prevrandao</span> <span className="val">{sh(traced.prevrandao, 12)}</span><br />
          <span className="label">block.number</span> <span className="val">{traced.blockNumber}</span><br />
          <span className="label">msg.sender</span> <span className="val">{sh(traced.player, 8)}</span><br />
          <span className="label">games.length</span> <span className="val">{traced.gameId}</span><br />
          <span className="arr">──── keccak256 ────</span><br />
          <span className="label">gameSeed</span> <span className="hl">{full(traced.gameSeed)}</span><br />
          <span className="arr">──── % 6 + 1 ────</span><br />
          <span className="label">dice result</span>{' '}
          <span className="hl" style={{ fontSize: '0.8rem' }}>
            {traced.diceResult}  {DICE_FACES[traced.diceResult] || ''}
          </span>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">왜 4가지를 섞나요?</div>
        <div className="d-flow">
          같은 블록에서 Alice와 Bob이 각각 주사위를 굴리면:<br /><br />
          Alice: keccak256(<span className="val">{sh(traced.prevrandao, 4)}</span> + {traced.blockNumber} + <span className="hl">0xAlice...</span> + 42)<br />
          &nbsp;&nbsp;= <span className="val">0xaaa...</span> % 6 + 1 = <span className="hl">결과 A</span><br /><br />
          Bob: &nbsp;keccak256(<span className="val">{sh(traced.prevrandao, 4)}</span> + {traced.blockNumber} + <span className="hl">0xBob...</span> + 43)<br />
          &nbsp;&nbsp;= <span className="val">0xbbb...</span> % 6 + 1 = <span className="hl">결과 B (다름!)</span><br /><br />
          prevrandao는 같지만 <span className="hl">주소와 gameId가 다르니까 다른 결과</span>
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">투명성 — 누구나 검증 가능</div>
        <div className="d-text">
          게임 결과와 함께 <span className="key">randomSeed</span>가 이벤트 로그에 기록됩니다.<br />
          <span className="key">{sh(traced.gameSeed, 10)}</span>을 가지고 누구나{' '}
          <span className="key">% 6 + 1 = {traced.diceResult}</span>을 재계산할 수 있어요.
        </div>
      </div>

      <div className="d-section">
        <div className="d-label">직접 해보기 — Try It!</div>
        <TryItDice />
      </div>
    </>
  )
}
