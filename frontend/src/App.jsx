import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon, Plus } from 'lucide-react'
import axios from 'axios'
import Config from './components/Config'
import Upload from './components/Upload'
import Review from './components/Review'
import Games from './components/Games'
import Analyze from './components/Analyze'
import { ToastProvider, useToast } from './components/Toast'
import './App.css'

// ── Navigation with sliding indicator ────────────────────────────────────────
const NAV_ITEMS = [
  { path: '/games',  label: 'Games' },
  { path: '/review', label: 'Post-Game Report', requiresAnalysis: true },
  { path: '/analyze', label: 'Analysis Board', requiresAnalysis: true },
]

function NavTabs({ hasAnalysis }) {
  const location = useLocation()
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  const tabRefs = useRef({})

  useEffect(() => {
    const activeKey = NAV_ITEMS.find(item => location.pathname.startsWith(item.path))
    if (activeKey && tabRefs.current[activeKey.path]) {
      const el = tabRefs.current[activeKey.path]
      const parent = el.parentElement
      const parentRect = parent.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      setIndicator({
        left: elRect.left - parentRect.left,
        width: elRect.width,
      })
    }
  }, [location.pathname])

  return (
    <div className="header-center">
      {NAV_ITEMS.map(item => {
        const disabled = item.requiresAnalysis && !hasAnalysis
        if (disabled) {
          return (
            <span
              key={item.path}
              ref={el => { if (el) tabRefs.current[item.path] = el }}
              className="nav-tab nav-tab-disabled"
              title="Load a game first"
            >
              {item.label}
            </span>
          )
        }
        return (
          <NavLink
            key={item.path}
            to={item.path}
            ref={el => { if (el) tabRefs.current[item.path] = el }}
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            {item.label}
          </NavLink>
        )
      })}
      <motion.div
        className="nav-indicator"
        animate={{ left: indicator.left, width: indicator.width }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      />
    </div>
  )
}

// ── Breadcrumbs ──────────────────────────────────────────────────────────────
function Breadcrumbs({ analysis }) {
  const location = useLocation()
  const navigate = useNavigate()

  const crumbs = []
  if (location.pathname.startsWith('/games')) {
    crumbs.push({ label: 'Games' })
  } else  if (location.pathname.startsWith('/review')) {
    crumbs.push({ label: 'Games', onClick: () => navigate('/games') })
    crumbs.push({ label: 'Post-Game Report' })
    const meta = analysis?.metadata
    const opponent = meta?.white && meta?.black
      ? (meta.white === 'Elijah' || meta.white === 'Kaufman' ? meta.black : meta.white)
      : null
    if (opponent) {
      crumbs.push({ label: `vs ${opponent}`, active: true })
    }
  } else if (location.pathname.startsWith('/upload')) {
    crumbs.push({ label: 'New Game' })
  } else if (location.pathname.startsWith('/analyze')) {
    crumbs.push({ label: 'Analysis Board' })
  }

  if (crumbs.length === 0) return null

  return (
    <div className="breadcrumbs">
      {crumbs.map((crumb, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="crumb-sep">›</span>}
          <span
            className={crumb.active ? 'crumb-active' : ''}
            style={crumb.onClick ? { cursor: 'pointer' } : {}}
            onClick={crumb.onClick}
          >
            {crumb.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

// ── Queue Panel ──────────────────────────────────────────────────────────────

function QueuePanel({ setAnalysis }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [jobs, setJobs] = useState([])
  const [expanded, setExpanded] = useState(false)
  const prevDoneIds = useRef(new Set())
  const initializedRef = useRef(false)
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const unmountedRef = useRef(false)

  const connectQueueWS = useCallback(() => {
    if (unmountedRef.current) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/queue`)
    wsRef.current = ws
    initializedRef.current = false

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (!initializedRef.current) {
        // First message: pre-populate prevDoneIds so already-done jobs don't re-toast
        initializedRef.current = true
        for (const job of data) {
          if (job.status === 'done') prevDoneIds.current.add(job.job_id)
        }
        setJobs(data)
        return
      }
      for (const job of data) {
        if (job.status === 'done' && !prevDoneIds.current.has(job.job_id)) {
          prevDoneIds.current.add(job.job_id)
          toast(`Analysis complete: ${job.title}`, 'success')
        }
      }
      setJobs(data)
    }

    ws.onclose = () => {
      wsRef.current = null
      if (!unmountedRef.current) {
        reconnectTimer.current = setTimeout(connectQueueWS, 3000)
      }
    }

    ws.onerror = () => ws.close()
  }, [toast])

  useEffect(() => {
    unmountedRef.current = false
    connectQueueWS()
    return () => {
      unmountedRef.current = true
      clearTimeout(reconnectTimer.current)
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    }
  }, [connectQueueWS])

  const removeJob = async (jobId) => {
    try {
      await axios.delete(`/api/queue/${jobId}`)
      // No optimistic update — server push will arrive with the updated list
    } catch (_) {}
  }

  const reviewCompleted = async (job) => {
    if (!job.result_game_id) return
    try {
      const res = await axios.get(`/api/db/games/${job.result_game_id}`)
      const g = res.data
      const analysis = (g.moves || []).map(m => ({
        move_number: m.ply,
        label: `${m.moveNumber}${m.color}`,
        san: m.san,
        evaluation: m.evaluation?.value ?? 0,
        cpl: m.annotations?.cpl ?? 0,
        is_blunder: m.annotations?.isBlunder ?? false,
        phase: m.annotations?.phase ?? '',
        time_spent: m.time?.moveDurationSeconds ?? 0,
        best_move: m.engine?.bestMove ?? null,
        pv_san: m.engine?.pv ?? [],
      }))
      setAnalysis({ id: job.result_game_id, title: g.title || 'Game', uuid: g.uuid, pgn: g.raw_pgn || '', analysis, depth: job.depth, metadata: g.metadata })
      navigate('/review')
      setExpanded(false)
    } catch (e) { console.error(e) }
  }

  const analyzing = jobs.find(j => j.status === 'analyzing')
  const activeCount = jobs.filter(j => j.status === 'queued' || j.status === 'analyzing').length

  if (jobs.length === 0) return null

  return (
    <div
      style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 10 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Expanded drawer */}
      {expanded && (
        <div className="card" style={{ marginBottom: 10, width: 340, maxHeight: 420, overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.55)', padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Analysis Queue</span>
          </div>
          {jobs.map((job, i) => (
            <div key={job.job_id} style={{ paddingBottom: 'var(--space-sm)', marginBottom: 'var(--space-sm)', borderBottom: i < jobs.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{job.depth}</span>
              </div>

              {/* Progress bar (analyzing only) */}
              {job.status === 'analyzing' && (
                <>
                  <div style={{ height: 4, background: 'var(--bg-subtle)', borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{ width: `${job.progress?.percent ?? 0}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {job.progress?.current_move} · {job.progress?.ply ?? 0}/{job.progress?.total ?? 0}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <StatusBadge status={job.status} />
                <div style={{ flex: 1 }} />
                {job.status === 'done' && job.result_game_id && (
                  <button className="btn btn-primary" style={{ padding: '1px 10px', fontSize: 11 }} onClick={() => reviewCompleted(job)}>Review</button>
                )}
                <button
                  className="btn btn-secondary"
                  style={{ padding: '1px 8px', fontSize: 11 }}
                  onClick={() => removeJob(job.job_id)}
                >
                  {job.status === 'queued' || job.status === 'analyzing' ? 'Cancel' : '✕'}
                </button>
              </div>

              {job.status === 'error' && (
                <div style={{ fontSize: 11, color: '#e05c5c', marginTop: 3 }}>{job.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
{/* Floating toggle button */}
<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
<button
        className="btn btn-primary"
        style={{ borderRadius: 20, maxWidth: "140px", padding: '7px 18px', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', minWidth: 140 }}
      >
        {analyzing
          ? `Analyzing… ${analyzing.progress?.percent ?? 0}%`
          : `Queue · ${activeCount} pending`}
      </button>
    </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    queued:    { color: '#888888', label: 'Queued' },
    analyzing: { color: 'var(--accent)', label: 'Analyzing' },
    done:      { color: 'var(--accent)', label: 'Done ✓' },
    error:     { color: '#EF4444', label: 'Error' },
    cancelled: { color: '#888888', label: 'Cancelled' },
  }
  const { color, label } = styles[status] || { color: '#888888', label: status }
  return <span style={{ fontSize: 11, fontWeight: 600, color }}>{label}</span>
}

// ── App ──────────────────────────────────────────────────────────────────────

function MainAppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [analysis, setAnalysis] = useState(null)
  const [showConfig, setShowConfig] = useState(false)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme') || 'dark'
    document.documentElement.setAttribute('data-theme', saved)
    return saved
  })

  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('theme', next)
      return next
    })
  }
  const configRef = useRef(null)
  const configBtnRef = useRef(null)

  useEffect(() => {
    if (!showConfig) return
    const handler = (e) => {
      if (
        configRef.current && !configRef.current.contains(e.target) &&
        configBtnRef.current && !configBtnRef.current.contains(e.target)
      ) {
        setShowConfig(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showConfig])

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <h1>Chess Analyzer</h1>
          <Breadcrumbs analysis={analysis} />
        </div>
        <NavTabs hasAnalysis={!!analysis} />
        <div className="header-right">
          <button className="btn-icon btn-import" title="Import game" onClick={() => navigate('/upload')}>
            <Plus size={16} />
          </button>
          <button className="btn-icon" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            ref={configBtnRef}
            className={`btn-icon ${showConfig ? 'active' : ''}`}
            title="Settings"
            onClick={() => setShowConfig(s => !s)}
          >⚙</button>
        </div>
      </header>

      {/* Settings dropdown */}
      <AnimatePresence>
        {showConfig && (
          <motion.div
            ref={configRef}
            className="settings-dropdown"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
          >
            <div className="settings-dropdown-header">
              <span>Settings</span>
              <button className="btn-icon" onClick={() => setShowConfig(false)} style={{ fontSize: 14 }}>✕</button>
            </div>
            <Config />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="app-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ height: '100%' }}
          >
            <Routes location={location}>
              <Route path="/" element={<Navigate to="/games" replace />} />
              <Route path="/upload" element={<Upload setAnalysis={setAnalysis} />} />
              <Route path="/games" element={<Games analysis={analysis} setAnalysis={setAnalysis} />} />
              <Route path="/analyze" element={<Analyze analysis={analysis} setAnalysis={setAnalysis} />} />
              <Route path="/review" element={<Review analysis={analysis} setAnalysis={setAnalysis} />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
      <QueuePanel setAnalysis={setAnalysis} />
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <Router>
        <MainAppContent />
      </Router>
    </ToastProvider>
  )
}

export default App
