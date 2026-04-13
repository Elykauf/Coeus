// ── OpeningExplorer ─────────────────────────────────────────────────────────────
// Interactive opening tree: play moves on a board and see your historical record
// for each position.

import { useState, useEffect, useCallback } from 'react'
import { Chess } from 'chess.js'
import axios from 'axios'
import { Chessboard } from 'react-chessboard'
import { useBoardColors } from '../hooks/useBoardColors'
import { WDLBar, EvalBar, ResultChip } from './ui'

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function formatPlayerStats(m) {
  if (!m.player_games) return '—'
  const w = m.player_wins || 0
  const l = m.player_losses || 0
  const d = m.player_draws || 0
  return `${w} W ${l} L ${d} D`
}

export default function OpeningExplorer() {
  const boardColors = useBoardColors()
  const [fenStack, setFenStack] = useState([INITIAL_FEN])
  const [sanStack, setSanStack] = useState([])
  const [moves, setMoves] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedSan, setExpandedSan] = useState(null)

  const currentFen = fenStack[fenStack.length - 1]

  const fetchTree = useCallback(async (fen) => {
    setLoading(true)
    setExpandedSan(null)
    setGames([])
    try {
      const res = await axios.get('/api/db/opening-tree', { params: { fen } })
      setMoves(res.data.moves)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTree(INITIAL_FEN) }, [fetchTree])

  const playMove = (san) => {
    const g = new Chess(currentFen)
    try {
      g.move(san)
      const newFen = g.fen()
      setFenStack(s => [...s, newFen])
      setSanStack(s => [...s, san])
      fetchTree(newFen)
    } catch (e) { console.error('Invalid move', san, e) }
  }

  const goBack = () => {
    if (fenStack.length <= 1) return
    const prev = fenStack[fenStack.length - 2]
    setFenStack(s => s.slice(0, -1))
    setSanStack(s => s.slice(0, -1))
    fetchTree(prev)
  }

  const reset = () => {
    setFenStack([INITIAL_FEN])
    setSanStack([])
    fetchTree(INITIAL_FEN)
  }

  const toggleGames = async (san) => {
    if (expandedSan === san) { setExpandedSan(null); setGames([]); return }
    setExpandedSan(san)
    try {
      const res = await axios.get('/api/db/opening-tree/games', { params: { fen: currentFen, san } })
      setGames(res.data)
    } catch (e) { console.error(e) }
  }

  const total = moves.reduce((s, m) => s + m.games, 0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 'var(--space-xl)', alignItems: 'start', maxWidth: 1060, margin: '0 auto' }}>

      {/* Left: board + breadcrumb */}
      <div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 'var(--space-sm)', minHeight: 24 }}>
            <span style={{ fontSize: 12, color: 'var(--accent-gold)', cursor: 'pointer', fontWeight: 700 }} onClick={reset}>Start</span>
            {sanStack.map((san, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>›</span>
                <span style={{ fontSize: 12, color: i === sanStack.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: i === sanStack.length - 1 ? 600 : 400 }}>{san}</span>
              </span>
            ))}
          </div>

          <div className="board-wrapper">
            <Chessboard
              position={currentFen}
              boardWidth={388}
              arePiecesDraggable={false}
              customDarkSquareStyle={{ backgroundColor: boardColors.dark }}
              customLightSquareStyle={{ backgroundColor: boardColors.light }}
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
            <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12 }} onClick={goBack} disabled={fenStack.length <= 1}>← Back</button>
            <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12 }} onClick={reset}>Reset</button>
          </div>
        </div>

        {total > 0 && (
          <div className="card" style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
              {total} GAME{total !== 1 ? 'S' : ''} FROM THIS POSITION
            </div>
            <WDLBar
              white={moves.reduce((s, m) => s + m.white_wins, 0)}
              draws={moves.reduce((s, m) => s + m.draws, 0)}
              black={moves.reduce((s, m) => s + m.black_wins, 0)}
              total={total}
            />
          </div>
        )}
      </div>

      {/* Right: move table + game list */}
      <div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 140px 70px', gap: 'var(--space-md)', padding: '8px var(--space-md)', borderBottom: '1px solid var(--border-dim)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span>Move</span>
            <span>Games</span>
            <span>Your Record</span>
            <span>W / D / B</span>
            <span style={{ textAlign: 'right' }}>Eval</span>
          </div>

          {loading && <div style={{ padding: 'var(--space-lg)', color: 'var(--text-secondary)', textAlign: 'center' }}>Loading…</div>}
          {!loading && moves.length === 0 && <div style={{ padding: 'var(--space-lg)', color: 'var(--text-secondary)', textAlign: 'center' }}>No games found from this position in your database.</div>}

          {moves.map((m, idx) => {
            const pct = total > 0 ? (m.games / total) * 100 : 0
            const isExpanded = expandedSan === m.san
            return (
              <div key={m.san} style={{ borderTop: idx > 0 ? '1px solid var(--border-dim)' : 'none' }}>
                <div
                  style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 140px 70px', gap: 'var(--space-md)', alignItems: 'center', padding: '10px var(--space-md)', cursor: 'pointer', background: isExpanded ? 'var(--accent-gold-dim)' : '', transition: 'background var(--transition-fast)' }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '' }}
                  onClick={() => playMove(m.san)}
                >
                  <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent-gold)' }}>{m.san}</span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-gold)', opacity: 0.6 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 24, color: 'var(--text-primary)' }}>{m.games}</span>
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 600, color: m.player_games ? 'var(--text-primary)' : 'var(--text-muted)', textAlign: 'center' }}>
                    {formatPlayerStats(m)}
                  </div>

                  <WDLBar white={m.white_wins} draws={m.draws} black={m.black_wins} total={m.games} />

                  <div style={{ textAlign: 'right' }}>
                    <EvalBar value={m.avg_eval} />
                  </div>
                </div>

                <button
                  style={{ width: '100%', textAlign: 'left', padding: '4px var(--space-md)', fontSize: 11, color: 'var(--text-muted)', background: isExpanded ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)', border: 'none', borderTop: '1px solid var(--border-dim)', cursor: 'pointer' }}
                  onClick={() => toggleGames(m.san)}
                >
                  {isExpanded ? '▲ Hide games' : `▼ ${m.games} game${m.games !== 1 ? 's' : ''}`}
                </button>

                {isExpanded && games.map((g) => (
                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px var(--space-lg)', borderTop: '1px solid var(--border-dim)', background: 'var(--bg-surface)', fontSize: 12 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{g.white}</span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>vs</span>
                      <span style={{ fontWeight: 600 }}>{g.black}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>· move {g.ply} · {g.date}</span>
                    </div>
                    <ResultChip result={g.result} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
