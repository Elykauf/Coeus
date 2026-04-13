// ── Chess analysis utilities ─────────────────────────────────────────────────

/** Truncate floats to 2 decimal places for tooltip display */
export const fmt = (v) => typeof v === 'number' ? parseFloat(v.toFixed(2)) : v

/** Convert centipawn loss to accuracy percentage (0–100) */
export function getAccuracy(cpl) {
  if (cpl == null) return 100
  return Math.max(0, 100 * Math.exp(-0.005 * cpl))
}

/** Convert accuracy percentage to letter grade */
export function getGrade(accuracy) {
  if (accuracy >= 95) return 'A+'
  if (accuracy >= 90) return 'A'
  if (accuracy >= 85) return 'A-'
  if (accuracy >= 80) return 'B+'
  if (accuracy >= 75) return 'B'
  if (accuracy >= 70) return 'C'
  if (accuracy >= 60) return 'D'
  return 'F'
}

/** Convert centipawn loss to a color (CSS variable or hex) — Review.jsx version */
export function getCplColor(cpl) {
  if (cpl == null) return null
  if (cpl === 0)    return 'var(--color-good)'
  if (cpl < 15)     return 'var(--color-good)'
  if (cpl < 40)     return 'var(--color-warning)'
  if (cpl < 80)     return 'var(--accent-gold)'
  if (cpl < 200)    return '#e08c3c'
  return 'var(--color-blunder)'
}

/** Badge config { label, symbol, color, bg } for a given centipawn loss */
export function getCplBadge(cpl, isBlunder) {
  if (isBlunder || cpl >= 200) return { label: 'Blunder', symbol: '??', color: 'var(--color-blunder)', bg: 'rgba(239,68,68,0.15)' }
  if (cpl == null) return { label: '', symbol: '', color: 'transparent', bg: 'transparent' }
  if (cpl === 0) return { label: 'Best', symbol: '★', color: '#10B981', bg: 'rgba(16,185,129,0.15)' }
  if (cpl < 15) return { label: 'Excellent', symbol: '!', color: '#10B981', bg: 'rgba(16,185,129,0.15)' }
  if (cpl < 40) return { label: 'Good', symbol: '✓', color: '#8bc34a', bg: 'rgba(139,195,74,0.15)' }
  if (cpl < 80) return { label: 'Inaccuracy', symbol: '?!', color: '#F3C344', bg: 'rgba(243,195,68,0.15)' }
  return { label: 'Mistake', symbol: '?', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' }
}

/** Convert pawn evaluation to a win-probability percentage (2–98) */
export function evalToPercent(pawns) {
  if (isNaN(pawns)) return 50
  return Math.max(2, Math.min(98, 50 + (pawns / 6) * 50))
}

/** Parse a clock string (H:MM:SS, MM:SS, or raw seconds) into "H:MM:SS" */
export function formatClock(clk) {
  if (!clk) return ''
  const parts = clk.trim().split(':')
  let h, m, s
  if (parts.length === 3) {
    [h, m, s] = [parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2])]
  } else if (parts.length === 2) {
    h = 0; m = parseInt(parts[0]); s = parseInt(parts[1])
  } else {
    const val = parts[0].trim()
    if (/^\d{3,4}$/.test(val)) {
      // HMM or HHMM: last two digits = minutes, rest = hours
      m = parseInt(val.slice(-2)); h = parseInt(val.slice(0, -2)); s = 0
    } else {
      const total = parseInt(val) || 0
      h = Math.floor(total / 3600); m = Math.floor((total % 3600) / 60); s = total % 60
    }
  }
  if (isNaN(h) || isNaN(m) || isNaN(s)) return clk
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Convert a UCI score text (e.g. "+1.5", "M5", "-0.3") to win-probability pct */
export function scoreTextToPercent(score) {
  if (!score) return 50
  const s = String(score).trim()
  if (/[Mm]/.test(s)) return s.startsWith('-') ? 2 : 98
  const val = parseFloat(s)
  return isNaN(val) ? 50 : evalToPercent(val)
}
