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
  return <div>test</div>;
}
