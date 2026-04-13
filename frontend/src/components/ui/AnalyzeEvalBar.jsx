// ── AnalyzeEvalBar ─────────────────────────────────────────────────────────────
// Vertical eval bar for Analyze.jsx: shows win-probability split (white/black).
// pct = 0 (black winning) → 100 (white winning).

export default function AnalyzeEvalBar({ pct, orientation = 'white' }) {
  const whitePct = orientation === 'black' ? 100 - pct : pct
  return (
    <div style={{
      width: 14,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 4,
      overflow: 'hidden',
      border: '1px solid var(--border-dim)',
      flexShrink: 0,
    }}>
      <div style={{
        flex: 100 - whitePct,
        background: orientation === 'black' ? '#e8e8e8' : '#1e1e1e',
        transition: 'flex 0.4s ease',
      }} />
      <div style={{
        flex: whitePct,
        background: orientation === 'black' ? '#1e1e1e' : '#e8e8e8',
        transition: 'flex 0.4s ease',
      }} />
    </div>
  )
}
