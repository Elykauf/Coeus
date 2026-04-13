// ── AnalyzeModal ─────────────────────────────────────────────────────────────────
// Depth-select + live-progress modal for re-analyzing a game with Stockfish.

import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { useToast } from './Toast'

const DEPTH_OPTIONS = [
  { value: 'Fast',     label: 'Fast',     sub: '~0.5s / move' },
  { value: 'Standard', label: 'Standard', sub: '~2s / move'   },
  { value: 'Deep',     label: 'Deep',     sub: '~10s / move'  },
]

function reconstructPgn(gameData) {
  const meta = gameData.metadata || {}
  const headers = []
  if (meta.event)       headers.push(`[Event "${meta.event}"]`)
  if (meta.site)        headers.push(`[Site "${meta.site}"]`)
  if (meta.date)        headers.push(`[Date "${meta.date}"]`)
  if (meta.round)       headers.push(`[Round "${meta.round}"]`)
  if (meta.white)       headers.push(`[White "${meta.white}"]`)
  if (meta.black)       headers.push(`[Black "${meta.black}"]`)
  if (meta.result)      headers.push(`[Result "${meta.result}"]`)
  if (meta.whiteElo)    headers.push(`[WhiteElo "${meta.whiteElo}"]`)
  if (meta.blackElo)    headers.push(`[BlackElo "${meta.blackElo}"]`)
  if (meta.eco)         headers.push(`[ECO "${meta.eco}"]`)
  if (meta.timeControl) headers.push(`[TimeControl "${meta.timeControl}"]`)
  const moves = gameData.moves || []
  let movesStr = ''
  moves.forEach((m, i) => {
    if (i % 2 === 0) movesStr += `${Math.floor(i / 2) + 1}. `
    movesStr += m.san + ' '
  })
  movesStr += (meta.result || '*')
  return (headers.length ? headers.join('\n') + '\n\n' : '') + movesStr.trim()
}

