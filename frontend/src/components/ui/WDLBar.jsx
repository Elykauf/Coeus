// ── WDLBar ───────────────────────────────────────────────────────────────────
// White / Draw / Black win-rate bar with percentage labels

export default function WDLBar({ white, draws, black, total }) {
  if (!total) return null

  const w = Math.round((white / total) * 100)
  const d = Math.round((draws / total) * 100)
  const b = 100 - w - d

  return (
    <div>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
        <div style={{ width: `${w}%`, background: '#e8eaf0' }} />
        <div style={{ width: `${d}%`, background: 'var(--accent-gold)' }} />
        <div style={{ width: `${b}%`, background: '#e05c5c' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
        <span style={{ color: '#e8eaf0' }}>{w}%</span>
        <span style={{ color: 'var(--accent-gold)' }}>{d}%</span>
        <span style={{ color: '#e05c5c' }}>{b}%</span>
      </div>
    </div>
  )
}
