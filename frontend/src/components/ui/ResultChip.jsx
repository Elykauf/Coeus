// ── ResultChip ────────────────────────────────────────────────────────────────
// Displays a colored badge for a game result: "White wins", "Black wins", "Draw"

const RESULT_MAP = {
  '1-0':     ['White wins', '#5cb85c'],
  '0-1':     ['Black wins', '#e05c5c'],
  '1/2-1/2': ['Draw',       '#c9a84c'],
}

export default function ResultChip({ result }) {
  const [label, color] = RESULT_MAP[result] || [result || '?', '#8b92b0']
  return (
    <span style={{
      background: color + '22',
      color,
      border: `1px solid ${color}55`,
      fontWeight: 700,
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 4,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}
