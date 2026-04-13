// ── ScoreSheetRow ──────────────────────────────────────────────────────────────
// A single table row in the scoresheet editor: white cell | black cell.
// Handles hover actions (shift, delete, insert) and illegal/not-top5 states.

import { useState } from 'react'

const RESULT_STRINGS = ['White won', 'Black won', 'Draw', 'Unfinished']

export default function ScoreSheetRow({
  m, rI,
  illegalSide, illegalIndex,
  notTop5,
  handleCellClick,
  insertMove, shiftToBlack,
  isSelected,
  deleteMove,
}) {
  const [isHovered, setIsHovered] = useState(null)

  const isWResult = RESULT_STRINGS.includes(m.white)
  const isBResult = RESULT_STRINGS.includes(m.black)
  const isWIll = illegalIndex === rI && illegalSide === 'white' && !isWResult
  const isBIll = illegalIndex === rI && illegalSide === 'black' && !isBResult
  const illF = illegalIndex !== -1 ? (illegalSide === 'white' ? illegalIndex * 2 : illegalIndex * 2 + 1) : 9999
  const wNI = notTop5.includes(rI * 2)
  const bNI = notTop5.includes(rI * 2 + 1)
  const isDimmed = rI * 2 > illF

  const whiteCellClass = `score-cell-inner white-cell${isWIll ? ' illegal' : wNI ? ' not-top5' : ''}${isWResult ? ' result-cell' : ''}`
  const blackCellClass = `score-cell-inner black-cell${isBIll ? ' illegal' : bNI ? ' not-top5' : ''}${isBResult ? ' result-cell' : ''}`

  return (
    <tr className={isDimmed ? 'dimmed' : ''}>
      <td className="score-num-cell">{m.num}</td>

      {/* White cell */}
      <td
        onMouseEnter={() => setIsHovered('white')}
        onMouseLeave={() => setIsHovered(null)}
        className={`score-cell${isSelected.side === 'white' && isSelected.idx === rI ? ' selected' : ''}`}
      >
        <div className={whiteCellClass} onClick={() => handleCellClick(rI, 'white')}>
          <div className="cell-content">
            <span className="move-text">{m.white || '...'}</span>
            {m.whiteTime && <span className="time-text">[{(m.whiteTime)}]</span>}
            {wNI && <span title="Not in engine top moves">⚠️</span>}
          </div>
        </div>
        {isHovered === 'white' && (
          <div className="action-btns">
            <button className="action-btn shift" onClick={(e) => { e.stopPropagation(); shiftToBlack(rI) }}>→</button>
            <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); deleteMove(rI, 'white') }}>✕</button>
            <button className="action-btn insert" onClick={(e) => { e.stopPropagation(); insertMove(rI, 'white') }}>+</button>
          </div>
        )}
      </td>

      {/* Black cell */}
      <td
        onMouseEnter={() => setIsHovered('black')}
        onMouseLeave={() => setIsHovered(null)}
        className={`score-cell${isSelected.side === 'black' && isSelected.idx === rI ? ' selected' : ''}`}
      >
        <div className={blackCellClass} onClick={() => handleCellClick(rI, 'black')}>
          <div className="cell-content">
            <span className="move-text">{m.black || '...'}</span>
            {m.blackTime && <span className="time-text">[{(m.blackTime)}]</span>}
            {bNI && <span title="Not in engine top moves">⚠️</span>}
          </div>
        </div>
        {isHovered === 'black' && (
          <div className="action-btns">
            <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); deleteMove(rI, 'black') }}>✕</button>
            <button className="action-btn insert" onClick={(e) => { e.stopPropagation(); insertMove(rI, 'black') }}>+</button>
          </div>
        )}
      </td>
    </tr>
  )
}
