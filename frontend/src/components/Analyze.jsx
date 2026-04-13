import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { useToast } from './Toast'
import { useBoardColors } from '../hooks/useBoardColors'
import { AnalyzeEvalBar } from './ui'
import MoveList from './MoveList'
import { evalToPercent, scoreTextToPercent } from '../utils/chess'

export const depthToTimeMap = { Fast: 0.5, Standard: 2.0, Deep: 10.0 }

// getCplColor/Label/Symbol use Analyze.jsx's own thresholds — do NOT move to utils
function getCplColor(cpl) {
  if (cpl == null) return 'var(--text-muted)'
  if (cpl === 0)    return '#4caf8c'
  if (cpl < 10)     return '#5cb85c'
  if (cpl < 30)     return '#8bc34a'
  if (cpl < 60)     return '#c9a84c'
  if (cpl < 200)    return '#e08c3c'
  return '#e05c5c'
}

function getCplLabel(cpl) {
  if (cpl == null) return '—'
  if (cpl === 0)    return 'Best ★'
  if (cpl < 10)     return 'Excellent ✓'
  if (cpl < 30)     return 'Good'
  if (cpl < 60)     return 'Inaccuracy ?!'
  if (cpl < 200)    return 'Mistake ?'
  return 'Blunder ??'
}

function getCplSymbol(cpl) {
  if (cpl == null) return ''
  if (cpl === 0)   return '★'
  if (cpl < 10)    return '✓'
  if (cpl < 30)    return ''
  if (cpl < 60)    return '?!'
  if (cpl < 200)   return '?'
  return '??'
}

// ── Analyze component ────────────────────────────────────────────────────────

