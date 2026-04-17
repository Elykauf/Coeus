import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import AggregateFairPlayPanel from './AggregateFairPlayPanel'

const CONFIDENCE_COLOR = { low: '#4caf8c', medium: '#F59E0B', high: '#EF4444' }

export default function PlayerFairPlayModal({ onClose, prefillJobId, prefillReport, prefillTitle }) {
  const [phase, setPhase] = useState(prefillJobId ? 'live' : 'form')   // 'form' | 'live'
  const [platform, setPlatform] = useState('chesscom')
  const [username, setUsername] = useState('')
  const [depth, setDepth] = useState('Quick')
  const [games, setGames] = useState(25)
  const [jobId, setJobId] = useState(prefillJobId || null)
  const [job, setJob] = useState(prefillReport ? { status: 'done', cheat_aggregate: prefillReport, title: prefillTitle, games_analyzed: prefillReport?.game_count, progress: { percent: 100 } } : null)
  const [error, setError] = useState(null)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)

  // WebSocket subscription — only active during live phase
  useEffect(() => {
    if (phase !== 'live' || !jobId) return

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/queue`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        const jobs = JSON.parse(e.data)
        const found = jobs.find(j => j.job_id === jobId)
        if (found) setJob(found)
      }
      ws.onclose = () => {
        wsRef.current = null
        reconnectRef.current = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      clearTimeout(reconnectRef.current)
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    }
  }, [phase, jobId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim()) return
    setError(null)
    try {
      const res = await axios.post('/api/analyze/cheat-report/player', {
        platform, username: username.trim(), depth, games,
      })
      setJobId(res.data.job_id)
      setPhase('live')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start analysis')
    }
  }

  const isDone = job?.status === 'done'
  const isError = job?.status === 'error'
  const pct = job?.progress?.percent ?? 0
  const aggregate = job?.cheat_aggregate

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.75)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)',
          width: 580, maxHeight: '88vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Check a Player</span>
          <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={onClose}>
            Close
          </button>
        </div>

        {/* ── FORM PHASE ─────────────────────────────────────────────── */}
        {phase === 'form' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {/* Platform */}
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>Platform</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['chesscom', 'Chess.com'], ['lichess', 'Lichess']].map(([val, label]) => (
                  <label key={val} style={{
                    flex: 1, textAlign: 'center', padding: '7px 12px',
                    borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: platform === val ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: platform === val ? 'var(--bg-base)' : 'var(--text-primary)',
                    border: `1px solid ${platform === val ? 'var(--accent)' : 'var(--border-dim)'}`,
                  }}>
                    <input type="radio" value={val} checked={platform === val}
                      onChange={() => setPlatform(val)} style={{ display: 'none' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Username */}
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>Username</div>
              <input
                className="appbar-input"
                style={{ width: '100%', padding: '7px 10px' }}
                placeholder={platform === 'chesscom' ? 'e.g. magnuscarlsen' : 'e.g. DrNykterstein'}
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            {/* Games + Depth row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>Games</div>
                <select className="appbar-input" style={{ width: '100%', padding: '7px 10px' }}
                  value={games} onChange={e => setGames(Number(e.target.value))}>
                  <option value={25}>Standard (25)</option>
                  <option value={100}>Exhaustive (100)</option>
                </select>
              </div>
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>Depth</div>
                <select className="appbar-input" style={{ width: '100%', padding: '7px 10px' }}
                  value={depth} onChange={e => setDepth(e.target.value)}>
                  <option value="Quick">Quick (0.3s)</option>
                  <option value="Fast">Fast (0.5s)</option>
                  <option value="Standard">Standard (2s)</option>
                  <option value="Deep">Deep (10s)</option>
                </select>
              </div>
            </div>

            {error && <div style={{ color: '#EF4444', fontSize: 13 }}>{error}</div>}

            <button type="submit" className="btn btn-primary" style={{ padding: '8px', fontWeight: 700 }}>
              Start Fair-Play Analysis
            </button>
          </form>
        )}

        {/* ── LIVE PHASE ─────────────────────────────────────────────── */}
        {phase === 'live' && (
          <>
            {/* Progress section */}
            <div style={{
              background: 'var(--bg-elevated)', borderRadius: 8,
              padding: '12px 16px', marginBottom: 'var(--space-lg)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
                  {job?.title || `Analyzing ${username}…`}
                </span>
                {isDone && (
                  <span style={{ fontSize: 11, color: CONFIDENCE_COLOR[aggregate?.overall_confidence] || '#4caf8c', fontWeight: 700 }}>
                    {aggregate?.overall_confidence?.toUpperCase()} RISK
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: isDone ? '#4caf8c' : 'var(--accent)',
                  transition: 'width 0.4s ease',
                }} />
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {isError
                    ? `Error: ${job.error}`
                    : isDone
                      ? `Done — ${job.games_analyzed} games analyzed`
                      : job?.progress?.current_game?.startsWith('Fetching')
                        ? job.progress.current_game
                        : job?.progress?.current_game
                          ? `Game ${job.progress.current_game}`
                          : 'Starting…'}
                </span>
                {!isDone && !isError && job?.games_analyzed > 0 && (
                  <span>{job.games_analyzed} analyzed so far</span>
                )}
              </div>

              {!isDone && !isError && job?.progress?.game_title && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.progress.game_title}
                </div>
              )}
            </div>

            {/* Live aggregate — renders inline (not as a separate modal) */}
            {aggregate && (
              <LiveAggregate report={aggregate} />
            )}

            {!aggregate && !isError && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24, fontSize: 13 }}>
                Waiting for first game to complete…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Inline aggregate display (no close button, no outer modal chrome)
function LiveAggregate({ report }) {
  const CONFIDENCE_COLOR = { low: '#4caf8c', medium: '#F59E0B', high: '#EF4444' }

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 'var(--space-lg)' }}>
        {[
          ['Games', report.game_count],
          ['Avg Score', report.avg_fairness_score?.toFixed(2)],
        ].map(([label, val]) => (
          <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Confidence</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: CONFIDENCE_COLOR[report.overall_confidence] || 'var(--text-primary)' }}>
            {report.overall_confidence?.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Suspicion distribution */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Suspicion Distribution
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['low', '#4caf8c'], ['medium', '#F59E0B'], ['high', '#EF4444']].map(([level, color]) => {
            const count = report.score_distribution?.[level] || 0
            const pct = report.game_count ? Math.round(count / report.game_count * 100) : 0
            return (
              <div key={level} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: 8, borderRadius: 4, background: color,
                  opacity: 0.2 + (pct / 100) * 0.8, marginBottom: 4,
                }} />
                <div style={{ fontSize: 10, color, fontWeight: 600 }}>{level.toUpperCase()}</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{count}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top suspicious games */}
      {report.top_suspicious?.length > 0 && (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Most Suspicious Games
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {report.top_suspicious.map((g, i) => (
              <div key={g.game_id} style={{
                background: 'var(--bg-elevated)', borderRadius: 6, padding: '7px 12px',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
              }}>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 16 }}>#{i + 1}</span>
                <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.summary?.split('.')[0] || `Game ${g.game_id}`}
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                  color: CONFIDENCE_COLOR[g.confidence] || 'var(--text-muted)',
                  background: `${CONFIDENCE_COLOR[g.confidence]}22`,
                }}>
                  {g.confidence?.toUpperCase()}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                  {g.fairness_score?.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, fontStyle: 'italic',
        borderTop: '1px solid var(--border)', paddingTop: 'var(--space-sm)',
      }}>
        {report.disclaimer}
      </div>
    </div>
  )
}
