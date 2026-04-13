// ── ResultSelect ──────────────────────────────────────────────────────────────
// Inline result dropdown for game cards. Color-coded for each result type.

const RESULT_OPTIONS = [
  { value: '1-0',     label: 'White wins' },
  { value: '0-1',     label: 'Black wins' },
  { value: '1/2-1/2', label: 'Draw'       },
  { value: '*',       label: 'Unknown'    },
]

const RESULT_STYLE = {
  '1-0':     { color: '#5cb85c', bg: '#5cb85c22', border: '#5cb85c55' },
  '0-1':     { color: '#e05c5c', bg: '#e05c5c22', border: '#e05c5c55' },
  '1/2-1/2': { color: '#c9a84c', bg: '#c9a84c22', border: '#c9a84c55' },
  '*':       { color: '#8b92b0', bg: '#8b92b022', border: '#8b92b055' },
}

export default function ResultSelect({ gameId, value, onChange }) {
  const s = RESULT_STYLE[value] || RESULT_STYLE['*']
  return (
    <select
      value={value || '*'}
      onClick={e => e.stopPropagation()}
      onChange={e => { e.stopPropagation(); onChange(gameId, e.target.value) }}
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontWeight: 700,
        fontSize: 11,
        padding: '2px 6px',
        borderRadius: 4,
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        paddingRight: 20,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='${encodeURIComponent(s.color)}'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 5px center',
      }}
    >
      {RESULT_OPTIONS.map(o => (
        <option key={o.value} value={o.value} style={{ background: '#1a1d27', color: '#e8eaf0' }}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