function Analyze({ analysis, setAnalysis }) {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const boardColors = useBoardColors()

  // ── Phase 1: loading ──────────────────────────────────────────────────────
  const [analysisProgress, setAnalysisProgress] = useState(null)
  const analysisWs = useRef(null)
  const analysisStartTime = useRef(null)
  const [etaDisplay, setEtaDisplay] = useState('')
  const { title, pgn, depth: initDepth, game_uuid = null } = location.state || {}

  useEffect(() => {
    // If we already have analysis loaded and no new PGN to process, skip loading
    if (analysis && !pgn) return

    if (!pgn) return // nothing to do

    setAnalysisProgress({ percent: 0, current_move: 'Initializing…', ply: 0, total: 0 })
    analysisStartTime.current = Date.now()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/full-analysis`)
    analysisWs.current = socket

    const cleanup = () => {
      if (analysisWs.current) { analysisWs.current.close(); analysisWs.current = null }
      setAnalysisProgress(null)
    }

    socket.onopen = () => {
      socket.send(JSON.stringify({ title, pgn, depth: initDepth || 'Standard', game_uuid }))
    }

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.status === 'progress') {
        setAnalysisProgress(prev => ({ ...prev, ...data }))
      } else if (data.status === 'success') {
        setAnalysis(data)
        cleanup()
        // Stay on /analyze — workspace will show automatically
      } else if (data.status === 'error') {
        toast.error('Analysis error: ' + data.message)
        cleanup()
        navigate('/games')
      }
    }

    socket.onerror = () => {
      toast.error('Failed to connect to analysis server.')
      cleanup()
      navigate('/games')
    }

    return cleanup
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn])

  // ── ETA timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!analysisProgress || !analysisStartTime.current) {
      setEtaDisplay('')
      return
    }
    const pct = analysisProgress.percent || 0
    if (pct <= 0) { setEtaDisplay('Calculating…'); return }

    const tick = () => {
      const elapsed = (Date.now() - analysisStartTime.current) / 1000
      const rate = pct / elapsed
      const remaining = (100 - pct) / rate
      if (remaining < 60) {
        setEtaDisplay(`~${Math.ceil(remaining)}s remaining`)
      } else {
        const m = Math.floor(remaining / 60)
        const s = Math.ceil(remaining % 60)
        setEtaDisplay(`~${m}m ${s}s remaining`)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [analysisProgress?.percent, analysisProgress?.ply])

  const cancelAnalysis = () => {
    if (analysisWs.current) { analysisWs.current.close(); analysisWs.current = null }
    setAnalysisProgress(null)
    navigate('/games')
  }

  // ── Phase 2: workspace state ──────────────────────────────────────────────
  const gameData = analysis?.analysis || []
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1)
  const [explorationMode, setExplorationMode] = useState(false) // false = Game Line, true = Free Explore
  const [explorationFen, setExplorationFen] = useState('')
  const [explorationMoves, setExplorationMoves] = useState([])
  const explorationRef = useRef(null)
  const explorationModeRef = useRef(false)

  const [guessMode, setGuessMode] = useState(false)
  const [guessSubmitted, setGuessSubmitted] = useState(false)
  const [guessSan, setGuessSan] = useState('')
  const [mistakesOnly, setMistakesOnly] = useState(false)
  const [boardOrientation, setBoardOrientation] = useState('white')
  const [evalDepth, setEvalDepth] = useState('Standard')
  const [selectedSquare, setSelectedSquare] = useState(null)

  const [liveEval, setLiveEval] = useState(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const ws = useRef(null)
  const currentIdxRef = useRef(currentMoveIndex)

  useEffect(() => { currentIdxRef.current = currentMoveIndex }, [currentMoveIndex])
  useEffect(() => { explorationModeRef.current = explorationMode }, [explorationMode])

  // WebSocket for live eval
  useEffect(() => {
    if (!analysis) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/evaluate`)

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.status === 'update') setLiveEval(data)
      else if (data.status === 'complete') setIsEvaluating(false)
      else if (data.status === 'error') { console.error('WS eval error:', data.message); setIsEvaluating(false) }
    }
    socket.onclose = () => {}
    ws.current = socket
    return () => { if (ws.current) ws.current.close() }
  }, [analysis])

  const runEvaluation = useCallback((targetFen) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return
    setIsEvaluating(true)
    setLiveEval(null)
    ws.current.send(JSON.stringify({ fen: targetFen, time_limit: depthToTimeMap[evalDepth] }))
  }, [evalDepth])

  // Current game-line FEN
  const gameFen = useMemo(() => {
    const chess = new Chess()
    const moves = analysis?.analysis || []
    for (let i = 0; i <= currentMoveIndex; i++) {
      if (moves[i]?.san) { try { chess.move(moves[i].san) } catch { break } }
    }
    return chess.fen()
  }, [currentMoveIndex, analysis])

  // FEN displayed on board
  const displayFen = explorationMode ? (explorationFen || gameFen) : gameFen

  // Eval bar percent
  const evalBarPct = useMemo(() => {
    if (liveEval?.score) return scoreTextToPercent(liveEval.score)
    if (currentMoveIndex >= 0) return evalToPercent((gameData[currentMoveIndex]?.evaluation ?? 0) / 100)
    return 50
  }, [liveEval, currentMoveIndex, gameData])

  // Engine arrows
  const engineArrows = useMemo(() => {
    if (!liveEval?.lines || isEvaluating) return []
    const arrows = []
    liveEval.lines.slice(0, 2).forEach((line, i) => {
      if (!line.best_move) return
      try {
        const chess = new Chess(displayFen)
        const move = chess.move(line.best_move)
        if (move) arrows.push([move.from, move.to, i === 0 ? 'rgba(201,168,76,0.85)' : 'rgba(255,255,255,0.25)'])
      } catch {}
    })
    return arrows
  }, [liveEval, isEvaluating, displayFen])

  // Evaluate on position change (game line mode)
  useEffect(() => {
    if (!analysis || explorationModeRef.current) return
    setLiveEval(null)
    if (currentMoveIndex === -1) { setIsEvaluating(false); return }
    if (!guessMode || guessSubmitted) runEvaluation(gameFen)
  }, [gameFen, currentMoveIndex, analysis, guessMode, guessSubmitted, runEvaluation])

  // Evaluate on exploration move
  useEffect(() => {
    if (!explorationMode || !explorationFen) return
    runEvaluation(explorationFen)
  }, [explorationFen, explorationMode, runEvaluation])

  // Keyboard navigation
  useEffect(() => {
    if (!analysis || explorationMode) return
    const handler = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setCurrentMoveIndex(prev => Math.max(-1, prev - 1)); setGuessSubmitted(false); setGuessSan('') }
      if (e.key === 'ArrowRight') { e.preventDefault(); setCurrentMoveIndex(prev => Math.min(gameData.length - 1, prev + 1)); setGuessSubmitted(false); setGuessSan('') }
      if (e.key === 'Home') { e.preventDefault(); setCurrentMoveIndex(-1); setGuessSubmitted(false); setGuessSan('') }
      if (e.key === 'End')  { e.preventDefault(); setCurrentMoveIndex(gameData.length - 1); setGuessSubmitted(false); setGuessSan('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [analysis, explorationMode, gameData.length])

  // Exploration handlers
  const enterExploration = useCallback(() => {
    const chess = new Chess(gameFen)
    explorationRef.current = chess
    setExplorationFen(gameFen)
    setExplorationMoves([])
    setExplorationMode(true)
  }, [gameFen])

  const exitExploration = useCallback(() => {
    setExplorationMode(false)
    setExplorationFen('')
    explorationRef.current = null
    if (currentMoveIndex >= 0) runEvaluation(gameFen)
  }, [gameFen, currentMoveIndex, runEvaluation])

  const undoExploration = useCallback(() => {
    if (!explorationRef.current || explorationMoves.length === 0) return
    explorationRef.current.undo()
    const newFen = explorationRef.current.fen()
    setExplorationFen(newFen)
    setExplorationMoves(prev => prev.slice(0, -1))
  }, [explorationMoves])

  const onPieceDrop = useCallback((from, to) => {
    if (guessMode && !guessSubmitted && !explorationMode) {
      // Guess mode: try the move on the game position
      try {
        const chess = new Chess(gameFen)
        const move = chess.move({ from, to, promotion: 'q' })
        if (!move) return false
        setGuessSan(move.san)
        setGuessSubmitted(true)
        runEvaluation(chess.fen())
        return true
      } catch { return false }
    }
    if (!explorationMode || !explorationRef.current) return false
    try {
      const move = explorationRef.current.move({ from, to, promotion: 'q' })
      if (!move) return false
      setExplorationFen(explorationRef.current.fen())
      setExplorationMoves(prev => [...prev, move.san])
      return true
    } catch { return false }
  }, [guessMode, guessSubmitted, explorationMode, gameFen, runEvaluation])

  // Improvement navigation
  const improvementIndices = useMemo(() => {
    return gameData.map((m, i) => (m.cpl ?? 0) >= 30 ? i : -1).filter(i => i !== -1)
  }, [gameData])

  const goToNextImprovement = useCallback(() => {
    const next = improvementIndices.find(i => i > currentMoveIndex)
    if (next !== undefined) { setCurrentMoveIndex(next); setGuessSubmitted(false); setGuessSan('') }
  }, [improvementIndices, currentMoveIndex])

  const goToPrevImprovement = useCallback(() => {
    const prev = [...improvementIndices].reverse().find(i => i < currentMoveIndex)
    if (prev !== undefined) { setCurrentMoveIndex(prev); setGuessSubmitted(false); setGuessSan('') }
  }, [improvementIndices, currentMoveIndex])

  const goToMove = useCallback((idx) => { setCurrentMoveIndex(idx); setGuessSubmitted(false); setGuessSan('') }, [])

  // ── Render: Phase 1 loading ───────────────────────────────────────────────
  if (analysisProgress) {
    const moveNum = analysisProgress.ply > 0 ? `${Math.ceil(analysisProgress.ply / 2)}${analysisProgress.ply % 2 !== 0 ? '.' : '…'}${analysisProgress.current_move}` : '—'
    return (
      <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
        <div className="card analysis-progress-modal" style={{ textAlign: 'center', width: '100%', maxWidth: 480, flexDirection: 'column' }}>
          <div className="analysis-progress-header" style={{ justifyContent: 'center' }}>
            <h2>Analyzing Game</h2>
            <span className="analysis-depth-badge">Stockfish {initDepth || 'Standard'}</span>
          </div>

          <div className="analysis-progress-body">
            <div className="analysis-stats-row">
              <div className="analysis-stat">
                <span className="analysis-stat-label">Progress</span>
                <span className="analysis-stat-value mono">{analysisProgress.ply > 0 ? `${analysisProgress.ply} / ${analysisProgress.total}` : '—'}</span>
              </div>
              <div className="analysis-stat">
                <span className="analysis-stat-label">Complete</span>
                <span className="analysis-stat-value mono">{analysisProgress.percent || 0}%</span>
              </div>
              <div className="analysis-stat">
                <span className="analysis-stat-label">ETA</span>
                <span className="analysis-stat-value mono">{etaDisplay || 'Calculating…'}</span>
              </div>
            </div>

            <div className="analysis-track">
              <div className="analysis-track-fill" style={{ width: `${analysisProgress.percent || 0}%` }} />
            </div>

            <div className="analysis-current-move">
              <div className="label">Current Move</div>
              <div className="value">{moveNum}</div>
            </div>
          </div>

          <div className="analysis-progress-footer" style={{ justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={cancelAnalysis}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!analysis) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: 'var(--space-xl)' }}>
          <div style={{ fontSize: 48, marginBottom: 'var(--space-md)' }}>⚡</div>
          <h2 style={{ marginBottom: 'var(--space-sm)' }}>No game loaded for study</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
            Import and analyze a game first, or load one from your library.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => navigate('/games')}>My Games</button>
            <button className="btn btn-secondary" onClick={() => navigate('/upload')}>Import Game</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Phase 2: Workspace ────────────────────────────────────────────────────

  const currentMove = currentMoveIndex >= 0 ? gameData[currentMoveIndex] : null
  const isDraggable = explorationMode || (guessMode && !guessSubmitted)

  // Board position in guess mode: show the board BEFORE the move is played
  const guessBoardFen = useMemo(() => {
    if (!guessMode || guessSubmitted) return gameFen
    const chess = new Chess()
    const moves = analysis?.analysis || []
    for (let i = 0; i < currentMoveIndex; i++) {
      if (moves[i]?.san) { try { chess.move(moves[i].san) } catch { break } }
    }
    return chess.fen()
  }, [guessMode, guessSubmitted, currentMoveIndex, gameFen, analysis])

  const boardFen = explorationMode ? displayFen : guessMode && !guessSubmitted ? guessBoardFen : gameFen

  // Last-move highlight + legal move rings
  const boardSquareStyles = useMemo(() => {
    const styles = {}
    const highlight = 'rgba(0, 200, 5, 0.18)'
    if (!explorationMode && currentMoveIndex >= 0) {
      const chess = new Chess()
      const moves = analysis?.analysis || []
      for (let i = 0; i <= currentMoveIndex; i++) {
        if (moves[i]?.san) { try { chess.move(moves[i].san) } catch { break } }
      }
      const hist = chess.history({ verbose: true })
      const last = hist[hist.length - 1]
      if (last) {
        styles[last.from] = { backgroundColor: highlight }
        styles[last.to]   = { backgroundColor: highlight }
      }
    }
    if (selectedSquare && isDraggable) {
      try {
        const chess = new Chess(boardFen)
        chess.moves({ square: selectedSquare, verbose: true }).forEach(m => {
          styles[m.to] = {
            background: 'radial-gradient(circle, transparent 55%, rgba(34,197,94,0.55) 55%, rgba(34,197,94,0.55) 68%, transparent 68%)',
            borderRadius: '50%',
          }
        })
      } catch {}
    }
    return styles
  }, [explorationMode, currentMoveIndex, analysis, selectedSquare, isDraggable, boardFen])

  const meta = analysis?.metadata || {}
  const whiteName = meta.white || 'White'
  const blackName = meta.black || 'Black'

  const gameTitle = analysis?.title || `${whiteName} vs ${blackName}`

  return (
    <div className="analyze-layout">
        {/* ── Left: Board column ── */}
        <div className="analyze-board-col">
          <div className="card" style={{ padding: 'var(--space-md)' }}>
            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-md)' }}>
              {[
                { id: 'game', label: 'Game Line', active: !explorationMode && !guessMode },
                { id: 'explore', label: '⚡ Explore', active: explorationMode },
                { id: 'guess', label: '🎯 Guess', active: guessMode && !explorationMode },
              ].map(tab => (
                <button key={tab.id} onClick={() => {
                  if (tab.id === 'game')    { setExplorationMode(false); setGuessMode(false); setGuessSubmitted(false); setGuessSan('') }
                  if (tab.id === 'explore') { setGuessMode(false); setGuessSubmitted(false); setGuessSan(''); enterExploration() }
                  if (tab.id === 'guess')   { setExplorationMode(false); setGuessSubmitted(false); setGuessSan(''); setGuessMode(true) }
                }}
                className={`btn ${tab.active ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: 12 }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Exploration breadcrumb */}
            {explorationMode && explorationMoves.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--phase-opening)', marginBottom: 'var(--space-sm)', background: 'rgba(91,115,232,0.1)', borderRadius: 4, padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{explorationMoves.join(' ')}</span>
                <button className="btn btn-secondary" style={{ fontSize: 10, padding: '1px 6px' }} onClick={undoExploration}>↩</button>
              </div>
            )}
            {explorationMode && (
              <button className="btn btn-secondary" style={{ width: '100%', fontSize: 11, marginBottom: 'var(--space-sm)' }} onClick={exitExploration}>
                ✕ Back to game line
              </button>
            )}

            {/* Guess mode hint */}
            {guessMode && !guessSubmitted && currentMoveIndex >= 0 && (
              <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4, padding: '8px 12px', marginBottom: 'var(--space-sm)', fontSize: 13, color: 'var(--accent-gold)', textAlign: 'center' }}>
                What would you play here?
              </div>
            )}

            {/* Board + eval bar (bar overlaid on left edge so board is full width) */}
            <div className="board-wrapper" style={{ position: 'relative', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-dim)' }}>
              <Chessboard
                position={boardFen}
                boardOrientation={boardOrientation}
                arePiecesDraggable={isDraggable}
                onPieceDrop={isDraggable ? (sourceSquare, targetSquare, piece) => {
                  setSelectedSquare(null)
                  return onPieceDrop(sourceSquare, targetSquare, piece)
                } : undefined}
                onPieceDragBegin={(piece, square) => setSelectedSquare(square)}
                onSquareClick={(sq) => setSelectedSquare(prev => prev === sq ? null : sq)}
                customArrows={!guessMode || guessSubmitted ? engineArrows : []}
                customDarkSquareStyle={{ backgroundColor: boardColors.dark }}
                customLightSquareStyle={{ backgroundColor: boardColors.light }}
                customSquareStyles={boardSquareStyles}
              />
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, pointerEvents: 'none' }}>
                <EvalBar pct={evalBarPct} orientation={boardOrientation} />
              </div>
            </div>

            {/* Engine eval panel */}
            {(!guessMode || guessSubmitted) && (
              <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-dim)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>ENGINE</div>
                    <div style={{ color: 'var(--accent-gold)', fontWeight: 800, fontSize: '1.4rem', fontFamily: 'monospace' }}>
                      {isEvaluating ? '…' : (liveEval?.score || '—')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {liveEval?.nps && !isEvaluating && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{Math.round(liveEval.nps / 1000)}k nps</div>}
                    {liveEval?.depth && !isEvaluating && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>depth {liveEval.depth}</div>}
                  </div>
                </div>
                {!isEvaluating && liveEval?.lines?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {liveEval.lines.map((line, i) => (
                      <div key={i} style={{ padding: '6px 8px', background: i === 0 ? 'rgba(201,168,76,0.08)' : 'var(--bg-subtle)', border: `1px solid ${i === 0 ? 'rgba(201,168,76,0.25)' : 'var(--border-dim)'}`, borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', minWidth: 14 }}>{i + 1}.</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: i === 0 ? 'var(--accent-gold)' : 'var(--text-secondary)', minWidth: 52 }}>{line.score}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: i === 0 ? 'var(--color-good)' : 'var(--text-primary)' }}>{line.best_move}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 22, lineHeight: 1.5, wordBreak: 'break-word' }}>{line.pv?.slice(1).join(' ')}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, opacity: 0.5 }}>{isEvaluating ? 'Evaluating…' : 'Navigate to a position to evaluate'}</div>
                )}
              </div>
            )}

            {/* Navigation controls */}
            <div style={{ marginTop: 'var(--space-md)' }}>
              {!explorationMode && (
                <div className="board-controls">
                  <button className="btn btn-secondary" onClick={() => { goToMove(-1) }} disabled={currentMoveIndex === -1}>⏮</button>
                  <button className="btn btn-secondary" onClick={() => { goToMove(Math.max(-1, currentMoveIndex - 1)) }} disabled={currentMoveIndex === -1}>◀</button>
                  <button className="btn btn-secondary" onClick={() => { goToMove(Math.min(gameData.length - 1, currentMoveIndex + 1)) }} disabled={currentMoveIndex >= gameData.length - 1}>▶</button>
                  <button className="btn btn-secondary" onClick={() => { goToMove(gameData.length - 1) }} disabled={currentMoveIndex >= gameData.length - 1}>⏭</button>
                </div>
              )}
              {!explorationMode && improvementIndices.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn btn-secondary" style={{ flex: 1, fontSize: 11, padding: '4px 8px' }} onClick={goToPrevImprovement} disabled={!improvementIndices.some(i => i < currentMoveIndex)}>
                    ◀ Prev improvement
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1, fontSize: 11, padding: '4px 8px' }} onClick={goToNextImprovement} disabled={!improvementIndices.some(i => i > currentMoveIndex)}>
                    Next improvement ▶
                  </button>
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>← → keys to navigate</div>
            </div>
          </div>
        </div>

        {/* ── Right: Study column ── */}
        <div className="analyze-study-col">
          {/* Title + controls — matches Review page header style */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '28px', color: 'var(--accent)', marginBottom: '4px' }}>{gameTitle}</h1>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{whiteName} vs {blackName}{meta.date ? ` · ${meta.date}` : ''}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => navigate('/review')}>
                ← Overview
              </button>
              <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => setBoardOrientation(o => o === 'white' ? 'black' : 'white')} title="Flip board">
                ⇅
              </button>
              <select value={evalDepth} onChange={e => setEvalDepth(e.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 12 }}>
                <option value="Fast">Fast</option>
                <option value="Standard">Standard</option>
                <option value="Deep">Deep</option>
              </select>
            </div>
          </div>

          {/* Move study card */}
          {currentMove && !explorationMode && (
            <div className="card move-study-card">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
                Move {Math.ceil(currentMove.move_number / 2)}{currentMove.move_number % 2 !== 0 ? '.' : '…'}
              </div>

              {/* Played move */}
              {(!guessMode || guessSubmitted) && (
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Played</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: `2px solid ${getCplColor(currentMove.cpl)}33` }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', minWidth: 60 }}>{currentMove.san}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: getCplColor(currentMove.cpl) }}>{getCplLabel(currentMove.cpl)}</div>
                      {currentMove.cpl > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>−{Math.round(currentMove.cpl)} cp</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* Guess reveal */}
              {guessMode && guessSubmitted && guessSan && guessSan !== currentMove.san && (
                <div style={{ marginBottom: 'var(--space-md)', padding: '10px 12px', background: 'rgba(91,115,232,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(91,115,232,0.3)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Your guess</div>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--phase-opening)' }}>{guessSan}</span>
                </div>
              )}

              {/* Engine best move — live eval takes priority, stored best_move as fallback */}
              {(!guessMode || guessSubmitted) && (() => {
                const bestMove = liveEval?.lines?.[0]?.best_move || currentMove?.best_move
                const bestScore = liveEval?.lines?.[0]?.score ?? null
                const isLive = !!liveEval?.lines?.[0]?.best_move
                if (!bestMove) return null
                return (
                  <div style={{ marginBottom: 'var(--space-md)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Engine best{!isLive ? ' (stored)' : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(76,175,140,0.08)', borderRadius: 'var(--radius-md)', border: '2px solid rgba(76,175,140,0.3)' }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: '#4caf8c', minWidth: 60 }}>{bestMove}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#5cb85c' }}>★ Best</div>
                        {bestScore && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{bestScore}</div>}
                      </div>
                    </div>
                    {currentMove.cpl >= 10 && (
                      <button
                        className="btn btn-secondary"
                        style={{ width: '100%', fontSize: 12, marginTop: 8 }}
                        onClick={() => {
                          const chess = new Chess(gameFen)
                          const moved = chess.move(bestMove)
                          if (moved) {
                            explorationRef.current = chess
                            setExplorationFen(chess.fen())
                            setExplorationMoves([bestMove])
                            setExplorationMode(true)
                          }
                        }}
                      >
                        Try {bestMove} →
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* Improvement delta */}
              {currentMove.cpl >= 30 && (!guessMode || guessSubmitted) && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 10px' }}>
                  {currentMove.is_blunder ? '💥 Blunder — ' : currentMove.cpl >= 60 ? '⚠ Mistake — ' : '⚡ Inaccuracy — '}
                  {Math.round(currentMove.cpl)} cp improvement was available
                </div>
              )}

              {/* Best move confirmation */}
              {currentMove.cpl < 10 && (!guessMode || guessSubmitted) && (
                <div style={{ fontSize: 12, color: '#5cb85c', background: 'rgba(92,184,92,0.08)', borderRadius: 'var(--radius-sm)', padding: '6px 10px' }}>
                  ★ {currentMove.cpl === 0 ? 'Best move played!' : 'Excellent move!'}
                </div>
              )}

              {/* Guess next position */}
              {guessMode && guessSubmitted && (
                <button className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-md)', fontSize: 13 }} onClick={() => {
                  const nextIdx = mistakesOnly
                    ? improvementIndices.find(i => i > currentMoveIndex) ?? Math.min(gameData.length - 1, currentMoveIndex + 1)
                    : Math.min(gameData.length - 1, currentMoveIndex + 1)
                  goToMove(nextIdx)
                }}>
                  Next →
                </button>
              )}

              {guessMode && !guessSubmitted && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', paddingTop: 'var(--space-sm)' }}>
                  Drag a piece to make your guess
                </div>
              )}

              {guessMode && (
                <div style={{ marginTop: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="mistakesOnly" checked={mistakesOnly} onChange={e => setMistakesOnly(e.target.checked)} />
                  <label htmlFor="mistakesOnly" style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Only show positions with mistakes</label>
                </div>
              )}
            </div>
          )}

          {/* Exploration info */}
          {explorationMode && (
            <div className="card move-study-card">
              <div style={{ fontWeight: 700, color: 'var(--phase-opening)', marginBottom: 8 }}>Exploring alternative line</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {explorationMoves.length === 0 ? 'Starting from current position. Drag pieces to explore.' : `Line: ${explorationMoves.join(' ')}`}
              </div>
              {liveEval?.score && (
                <div style={{ marginTop: 8, fontSize: 13, fontFamily: 'monospace', color: 'var(--accent-gold)' }}>
                  Eval: {liveEval.score}
                </div>
              )}
            </div>
          )}

          {/* Unified compact scoresheet */}
          <MoveList
            moves={gameData}
            currentMoveIndex={currentMoveIndex}
            onMoveClick={goToMove}
            explorationMode={explorationMode}
            guessMode={guessMode}
            guessSubmitted={guessSubmitted}
          />
        </div>
    </div>
  )
}

export default Analyze
