import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ZAxis, ReferenceArea, ReferenceLine } from 'recharts'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useToast } from './Toast'
import { Target, Clock, AlertCircle, Zap, Play, SquareTerminal, RotateCcw } from 'lucide-react'
import { useBoardColors } from '../hooks/useBoardColors'
import MoveList from './MoveList'
import TimeInsightsPanel from './ui/TimeInsightsPanel'
import { FairPlayPanel, ConfirmModal } from './ui'
import { fmt, getAccuracy, getRatingDelta, getGrade, getCplColor, getCplBadge, evalToPercent } from '../utils/chess'

function Review({ analysis }) {
  const navigate = useNavigate()
  const toast = useToast()
  const boardColors = useBoardColors()
  const [refinedData] = useState(analysis?.analysis || [])
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1)
  const [autoPlay, setAutoPlay] = useState(false)
  const [reviewingAs, setReviewingAs] = useState('White')
  const [boardPing, setBoardPing] = useState(false)
  const [showOpponentPanel, setShowOpponentPanel] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState(false)

  const meta = analysis?.metadata || {}
  const [gameTitle, setGameTitle] = useState(analysis?.title || '')
  
  // Compute FEN and last-move squares for current position
  const { currentFen, lastMoveSquares } = useMemo(() => {
    const chess = new Chess()
    const moves = analysis?.analysis || []
    for (let i = 0; i <= currentMoveIndex; i++) {
      if (moves[i]?.san) { try { chess.move(moves[i].san) } catch { break } }
    }
    const hist = chess.history({ verbose: true })
    const last = hist[hist.length - 1]
    const highlight = 'rgba(0, 200, 5, 0.18)'
    const squares = last ? { [last.from]: { backgroundColor: highlight }, [last.to]: { backgroundColor: highlight } } : {}
    return { currentFen: chess.fen(), lastMoveSquares: squares }
  }, [currentMoveIndex, analysis])

  // Keyboard navigation
  useEffect(() => {
    if (!analysis) return
    const handler = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setAutoPlay(false); setCurrentMoveIndex(prev => Math.max(-1, prev - 1)) }
      if (e.key === 'ArrowRight') { e.preventDefault(); setAutoPlay(false); setCurrentMoveIndex(prev => Math.min(refinedData.length - 1, prev + 1)) }
      if (e.key === 'Home') { e.preventDefault(); setAutoPlay(false); setCurrentMoveIndex(-1) }
      if (e.key === 'End')  { e.preventDefault(); setAutoPlay(false); setCurrentMoveIndex(refinedData.length - 1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [analysis, refinedData.length])

  // Autoplay
  useEffect(() => {
    if (autoPlay && currentMoveIndex < refinedData.length - 1) {
      const timer = setTimeout(() => setCurrentMoveIndex(prev => prev + 1), 600)
      return () => clearTimeout(timer)
    } else if (currentMoveIndex >= refinedData.length - 1) {
      setAutoPlay(false)
    }
  }, [autoPlay, currentMoveIndex, refinedData.length])

  if (!analysis) {
    return (
      <div className="review-grid">
        {/* Left Column Skeleton */}
        <div className="review-left-col">
          {/* Board Skeleton */}
          <div className="stat-card--sm">
            <div className="stat-row">
              <div className="skeleton-pulse" style={{ width: 80, height: 16 }} />
              <div className="skeleton-pulse" style={{ width: 100, height: 16 }} />
            </div>
            <div className="skeleton-pulse" style={{ width: '100%', aspectRatio: '1', borderRadius: 4 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {[1,2,3,4].map(i => <div key={i} className="skeleton-pulse" style={{ flex: 1, height: 32, borderRadius: 'var(--radius-md)' }} />)}
            </div>
          </div>
          {/* Scoresheet Skeleton */}
          <div style={{ borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-dim)', overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-dim)' }}>
              <div className="skeleton-pulse" style={{ width: 80, height: 16 }} />
            </div>
            <div style={{ padding: '8px' }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <div className="skeleton-pulse" style={{ width: 28, height: 14 }} />
                  <div className="skeleton-pulse" style={{ flex: 1, height: 14 }} />
                  <div className="skeleton-pulse" style={{ flex: 1, height: 14 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Right Column Skeleton */}
        <div className="review-right-col">
          <div>
            <div className="skeleton-pulse" style={{ width: '60%', height: 28, marginBottom: 8 }} />
            <div className="skeleton-pulse" style={{ width: '40%', height: 16 }} />
          </div>
          {/* Hero Analytics Skeleton */}
          <div className="flex-gap">
            <div className="stat-card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 24 }}>
              <div>
                <div className="skeleton-pulse" style={{ width: 100, height: 11, marginBottom: 8 }} />
                <div className="skeleton-pulse skeleton-hero" />
              </div>
            </div>
            <div className="stat-card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 24 }}>
              <div className="skeleton-pulse" style={{ width: 48, height: 48, borderRadius: '50%' }} />
              <div>
                <div className="skeleton-pulse" style={{ width: 80, height: 11, marginBottom: 8 }} />
                <div className="skeleton-pulse" style={{ width: 120, height: 24 }} />
              </div>
            </div>
          </div>
          {/* Chart Skeletons */}
          <div className="stat-card">
            <div className="skeleton-pulse" style={{ width: 120, height: 16, marginBottom: 16 }} />
            <div className="skeleton-pulse skeleton-chart" />
          </div>
          <div className="stat-card">
            <div className="skeleton-pulse" style={{ width: 160, height: 16, marginBottom: 16 }} />
            <div className="skeleton-pulse" style={{ width: '100%', height: 100, borderRadius: 'var(--radius-md)' }} />
          </div>
          <div className="stat-card">
            <div className="skeleton-pulse" style={{ width: 180, height: 16, marginBottom: 16 }} />
            <div className="skeleton-pulse skeleton-chart" />
          </div>
        </div>
      </div>
    )
  }

  const goToMove = (index) => setCurrentMoveIndex(index)

  const handleReanalyze = async () => {
    if (!analysis?.id) return
    setShowReanalyzeConfirm(true)
  }

  const confirmReanalyze = async () => {
    setShowReanalyzeConfirm(false)
    setReanalyzing(true)
    try {
      const resp = await axios.post(`/api/db/games/${analysis.id}/reanalyze`)
      if (resp.data.status === 'success') {
        toast('Analysis complete — reloading game data', 'success')
        // Reload the page to fetch fresh data
        window.location.reload()
      }
    } catch (err) {
      toast(`Reanalysis failed: ${err.response?.data?.detail || err.message}`, 'error')
    } finally {
      setReanalyzing(false)
    }
  }

  const relevantMoves = refinedData.filter(m => {
    const isWhiteMove = m.move_number % 2 !== 0
    return reviewingAs === 'White' ? isWhiteMove : !isWhiteMove
  })
  
  const hasTime = relevantMoves.some(m => m.time_spent > 0)
  const avgAcc = relevantMoves.length > 0 ? relevantMoves.reduce((sum, m) => sum + getAccuracy(m.cpl || 0), 0) / relevantMoves.length : 100
  const blunderCount = relevantMoves.filter(m => m.is_blunder).length
  const grade = getGrade(avgAcc)

  const chartData = refinedData.map(m => {
    const isWhiteMove = m.move_number % 2 !== 0
    return { 
      move: Math.ceil(m.move_number / 2), 
      ply: m.move_number,
      cpl: Math.min(400, m.cpl || 0), 
      rawCpl: m.cpl || 0,
      accuracy: getAccuracy(m.cpl),
      ratingDelta: getRatingDelta(m.cpl),
      time: m.time_spent || 0,
      phase: m.phase,
      isRelevant: reviewingAs === 'White' ? isWhiteMove : !isWhiteMove,
      isWhite: isWhiteMove,
      blunder: m.is_blunder,
      userMove: m.san || '?',
      bestMove: m.best_move || m.pv_san?.[0] || '?',
    }
  })

  // Phase Timeline Data
  const phaseMap = { 'opening': 1, 'middlegame': 2, 'endgame': 3 }

  const moveRows = []
  for (let i = 0; i < refinedData.length; i += 2) {
    moveRows.push({ num: Math.floor(i / 2) + 1, white: refinedData[i], black: refinedData[i + 1] })
  }

  // Active sync function linking charts back to board
  const handleChartClick = (data) => {
    if (data && data.activePayload && data.activePayload[0] && data.activePayload[0].payload) {
      goToMove(data.activePayload[0].payload.ply - 1)
      setBoardPing(true)
      setTimeout(() => setBoardPing(false), 500)
    }
  }

  return (
    <div className="review-grid">

        {/* Left Column: Fixed / Sticky */}
        <div className="review-left-col">
          {/* Board */}
          <div className="stat-card--sm">
             <div className="stat-row">
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Game Board</div>
                <select value={reviewingAs} onChange={e => setReviewingAs(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                   <option value="White">View as White</option>
                   <option value="Black">View as Black</option>
                </select>
             </div>
             <div className={`board-wrapper${boardPing ? ' board-ping' : ''}`} style={{ borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-dim)', transition: 'box-shadow 0.3s ease' }}>
               <Chessboard
                 position={currentFen}
                 boardOrientation={reviewingAs.toLowerCase()}
                 arePiecesDraggable={false}
                 customDarkSquareStyle={{ backgroundColor: boardColors.dark }}
                 customLightSquareStyle={{ backgroundColor: boardColors.light }}
                 customSquareStyles={lastMoveSquares}
               />
             </div>
             <div className="board-controls" style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setAutoPlay(false); goToMove(-1) }}>⏮</button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setAutoPlay(false); goToMove(currentMoveIndex - 1) }}>◀</button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setAutoPlay(false); goToMove(currentMoveIndex + 1) }}>▶</button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setAutoPlay(false); goToMove(refinedData.length - 1) }}>⏭</button>
             </div>
             {blunderCount > 0 && (
                <button className={`btn btn-ghost ${autoPlay ? 'stop' : ''}`} style={{ width: '100%', marginTop: '12px', justifyContent: 'center' }} onClick={() => setAutoPlay(!autoPlay)}>
                  {autoPlay ? <SquareTerminal size={14} /> : <Play size={14} />} {autoPlay ? 'STOP' : 'AUTOPLAY'}
                </button>
             )}
          </div>

          {/* Scoresheet */}
          <MoveList
            moves={refinedData}
            currentMoveIndex={currentMoveIndex}
            onMoveClick={goToMove}
            style={{ flex: 1, minHeight: 0 }}
          />
        </div>

        {/* Right Column: Scrollable */}
        <div className="review-right-col">

           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
             <div>
               <h1 style={{ fontSize: '28px', color: 'var(--accent)', marginBottom: '4px' }}>{gameTitle || (meta.white ? `${meta.white} vs ${meta.black}` : 'Game Review')}</h1>
               <div style={{ color: 'var(--text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{meta.eco ? `${meta.eco} ` : ''}{meta.opening ? `· ${meta.opening} ` : ''}{meta.timeControl ? `· ⏱ ${meta.timeControl} ` : ''}· Stockfish 18</span>
                  {analysis?.depth && (
                    <span style={{
                      background: analysis.depth === 'Deep' ? 'rgba(34,197,94,0.12)' : analysis.depth === 'Fast' ? 'rgba(136,136,136,0.12)' : 'rgba(245,158,11,0.12)',
                      border: `1px solid ${analysis.depth === 'Deep' ? 'rgba(34,197,94,0.3)' : analysis.depth === 'Fast' ? 'rgba(136,136,136,0.3)' : 'rgba(245,158,11,0.3)'}`,
                      color: analysis.depth === 'Deep' ? 'var(--accent)' : analysis.depth === 'Fast' ? '#888888' : '#F59E0B',
                      borderRadius: 3, padding: '2px 7px', fontWeight: 700, fontSize: 10, letterSpacing: '0.04em',
                    }}>
                      {analysis.depth}
                    </span>
                  )}
               </div>
             </div>

             {showOpponentPanel ? (
               <button
                 className="btn btn-secondary"
                 style={{ fontSize: 12, padding: '5px 12px', flexShrink: 0 }}
                 onClick={() => setShowOpponentPanel(false)}
               >
                 ← Back to My Game
               </button>
             ) : (
               <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                 <button
                   className="btn btn-secondary"
                   style={{ fontSize: 12, padding: '5px 12px' }}
                   onClick={handleReanalyze}
                   disabled={reanalyzing}
                   title="Re-run Stockfish analysis with current config"
                 >
                   <RotateCcw size={12} style={{ marginRight: 4, animation: reanalyzing ? 'spin 1s linear infinite' : undefined }} />
                   {reanalyzing ? 'Reanalyzing…' : 'Re-analyze'}
                 </button>
                 <button
  return <div>test</div>
}
