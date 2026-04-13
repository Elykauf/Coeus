// ── Games list utilities ──────────────────────────────────────────────────────

/** Format a Unix timestamp into a relative ("5m ago") or short date string */
export function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() / 1000 - ts
  if (diff < 60)       return 'just now'
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800)   return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString('default', { month: 'short', day: 'numeric' })
}

/** Group an array of game objects by YYYY-MM into sorted [key, games][] entries (newest first) */
export function groupByMonth(games) {
  const groups = {}
  for (const g of games) {
    const d = g.date || ''
    const key = d.length >= 7 ? d.slice(0, 7) : (d || 'Unknown')
    if (!groups[key]) groups[key] = []
    groups[key].push(g)
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
}

/** Format a YYYY-MM month key into a human-readable "January 2024" string */
export function formatMonth(key) {
  if (key === 'Unknown') return key
  try {
    const [y, m] = key.split('-')
    return new Date(+y, +m - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  } catch { return key }
}

/** Extract [Key: "Value"] PGN headers from raw PGN text into { Key: value } dict */
export function parsePgnHeaders(pgnText) {
  const h = {}
  const re = /^\[(\w+)\s+"([^"]*)"\]/gm
  let m
  while ((m = re.exec(pgnText)) !== null) h[m[1]] = m[2]
  return h
}

/** Reconstruct a full PGN string from a game data object (metadata + moves) */
export function reconstructPgn(gameData) {
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
