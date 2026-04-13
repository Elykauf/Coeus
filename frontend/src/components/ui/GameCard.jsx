// ── GameCard ─────────────────────────────────────────────────────────────────────
// A single game row in the games list. Renders the miniature board thumbnail,
// metadata, result ticker, and hover-reveal action buttons.

import { Chessboard } from 'react-chessboard'
import { motion } from 'framer-motion'
import { timeAgo } from '../../utils/games'

export default function GameCard({
  g,
  boardColors,
  hoveredId,
  activeId,
  onLoad,
  onEdit,
  onDeep,
  onDelete,
}) {
  const hasPlayers = (g.white && g.black && !/^\?+$/.test(g.white) && !/^\?+$/.test(g.black))
  const displayTitle = hasPlayers ? `${g.white} vs ${g.black}` : (g.title || 'Untitled')

  // Result stripe + FinTech ticker
  let stripeColor = 'var(--border-std)'
  let tickerValue = '0.0'
  let tickerColor = 'var(--text-secondary)'
  if (g.result === '1-0') { stripeColor = 'var(--accent)'; tickerValue = '+1.0'; tickerColor = 'var(--accent)' }
  if (g.result === '0-1') { stripeColor = '#EF4444'; tickerValue = '-1.0'; tickerColor = '#EF4444' }
  if (g.result === '1/2-1/2') { stripeColor = '#888888'; tickerValue = '0.0'; tickerColor = '#888888' }

  const isActive = g.id === activeId

  return (
    <motion.div
      key={g.id}
      className="game-card-fintech"
      onClick={() => onLoad(g.id)}
      onMouseEnter={() => {}}
      onMouseLeave={() => {}}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '12px 16px',
        background: isActive ? 'rgba(34,197,94,0.04)' : 'var(--bg-surface)',
        border: isActive ? '1px solid rgba(34,197,94,0.5)' : '1px solid var(--border-dim)',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        boxShadow: isActive ? '0 0 0 2px rgba(34,197,94,0.15)' : '0 2px 8px rgba(0,0,0,0.3)',
        borderLeft: `4px solid ${stripeColor}`,
      }}
    >
      {/* Miniature Board Thumbnail */}
      <div
        className="mini-board-inner-glow board-wrapper"
        style={{ width: 80, height: 80, flexShrink: 0, borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-dim)' }}
      >
        <Chessboard
          position={g.last_fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'}
          arePiecesDraggable={false}
          boardWidth={80}
          customDarkSquareStyle={{ backgroundColor: boardColors.dark }}
          customLightSquareStyle={{ backgroundColor: boardColors.light }}
        />
      </div>

      {/* Metadata Block */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{
            fontWeight: 700, fontSize: 16, color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {displayTitle}
          </span>
          {g.analysis_depth && (
            <span style={{
              background: g.analysis_depth === 'Deep' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
              border: `1px solid ${g.analysis_depth === 'Deep' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
              color: g.analysis_depth === 'Deep' ? 'var(--accent)' : '#F59E0B',
              borderRadius: 3, padding: '2px 6px', fontWeight: 600, fontSize: 10,
            }}>
              {g.analysis_depth}
            </span>
          )}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          {g.opening && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
              {g.opening}
            </span>
          )}
          {g.eco && (
            <span style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-dim)', borderRadius: 3, padding: '0 4px', fontSize: 11, fontWeight: 'bold' }}>
              {g.eco}
            </span>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
          {g.time_control && <span>⏱ {g.time_control}</span>}
          {g.updated_at && <span title={new Date(g.updated_at * 1000).toLocaleString()}>Edited {timeAgo(g.updated_at)}</span>}
        </div>
      </div>

      {/* Result Badge — Stock Ticker */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 4, marginRight: 16 }}>
        {g.result === '1-0' || g.result === '0-1' || g.result === '1/2-1/2' ? (
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: tickerColor, lineHeight: 1 }}>
            {tickerValue}
          </span>
        ) : (
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</span>
        )}
      </div>

      {/* Actions: absolute hover overlay */}
      <div style={{
        position: 'absolute',
        right: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        display: hoveredId === g.id ? 'flex' : 'none',
        gap: 6,
        background: 'var(--bg-surface)',
        boxShadow: '-8px 0 12px var(--bg-surface)',
        paddingLeft: 8,
      }}>
        <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={e => onEdit(g.id, e)} title="Edit moves">✏ Edit</button>
        <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={e => { e.stopPropagation(); onLoad(g.id) }} title="Review analysis">Review</button>
        {g.analysis_depth && g.analysis_depth !== 'Deep' && g.raw_pgn && (
          <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12, color: 'var(--accent-gold)' }} onClick={e => { e.stopPropagation(); onDeep(g) }}>⚡ Deep</button>
        )}
        <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={e => { e.stopPropagation(); onDelete(g) }}>Delete</button>
      </div>
    </motion.div>
  )
}