export default function AnalyzeModal({ game, onCancel, onComplete }) {
  const currentDepth = game?.analysis_depth || null
  const [depth, setDepth] = useState(currentDepth && currentDepth !== 'Deep' ? 'Deep' : 'Standard')
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [queuing, setQueuing] = useState(false)
  const wsRef = useRef(null)
  const startTimeRef = useRef(null)
  const [etaDisplay, setEtaDisplay] = useState('')
  const toast = useToast()

  const startAnalysis = () => {
    setError(null)
    setProgress({ percent: 0, current_move: 'Starting…', ply: 0, total: 0 })
    startTimeRef.current = Date.now()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/full-analysis`)
    wsRef.current = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({
        title: game.title || game.metadata?.event || 'Game',
        pgn: game.raw_pgn || reconstructPgn(game),
        depth,
        game_uuid: game.uuid,
      }))
    }

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.status === 'progress') {
        setProgress(prev => ({ ...prev, ...data }))
      } else if (data.status === 'success') {
        socket.close()
        wsRef.current = null
        onComplete(data, depth)
      } else if (data.status === 'error') {
        setError(data.message || 'Analysis failed')
        setProgress(null)
        socket.close()
        wsRef.current = null
      }
    }

    socket.onerror = () => {
      setError('Connection error')
      setProgress(null)
      wsRef.current = null
    }
  }

  const addToQueue = async () => {
    setQueuing(true)
    setError(null)
    try {
      await axios.post('/api/queue', {
        game_uuid: game.uuid,
        game_id: game.id,
        title: game.title || game.metadata?.event || 'Game',
        pgn: game.raw_pgn || reconstructPgn(game),
        depth,
      })
      toast('Added to analysis queue', 'info')
      window.dispatchEvent(new CustomEvent('chess:queue-refresh'))
      onCancel()
    } catch (e) {
      setError('Failed to add to queue')
    }
    setQueuing(false)
  }

  const cancel = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    onCancel()
  }

  // ETA timer
  useEffect(() => {
    if (!progress || !startTimeRef.current) { setEtaDisplay(''); return }
    const pct = progress.percent || 0
    if (pct <= 0) { setEtaDisplay('Calculating…'); return }

    const tick = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      const rate = pct / elapsed
      const remaining = (100 - pct) / rate
      if (remaining < 60) setEtaDisplay(`~${Math.ceil(remaining)}s remaining`)
      else {
        const m = Math.floor(remaining / 60)
        const s = Math.ceil(remaining % 60)
        setEtaDisplay(`~${m}m ${s}s remaining`)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [progress?.percent, progress?.ply])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={progress ? undefined : cancel}
    >
      <div className="card analysis-progress-modal" style={{ width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>

        {!progress ? (
          <>
            <div className="analysis-progress-header">
              <h2>Analyze Game</h2>
              {currentDepth && <span className="analysis-depth-badge">{currentDepth}</span>}
            </div>
            <div className="analysis-progress-body">
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 'var(--space-lg)' }}>
                {currentDepth
                  ? <>Currently analyzed at <strong>{currentDepth}</strong> depth. Upgrade to a deeper search for more accurate evaluation.</>
                  : "This game hasn't been analyzed yet. Choose a depth to run Stockfish evaluation."}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                {DEPTH_OPTIONS.map(opt => {
                  const depthRank = { Fast: 0, Standard: 1, Deep: 2 }
                  const isUpgrade = currentDepth && (depthRank[opt.value] ?? 0) > (depthRank[currentDepth] ?? 0)
                  const isCurrent = currentDepth === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setDepth(opt.value)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        border: `2px solid ${depth === opt.value ? 'var(--accent-gold)' : 'var(--border-std)'}`,
                        background: depth === opt.value ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
                        color: isCurrent ? 'var(--text-muted)' : 'var(--text-primary)', transition: 'all 0.15s',
                        opacity: isCurrent ? 0.5 : 1,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{opt.label} {isCurrent && '(current)'}</span>
                      <span style={{ fontSize: 12, color: isUpgrade ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                        {isUpgrade ? '↑ Upgrade' : opt.sub}
                      </span>
                    </button>
                  )
                })}
              </div>
              {error && <div style={{ color: '#e05c5c', fontSize: 12, marginBottom: 'var(--space-md)' }}>{error}</div>}
            </div>

            <div className="analysis-progress-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <button className="btn btn-secondary" onClick={cancel}>Cancel</button>
                <button className="btn btn-secondary" onClick={addToQueue} disabled={queuing} style={{ marginLeft: 0 }}>
                  {queuing ? 'Adding…' : '+ Queue'}
                </button>
              </div>
              <button className="btn btn-primary" onClick={startAnalysis}>Start →</button>
            </div>
          </>
        ) : (
          <>
            <div className="analysis-progress-header">
              <h2>Analyzing Game</h2>
              <span className="analysis-depth-badge">Stockfish {depth}</span>
            </div>

            <div className="analysis-progress-body">
              <div className="analysis-stats-row">
                <div className="analysis-stat">
                  <span className="analysis-stat-label">Progress</span>
                  <span className="analysis-stat-value mono">{progress.ply > 0 ? `${progress.ply} / ${progress.total}` : '—'}</span>
                </div>
                <div className="analysis-stat">
                  <span className="analysis-stat-label">Complete</span>
                  <span className="analysis-stat-value mono">{progress.percent || 0}%</span>
                </div>
                <div className="analysis-stat">
                  <span className="analysis-stat-label">ETA</span>
                  <span className="analysis-stat-value mono">{etaDisplay || 'Calculating…'}</span>
                </div>
              </div>

              <div className="analysis-track">
                <div className="analysis-track-fill" style={{ width: `${progress.percent || 0}%` }} />
              </div>

              <div className="analysis-current-move">
                <div className="label">Current Move</div>
                <div className="value">
                  {progress.current_move
                    ? `${Math.ceil(progress.ply / 2)}${progress.ply % 2 === 0 ? '...' : '.'} ${progress.current_move}`
                    : 'Initializing…'}
                </div>
              </div>
            </div>

            <div className="analysis-progress-footer">
              <button className="btn btn-secondary" onClick={cancel}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
