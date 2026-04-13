// ── TimeInsightsPanel ──────────────────────────────────────────────────────────
// Displays a terminal-style insight card when time-spent vs accuracy patterns
// are detected (e.g., overthinking, rushing, consistent play).

import { Compass, AlertTriangle, Clock, Target } from 'lucide-react'
import { getAccuracy } from '../../utils/chess'

const ICONS = {
  info:        { Icon: Compass,       color: 'var(--color-info)' },
  blunder:     { Icon: AlertTriangle, color: 'var(--color-blunder)' },
  warning:     { Icon: Clock,         color: 'var(--color-warning)' },
  good:        { Icon: Target,         color: 'var(--color-good)' },
}

export default function TimeInsightsPanel({ data, reviewingAs }) {
  const myMoves = data.filter(m => {
    const isWhite = m.move_number % 2 !== 0
    return reviewingAs === 'White' ? isWhite : !isWhite
  })
  if (myMoves.length === 0) return null
  const hasTime = myMoves.some(m => m.time_spent > 0)
  if (!hasTime) return null

  const timeMoves = myMoves.filter(m => m.time_spent > 0)
  const quickMoves = timeMoves.filter(m => m.time_spent < 10)
  const deepMoves = timeMoves.filter(m => m.time_spent > 60)

  const quickAvgAcc = quickMoves.length
    ? quickMoves.reduce((s, m) => s + getAccuracy(m.cpl || 0), 0) / quickMoves.length
    : 0
  const deepAvgAcc = deepMoves.length
    ? deepMoves.reduce((s, m) => s + getAccuracy(m.cpl || 0), 0) / deepMoves.length
    : 0

  // Determine insight type
  let type = null  // 'blunder' | 'warning' | 'good'
  let insight = null

  if (quickMoves.length > 5 && deepMoves.length > 2) {
    if (deepAvgAcc < quickAvgAcc - 10) {
      type = 'blunder'
      insight = `Deep Think Errors: Your accuracy drops to ${deepAvgAcc.toFixed(0)}% when thinking longer than 60s. You may be calculating the wrong lines or second-guessing yourself.`
    } else if (quickAvgAcc < deepAvgAcc - 15) {
      type = 'warning'
      insight = `Rushing costs you accuracy (${quickAvgAcc.toFixed(0)}% avg on quick moves). Slow down in complex positions to match your Deep Think accuracy (${deepAvgAcc.toFixed(0)}%).`
    } else {
      type = 'good'
      insight = `Consistent Play: Your accuracy is stable across both rapid responses (${quickAvgAcc.toFixed(0)}%) and deep calculations (${deepAvgAcc.toFixed(0)}%).`
    }
  }

  if (!insight) return null

  const { Icon } = ICONS[type]
  const iconColor = ICONS[type].color

  return (
    <div
      className={`terminal-insight ${type === 'good' ? 'terminal-insight--success' : type === 'blunder' ? 'terminal-insight--error' : ''}`}
      style={{ marginTop: 'var(--space-md)' }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <Icon style={{ color: iconColor, flexShrink: 0, marginTop: 2 }} />
        <span style={{ color: '#cccccc' }}>{insight}</span>
      </div>
    </div>
  )
}
