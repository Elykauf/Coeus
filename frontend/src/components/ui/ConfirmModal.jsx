// ── ConfirmModal ─────────────────────────────────────────────────────────────
// Generic confirmation dialog for destructive actions.

export default function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div className="card" style={{ width: 360, padding: 'var(--space-xl)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 'var(--space-sm)' }}>{title}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 'var(--space-lg)' }}>{message}</div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}
