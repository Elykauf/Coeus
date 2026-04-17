import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  BarChart, Bar, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const CONFIDENCE_COLOR = { low: '#4caf8c', medium: '#F59E0B', high: '#EF4444' }

export default function AggregateFairPlayPanel({ gameIds, side = 'opponent', onClose }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!gameIds?.length) return
    setLoading(true)
    setError(null)
    axios.post('/api/analyze/cheat-report/aggregate', { game_ids: gameIds, side })
      .then(r => setReport(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to load aggregate report'))
      .finally(() => setLoading(false))
  }, [gameIds, side])

  const distData = report
    ? [
        { label: 'Low', count: report.score_distribution?.low || 0, fill: '#4caf8c' },
        { label: 'Medium', count: report.score_distribution?.medium || 0, fill: '#F59E0B' },
        { label: 'High', count: report.score_distribution?.high || 0, fill: '#EF4444' },
      ]
    : []

  const trendData = (report?.accuracy_trend || []).map((acc, i) => ({ game: i + 1, accuracy: acc }))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)',
        width: 560, maxHeight: '85vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>
            Aggregate Fair-Play Report
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 12 }}>
            {gameIds.length} game{gameIds.length !== 1 ? 's' : ''} · {side}
          </span>
          <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={onClose}>
            Close
          </button>
        </div>

        {loading && (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>
            Analyzing {gameIds.length} games…
          </div>
        )}
        {error && <div style={{ color: '#EF4444', fontSize: 13 }}>{error}</div>}

        {report && !loading && (
          <>
            {/* Summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 'var(--space-lg)' }}>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Games</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{report.game_count}</div>
              </div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Avg Score</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{report.avg_fairness_score?.toFixed(2)}</div>
              </div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Confidence</div>
                <div style={{
                  fontSize: 14, fontWeight: 700,
                  color: CONFIDENCE_COLOR[report.overall_confidence] || 'var(--text-primary)',
                }}>
                  {report.overall_confidence?.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Score distribution bar chart */}
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Suspicion Distribution
              </div>
              <div style={{ height: 100 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 11 }}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {distData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Accuracy trend */}
            {trendData.length > 1 && (
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Accuracy Trend (per game)
                </div>
                <div style={{ height: 100 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="game" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 11 }}
                        formatter={v => [`${v}%`, 'Accuracy']}
                      />
                      <Line type="monotone" dataKey="accuracy" stroke="var(--accent-gold)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top suspicious games */}
            {report.top_suspicious?.length > 0 && (
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Most Suspicious Games
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {report.top_suspicious.map((g, i) => (
                    <div key={g.game_id} style={{
                      background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 12px',
                      display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
                    }}>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 14 }}>#{i + 1}</span>
                      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>Game {g.game_id}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                        color: CONFIDENCE_COLOR[g.confidence] || 'var(--text-muted)',
                        background: `${CONFIDENCE_COLOR[g.confidence]}22`,
                      }}>
                        {g.confidence?.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 11 }}>
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
          </>
        )}
      </div>
    </div>
  )
}
