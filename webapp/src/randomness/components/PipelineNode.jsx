export default function PipelineNode({ stage, num, title, sub, value, isActive, onClick }) {
  return (
    <div
      className={`pipe-node${isActive ? ' active' : ''}`}
      onClick={() => onClick(stage)}
    >
      <div className="pn-num">{num}</div>
      <div className="pn-title">{title}</div>
      <div className="pn-sub">{sub}</div>
      {value !== undefined && <div className="pn-val">{value}</div>}
    </div>
  )
}
