// ── MoveCorrectionModal ─────────────────────────────────────────────────────────
// Shown when editing a move in the scoresheet: shows board + engine suggestions.
// Supports drag-drop, SAN input, and two confirm modes: Replace vs Slide & Shift.

import { useState, useEffect } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import axios from 'axios'
import { formatClock } from '../../utils/chess'

export default function MoveCorrectionModal({
  isOpen, onClose, moveNum, side,
  currentFen, initialFen,
  suggestedMove, suggestedTime,
  onConfirm, isInsert,
  setModalData, boardOrientation, idx,
}) {
  const [boardPosition, setBoardPosition] = useState(initialFen || currentFen)
  const [inputValue, setInputValue] = useState(suggestedMove || '')
  const [timeValue, setTimeValue] = useState(formatClock(suggestedTime))
  const [isMoveLegal, setIsMoveLegal] = useState(true)
  const [engineSuggestions, setEngineSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  useEffect(() => {
    setInputValue(suggestedMove || '')
    setTimeValue(formatClock(suggestedTime))
    setBoardPosition(initialFen || currentFen)
    setIsMoveLegal(true)
    fetchSuggestions(currentFen)
  }, [suggestedMove, suggestedTime, currentFen, initialFen])

  const fetchSuggestions = async (fen) => {
    setLoadingSuggestions(true)
    try {
      const formData = new FormData()
      formData.append('fen', fen)
      const response = await axios.post('/api/suggest-moves', formData)
      setEngineSuggestions(response.data.suggestions)
    } catch (error) { console.error(error) }
    finally { setLoadingSuggestions(false) }
  }

  if (!isOpen) return null

  const applyMove = (moveSan) => {
    const game = new Chess(currentFen)
    try {
      const m = game.move(moveSan)
      if (m) { setBoardPosition(game.fen()); setInputValue(m.san); setIsMoveLegal(true) }
      else { setInputValue(moveSan); setIsMoveLegal(false) }
    } catch (e) { setInputValue(moveSan); setIsMoveLegal(false) }
  }

  const onDrop = (source, target) => {
    const game = new Chess(currentFen)
    try {
      const m = game.move({ from: source, to: target, promotion: 'q' })
      if (m) {
        onConfirm(idx, side, m.san, 'replace', timeValue)
        setModalData(null)
        onClose()
        return true
      }
    } catch (e) {}
    return false
  }

  const handleConfirm = (mode) => {
    if (isMoveLegal && inputValue) {
      onConfirm(idx, side, inputValue, mode, timeValue)
      setModalData(null)
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        <div style={{ flex: '0 0 400px' }}>
          <Chessboard
            position={boardPosition}
            onPieceDrop={onDrop}
            boardWidth={400}
            boardOrientation={boardOrientation}
          />
        </div>
        <div className="modal-info">
          <h2>{isInsert ? 'Insert Move' : 'Review Move'} {moveNum} ({side})</h2>

          {!isInsert && (
            <div className="modal-ocr-suggestion">
              <div className="modal-ocr-label">OCR Suggestion</div>
              <div className="modal-ocr-value">{suggestedMove || 'None'} {suggestedTime ? `[${suggestedTime}]` : ''}</div>
            </div>
          )}

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="modal-suggestions-label">Stockfish Top 3</label>
            <div className="modal-suggestions">
              {loadingSuggestions
                ? <span style={{ color: 'var(--text-secondary)' }}>Loading...</span>
                : engineSuggestions.map((s, i) => (
                    <button key={i} className="suggestion-btn" onClick={() => applyMove(s.san)}>
                      <span>{s.san}</span>
                      {s.eval && <span className="suggestion-eval">{s.eval}</span>}
                    </button>
                  ))
              }
            </div>
          </div>

          <div className="modal-input-row">
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Move (SAN)</label>
              <input
                className={`modal-move-input${isMoveLegal ? '' : ' illegal'}`}
                value={inputValue}
                onChange={(e) => applyMove(e.target.value)}
                placeholder="SAN move..."
              />
            </div>
            <div style={{ flex: 1, marginLeft: '10px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Clock</label>
              <input
                className="modal-move-input"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                placeholder="0:00"
              />
            </div>
            <button
              className="modal-reset-btn"
              style={{ marginTop: '18px' }}
              onClick={() => {
                setBoardPosition(initialFen || currentFen)
                setInputValue(suggestedMove || '')
                setTimeValue(formatClock(suggestedTime))
              }}
            >↺</button>
          </div>

          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              style={{ flex: '1 1 100%' }}
              onClick={() => { setModalData(null); onClose() }}
            >Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => handleConfirm('replace')}
              disabled={!isMoveLegal || !inputValue}
            >Replace</button>
            <button
              className="btn btn-primary"
              onClick={() => handleConfirm('slide')}
              disabled={!isMoveLegal || !inputValue}
              style={{ background: 'var(--color-good)' }}
            >Slide & Shift</button>
          </div>
        </div>
      </div>
    </div>
  )
}
