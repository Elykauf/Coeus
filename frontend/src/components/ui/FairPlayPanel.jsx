// ── FairPlayPanel ─────────────────────────────────────────────────────────────
// Opponent fair-play audit panel for the Review screen.
// Shows fairness score, phase breakdown, flagged moves, and a summary.

import { useState, useEffect } from 'react'
import axios from 'axios'

const LABEL_CONFIG = {
  FAIR:               { color: '#4caf8c', bg: 'rgba(76,175,140,0.12)',  border: 'rgba(76,175,140,0.4)',  icon: '✓' },
  SUSPICIOUS:         { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',   border: 'rgba(245,158,11,0.4)',   icon: '?' },
  LIKELY_MANIPULATED: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.4)',    icon: '!!' },
  NO_DATA:            { color: '#8b92b0', bg: 'rgba(139,146,176,0.12)', border: 'rgba(139,146,176,0.4)', icon: '—' },
}

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function FlagHistoryGraph({ history }) {
  if (!history || history.length === 0) return null
  
  const data = history.map((val, i) => ({ move: i + 1, score: val }))
  
  return (
    <div style={{ height: 120, width: '100%', marginTop: 8, background: 'rgba(0,0,0,0.1)', borderRadius: 4, padding: '8px 4px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="move" hide />
          <YAxis domain={[0, 100]} hide />
          <Tooltip 
            contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10 }}
            labelFormatter={(l) => `Move ${l}`}
          />
          <Line 
            type="monotone" 
            dataKey="score" 
            stroke="var(--accent-gold)" 
            strokeWidth={2} 
            dot={false}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function PhaseBar({ phase, accuracy }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{phase}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{accuracy}%</span>
      </div>
      <div style={{ height: 5, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${accuracy}%`, height: '100%', background: 'var(--accent-gold)', opacity: 0.7, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function FlaggedMoveRow({ move }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      borderTop: '1px solid var(--border-dim)',
      padding: '8px var(--space-md)',
      cursor: 'pointer',
    }}
      onClick={() => setExpanded(e => !e)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent-gold)' }}>
            {move.ply % 2 === 1 ? `${Math.ceil(move.ply / 2)}.` : `${Math.ceil(move.ply / 2)}...`} {move.san}
          </span>
          <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>
            {move.accuracy === 100 ? '100%' : `${move.accuracy}%`}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {move.time_spent}s
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#EF4444', lineHeight: 1.5 }}>
          {move.reason}
        </div>
      )}
    </div>
  )
}

export default function FairPlayPanel({ gameId, opponentSide, opponentColor }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const side = opponentSide === 'opponent' ? 'opponent' : 'self'

  useEffect(() => {
    if (!gameId) return
    setLoading(true)
    setError(null)
    setReport(null)

    axios.post('/api/analyze/cheat-report', { game_id: gameId, side })
      .then(r => setReport(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to load report'))
      .finally(() => setLoading(false))
  }, [gameId, side])

  const config = LABEL_CONFIG[report?.fairness_label] || LABEL_CONFIG.NO_DATA
  const phaseAcc = report?.phase_accuracy || {}

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${config.border}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      marginTop: 'var(--space-md)',
    }}>
      {/* Header — always visible */}
      <div
        style={{
          background: config.bg,
          padding: '10px var(--space-md)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 16 }}>{config.icon}</span>
        <span style={{ fontWeight: 700, color: config.color, fontSize: 13 }}>
          {opponentColor} Fair Play: {report?.fairness_label || '…'}
        </span>
        {report && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            score {report.fairness_score?.toFixed(2)}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: 'var(--space-md)' }}>
          {loading && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 'var(--space-md)' }}>
              Analyzing opponent's moves…
            </div>
          )}

          {error && (
            <div style={{ color: '#EF4444', fontSize: 12 }}>{error}</div>
          )}

          {report && !loading && (
            <>
              {/* Phase accuracy bars */}
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Accuracy by Phase
                </div>
                <PhaseBar phase="opening" accuracy={phaseAcc.opening ?? 100} />
                <PhaseBar phase="middlegame" accuracy={phaseAcc.middlegame ?? phaseAcc.middle ?? 100} />
                <PhaseBar phase="endgame" accuracy={phaseAcc.endgame ?? phaseAcc.end ?? 100} />
              </div>

              {/* Key metrics row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 'var(--space-md)' }}>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Perfect Streak</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-gold)' }}>{report.perfect_streak_max}</div>
                </div>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Time Corr.</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: Math.abs(report.time_correlation) < 0.1 ? '#EF4444' : 'var(--accent-gold)' }}>
                    {report.time_correlation.toFixed(2)}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Luck Score</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: report.luck_score > 0 ? '#4caf8c' : '#EF4444' }}>
                    {report.luck_score > 0 ? '+' : ''}{report.luck_score.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Instant moves count */}
              {report.premove_count > 0 && (
                <div style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 6, padding: '6px 10px', marginBottom: 'var(--space-md)',
                  fontSize: 12, color: '#EF4444',
                }}>
                  {report.premove_count} instant move{report.premove_count !== 1 ? 's' : ''} detected (&lt;3s in complex positions)
                </div>
              )}

              {/* Flagged moves — replaced with History Graph if data exists */}
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Engine Correlation Over Time
                </div>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, overflow: 'hidden', padding: '12px var(--space-md)' }}>
                  <FlagHistoryGraph history={report.accuracy_history} />
                  <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Opening</span>
                    <span>Late Middle / End</span>
                  </div>
                </div>
              </div>

              {/* Summary paragraph */}
              <div style={{
                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 12px',
                fontStyle: 'italic',
              }}>
                {report.summary}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
