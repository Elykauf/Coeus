import React, { useMemo } from 'react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCplColor(cpl) {
  if (cpl == null) return 'var(--text-muted)'
  if (cpl === 0)    return 'var(--eval-best)'
  if (cpl < 15)     return 'var(--eval-excellent)'
  if (cpl < 40)     return 'var(--eval-good)'
  if (cpl < 80)     return 'var(--eval-inaccuracy)'
  if (cpl < 200)    return 'var(--eval-mistake)'
  return 'var(--eval-blunder)'
}

function getCplSymbol(cpl) {
  if (cpl == null) return ''
  if (cpl === 0)   return '★'
  if (cpl < 15)    return '!'
  if (cpl < 40)    return ''
  if (cpl < 80)    return '?!'
  if (cpl < 200)   return '?'
  return '??'
}

function getCplLabel(cpl) {
  if (cpl == null) return null
  if (cpl === 0)   return 'Best'
  if (cpl < 15)    return 'Excellent'
  if (cpl < 40)    return 'Good'
  if (cpl < 80)    return 'Inaccuracy'
  if (cpl < 200)   return 'Mistake'
  return 'Blunder'
}

// ── MoveList Component ───────────────────────────────────────────────────────

/**
 * Unified, compact scoresheet component used across Review and Analysis tabs.
 *
 * Props:
 *   moves               — flat array of move objects (from analysis.analysis)
 *   currentMoveIndex    — ply index of the currently selected move (0-based, starting at white's first move = 0)
 *   onMoveClick         — (plyIndex) => void; called when a move cell is clicked
 *   explorationMode      — if true, disable move click navigation
 *   guessMode           — if true, hide future moves (opacity trick)
 *   guessSubmitted      — if true and guessMode, reveal hidden moves
 *   showCpl             — show CPL badge next to moves (default true)
 *   style               — extra styles for the container
 */
export default function MoveList({
  moves = [],
  currentMoveIndex = -1,
  onMoveClick,
  explorationMode = false,
  guessMode = false,
  guessSubmitted = false,
  showCpl = true,
  style,
}) {
  // Build white/black pairs the same way Analyze.jsx does
  const moveRows = useMemo(() => {
    const rows = []
    for (let i = 0; i < moves.length; i += 2) {
      rows.push({ num: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] })
    }
    return rows
  }, [moves])

  const handleClick = (plyIndex) => {
    if (explorationMode || !onMoveClick) return
    onMoveClick(plyIndex)
  }

  return (
    <div className="card" style={{ padding: 'var(--space-md)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style }}>
      <h3 style={{ fontSize: 12, margin: '0 0 var(--space-sm) 0', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        Moves
      </h3>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {moveRows.map((row, rowIdx) => {
              const whitePly = rowIdx * 2
              const blackPly = rowIdx * 2 + 1
              const wColor = getCplColor(row.white?.cpl)
              const bColor = getCplColor(row.black?.cpl)
              const wSymbol = getCplSymbol(row.white?.cpl)
              const bSymbol = getCplSymbol(row.black?.cpl)
              const wLabel = getCplLabel(row.white?.cpl)
              const bLabel = getCplLabel(row.black?.cpl)

              const whiteActive = currentMoveIndex === whitePly
              const blackActive = currentMoveIndex === blackPly

              // In guess mode, future moves are dimmed until revealed
              const whiteDimmed = guessMode && !guessSubmitted && currentMoveIndex < whitePly
              const blackDimmed = guessMode && !guessSubmitted && currentMoveIndex < blackPly

              return (
                <tr key={rowIdx} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                  {/* Move number */}
                  <td style={{
                    padding: '5px 6px',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    width: 28,
                    textAlign: 'right',
                    fontWeight: 600,
                  }}>
                    {row.num}.
                  </td>

                  {/* White move cell */}
                  <td
                    onClick={() => handleClick(whitePly)}
                    title={wLabel ? `${wLabel}${row.white?.cpl > 0 ? ` (−${row.white.cpl} cp)` : ''}` : null}
                    style={{
                      padding: '5px 8px',
                      cursor: explorationMode || !onMoveClick ? 'default' : 'pointer',
                      fontWeight: 700,
                      background: whiteActive ? 'var(--accent-dim)' : 'transparent',
                      borderLeft: wColor ? `3px solid ${wColor}` : '3px solid transparent',
                      color: whiteDimmed ? 'transparent' : 'var(--text-primary)',
                      userSelect: 'none',
                      transition: 'background var(--transition-fast)',
                      position: 'relative',
                    }}
                  >
                    {row.white?.san || '…'}
                    {showCpl && wSymbol && (
                      <span style={{
                        fontSize: 14,   // larger than old 9px
                        color: wColor,
                        marginLeft: 4,
                        fontWeight: 700,
                        lineHeight: 1,
                      }}>
                        {wSymbol}
                      </span>
                    )}
                  </td>

                  {/* Black move cell */}
                  {row.black ? (
                    <td
                      onClick={() => handleClick(blackPly)}
                      title={bLabel ? `${bLabel}${row.black?.cpl > 0 ? ` (−${row.black.cpl} cp)` : ''}` : null}
                      style={{
                        padding: '5px 8px',
                        cursor: explorationMode || !onMoveClick ? 'default' : 'pointer',
                        fontWeight: 700,
                        background: blackActive ? 'var(--accent-dim)' : 'transparent',
                        borderLeft: bColor ? `3px solid ${bColor}` : '3px solid transparent',
                        color: blackDimmed ? 'transparent' : 'var(--text-primary)',
                        userSelect: 'none',
                        transition: 'background var(--transition-fast)',
                      }}
                    >
                      {row.black?.san}
                      {showCpl && bSymbol && (
                        <span style={{
                          fontSize: 14,   // larger than old 9px
                          color: bColor,
                          marginLeft: 4,
                          fontWeight: 700,
                          lineHeight: 1,
                        }}>
                          {bSymbol}
                        </span>
                      )}
                    </td>
                  ) : (
                    <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>…</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
