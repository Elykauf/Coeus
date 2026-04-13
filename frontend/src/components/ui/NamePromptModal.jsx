// ── NamePromptModal ───────────────────────────────────────────────────────────
// Shown when a new PGN is pasted and needs a display name before saving.

import { useState } from 'react'

export default function NamePromptModal({ onSave, onCancel }) {
  const [name, setName] = useState('')

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-panel" style={{ maxWidth: 420, flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <h2 style={{ margin: 0 }}>Save Game</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Enter a name for this game to save it.
        </p>
        <input
          className="modal-move-input"
          autoFocus
          placeholder="e.g. Fischer vs Spassky 1972"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()) }}
        />
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</button>
        </div>
      </div>
    </div>
  )
}
