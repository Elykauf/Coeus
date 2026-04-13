// ── SkeletonCard ─────────────────────────────────────────────────────────────
// Loading placeholder that mirrors the shape of a GameCard

export default function GameCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-pulse skeleton-board" />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="skeleton-pulse skeleton-line skeleton-line--title" />
        <div className="skeleton-pulse skeleton-line skeleton-line--sub" />
        <div className="skeleton-pulse skeleton-line skeleton-line--footer" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginRight: 16 }}>
        <div className="skeleton-pulse skeleton-badge" />
      </div>
    </div>
  )
}
