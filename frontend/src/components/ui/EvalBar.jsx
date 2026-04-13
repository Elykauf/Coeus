// ── EvalBar ───────────────────────────────────────────────────────────────────
// Compact horizontal eval bar showing centipawn advantage as a filled bar

export default function EvalBar({ value }) {
  if (value == null) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>

  const pawns = (value / 100).toFixed(2)
  const clamped = Math.max(-500, Math.min(500, value))
  const pct = ((clamped + 500) / 1000) * 100

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 48, height: 6,
        background: 'var(--bg-subtle)',
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-gold)' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {value > 0 ? '+' : ''}{pawns}
      </span>
    </div>
  )
}
