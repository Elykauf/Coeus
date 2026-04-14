import React, { useState, useRef, useCallback, memo } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useToast } from './Toast'

const DEPTH_OPTIONS = [
  { label: 'Import Only', value: null },
  { label: 'Fast',        value: 'Fast' },
  { label: 'Standard',    value: 'Standard' },
  { label: 'Deep',        value: 'Deep' },
]

const PERF_TYPES = [
  { label: 'All',         value: '' },
  { label: 'Bullet',      value: 'bullet' },
  { label: 'Blitz',       value: 'blitz' },
  { label: 'Rapid',       value: 'rapid' },
  { label: 'Classical',   value: 'classical' },
]

function ResultBadge({ result }) {
  if (result === '1-0') return <span style={{ color: '#00C805', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>+1.0</span>
  if (result === '0-1') return <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>-1.0</span>
  return <span style={{ color: '#888888', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>0.0</span>
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const normalized = dateStr.replace(/\./g, '-')
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return dateStr }
}

const GameRow = memo(function GameRow({ g, index, isSelected, onToggle }) {
  const handleToggle = useCallback(() => onToggle(index), [onToggle, index])
  return (
    <div
      onClick={handleToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
        background: isSelected ? 'var(--accent-dim)' : 'var(--bg-subtle)',
        border: `1px solid ${isSelected ? 'var(--accent-border)' : 'transparent'}`,
        transition: 'background 0.1s, border-color 0.1s',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={handleToggle}
        onClick={e => e.stopPropagation()}
        style={{ accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }}
      />
      <span style={{
        flex: 1, fontSize: 13, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text-primary)',
      }}>
        {g.white} vs {g.black}
      </span>
      {g.eco && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
          {g.eco}
        </span>
      )}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
        {formatDate(g.date)}
      </span>
      {g.white_accuracy != null && g.black_accuracy != null && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, letterSpacing: '0.01em' }}>
          {g.white_accuracy.toFixed(0)}% / {g.black_accuracy.toFixed(0)}%
        </span>
      )}
      <ResultBadge result={g.result} />
    </div>
  )
})

function formatArchive(archive) {
  const [year, month] = archive.split('/')
  try {
    return new Date(+year, +month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  } catch { return archive }
}

export default function OnlineImport() {
  const toast = useToast()
  const navigate = useNavigate()

  const [platform, setPlatform]           = useState('chesscom')
  const [username, setUsername]           = useState('')
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // Chess.com
  const [archives, setArchives]           = useState([])
  const [selectedArchive, setSelectedArchive] = useState('')

  // Lichess
  const [lichessMax, setLichessMax]       = useState(50)
  const [lichessPerfType, setLichessPerfType] = useState('')

  // Shared game list
  const [games, setGames]                 = useState([])
  const [selected, setSelected]           = useState(new Set())
  const [total, setTotal]                 = useState(0)
  const [loadingMore, setLoadingMore]     = useState(false)
  const [visibleCount, setVisibleCount]   = useState(20)
  const observerRef = useRef(null)
  // Stable refs needed inside the sentinel callback
  const gamesRef = useRef(games)
  const totalRef = useRef(total)
  const loadingMoreRef = useRef(loadingMore)
  const fetchPageRef = useRef(null)  // set below
  const [depth, setDepth]                 = useState(null)
  const [importing, setImporting]         = useState(false)
  const [importResult, setImportResult]   = useState(null)

  // Keep refs in sync
  gamesRef.current = games
  totalRef.current = total
  loadingMoreRef.current = loadingMore

  function resetGames() {
    setGames([])
    setSelected(new Set())
    setTotal(0)
    setVisibleCount(20)
    setImportResult(null)
    setError(null)
  }

  const sentinelCallback = useCallback((node) => {
    if (observerRef.current) observerRef.current.disconnect()
    if (!node) return
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMoreRef.current && gamesRef.current.length < totalRef.current) {
        fetchPageRef.current?.(gamesRef.current.length)
      }
    }, { threshold: 0.1 })
    observerRef.current.observe(node)
  }, [])

  function switchPlatform(p) {
    setPlatform(p)
    setUsername('')
    setArchives([])
    setSelectedArchive('')
    resetGames()
  }

  // ── Chess.com: fetch archive list ─────────────────────────────────────────
  async function fetchArchives() {
    if (!username.trim()) { setError('Enter a username first'); return }
    setLoading(true)
    setError(null)
    resetGames()
    setArchives([])
    setSelectedArchive('')
    try {
      const res = await axios.get(`/api/chesscom/archives?username=${encodeURIComponent(username.trim())}`)
      const parsed = (res.data.archives || [])
        .map(url => {
          const parts = url.split('/')
          return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
        })
        .reverse() // newest first
      setArchives(parsed)
      if (parsed.length === 0) setError('No game archives found for this username')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch archives — check the username')
    } finally {
      setLoading(false)
    }
  }

  // ── Chess.com: fetch games for a month ───────────────────────────────────
  async function fetchChessComGames(archive) {
    setSelectedArchive(archive)
    setLoading(true)
    resetGames()
    const [year, month] = archive.split('/')

    // Wire up the load-more function for this context
    fetchPageRef.current = async (offset) => {
      setLoadingMore(true)
      try {
        const res = await axios.get(
          `/api/chesscom/games?username=${encodeURIComponent(username.trim())}&year=${year}&month=${month}&offset=${offset}&limit=30`
        )
        const newGames = res.data.games || []
        setGames(prev => {
          const merged = [...prev, ...newGames]
          setSelected(s => {
            const next = new Set(s)
            for (let i = prev.length; i < merged.length; i++) next.add(i)
            return next
          })
          return merged
        })
        setTotal(res.data.total ?? 0)
      } catch (e) {
        setError(e.response?.data?.detail || 'Failed to fetch games')
      } finally {
        setLoadingMore(false)
      }
    }

    try {
      const res = await axios.get(
        `/api/chesscom/games?username=${encodeURIComponent(username.trim())}&year=${year}&month=${month}&offset=0&limit=30`
      )
      const list = res.data.games || []
      setGames(list)
      setTotal(res.data.total ?? 0)
      setSelected(new Set(list.map((_, i) => i)))
      if ((res.data.total ?? 0) === 0) setError('No games found for this month')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch games')
    } finally {
      setLoading(false)
    }
  }

  // ── Lichess: fetch recent games ──────────────────────────────────────────
  async function fetchLichessGames() {
    if (!username.trim()) { setError('Enter a username first'); return }
    setLoading(true)
    resetGames()

    const baseParams = { username: username.trim(), max: lichessMax }
    if (lichessPerfType) baseParams.perf_type = lichessPerfType

    fetchPageRef.current = async (offset) => {
      setLoadingMore(true)
      try {
        const params = new URLSearchParams({ ...baseParams, offset, limit: 30 })
        const res = await axios.get(`/api/lichess/games?${params}`)
        const newGames = res.data.games || []
        setGames(prev => {
          const merged = [...prev, ...newGames]
          setSelected(s => {
            const next = new Set(s)
            for (let i = prev.length; i < merged.length; i++) next.add(i)
            return next
          })
          return merged
        })
        setTotal(res.data.total ?? 0)
      } catch (e) {
        setError(e.response?.data?.detail || 'Failed to fetch games — check the username')
      } finally {
        setLoadingMore(false)
      }
    }

    try {
      const params = new URLSearchParams({ ...baseParams, offset: 0, limit: 30 })
      const res = await axios.get(`/api/lichess/games?${params}`)
      const list = res.data.games || []
      setGames(list)
      setTotal(res.data.total ?? 0)
      setSelected(new Set(list.map((_, i) => i)))
      if ((res.data.total ?? 0) === 0) setError('No games found')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch games — check the username')
    } finally {
      setLoading(false)
    }
  }

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = useCallback((i) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }, [])

  // ── Import selected games ─────────────────────────────────────────────────
  async function importGames() {
    const toImport = [...selected]
      .sort((a, b) => a - b)
      .map(i => ({ pgn: games[i].pgn }))
      .filter(g => g.pgn)

    if (toImport.length === 0) { toast('No games with PGN data selected', 'warning'); return }

    setImporting(true)
    setError(null)
    const endpoint = platform === 'lichess' ? '/api/lichess/import' : '/api/chesscom/import'
    try {
      const res = await axios.post(endpoint, { games: toImport, depth, username: username.trim() })
      const { imported, skipped, failed } = res.data
      setImportResult(res.data)

      if (depth) {
        toast(`Queued ${imported} game${imported !== 1 ? 's' : ''} for analysis`, 'success')
        window.dispatchEvent(new CustomEvent('chess:queue-refresh'))
      } else {
        toast(
          `Imported ${imported} game${imported !== 1 ? 's' : ''}${skipped ? ` · ${skipped} already existed` : ''}`,
          'success'
        )
        if (imported > 0) navigate('/games')
      }

      if (failed > 0) toast(`${failed} game${failed !== 1 ? 's' : ''} failed to import`, 'error')
    } catch (e) {
      setError(e.response?.data?.detail || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  const inputStyle = {
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-std)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 13,
    padding: '7px 10px',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Platform toggle */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[{ id: 'chesscom', label: 'Chess.com' }, { id: 'lichess', label: 'Lichess' }].map(p => (
          <button
            key={p.id}
            className={`btn ${platform === p.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => switchPlatform(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Username row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          placeholder={platform === 'chesscom' ? 'Chess.com username' : 'Lichess username'}
          value={username}
          onChange={e => { setUsername(e.target.value); resetGames(); setArchives([]); setSelectedArchive('') }}
          onKeyDown={e => { if (e.key === 'Enter') platform === 'chesscom' ? fetchArchives() : fetchLichessGames() }}
        />

        {platform === 'lichess' && (
          <>
            <select
              style={{ ...inputStyle, width: 110 }}
              value={lichessPerfType}
              onChange={e => setLichessPerfType(e.target.value)}
            >
              {PERF_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <input
              type="number"
              style={{ ...inputStyle, width: 70, textAlign: 'center' }}
              value={lichessMax}
              min={1} max={300}
              onChange={e => setLichessMax(Math.min(300, Math.max(1, +e.target.value)))}
              title="Max games to fetch"
            />
          </>
        )}

        <button
          className="btn btn-primary"
          onClick={platform === 'chesscom' ? fetchArchives : fetchLichessGames}
          disabled={loading || !username.trim()}
        >
          {loading && games.length === 0 && !selectedArchive ? 'Loading…'
            : platform === 'chesscom' ? 'Fetch Archives'
            : 'Fetch Games'}
        </button>
      </div>

      {/* Chess.com month picker */}
      {platform === 'chesscom' && archives.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {archives.length} months available — select one to load games
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {archives.map(a => (
              <button
                key={a}
                className={`btn ${selectedArchive === a ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => fetchChessComGames(a)}
                disabled={loading}
              >
                {loading && selectedArchive === a ? 'Loading…' : formatArchive(a)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          color: '#EF4444', fontSize: 13,
          padding: '8px 12px', borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
        }}>
          {error}
        </div>
      )}

      {/* Loading spinner when fetching a month */}
      {loading && (games.length > 0 || selectedArchive) && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 8 }}>
          Loading…
        </div>
      )}

      {/* Game list */}
      {games.length > 0 && (
        <>
          {/* List header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {games.length} game{games.length !== 1 ? 's' : ''} &nbsp;·&nbsp; {selected.size} selected
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => setSelected(new Set(games.map((_, i) => i)))}
              >All</button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => setSelected(new Set())}
              >None</button>
            </div>
          </div>

          {/* Scrollable list with infinite scroll */}
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {games.slice(0, visibleCount).map((g, i) => (
              <GameRow
                key={i}
                g={g}
                index={i}
                isSelected={selected.has(i)}
                onToggle={toggleSelect}
              />
            ))}
            {visibleCount < games.length && (
              <div ref={sentinelCallback} style={{ height: 1, flexShrink: 0 }} />
            )}
          </div>

          {/* Import controls */}
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            paddingTop: 12, borderTop: '1px solid var(--border-dim)',
          }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {DEPTH_OPTIONS.map(opt => (
                <button
                  key={String(opt.value)}
                  className={`btn ${depth === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setDepth(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary"
              style={{ marginLeft: 'auto', fontWeight: 700, minWidth: 140 }}
              onClick={importGames}
              disabled={importing || selected.size === 0}
            >
              {importing
                ? 'Importing…'
                : `Import ${selected.size} Game${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>

          {/* Import result summary */}
          {importResult && (
            <div style={{
              fontSize: 12, padding: '8px 12px', borderRadius: 6,
              background: 'var(--bg-subtle)', border: '1px solid var(--border-dim)',
              color: 'var(--text-secondary)',
            }}>
              {importResult.imported > 0 && (
                <span style={{ color: '#00C805', fontWeight: 600 }}>
                  {depth ? `Queued ${importResult.imported}` : `Imported ${importResult.imported}`}
                </span>
              )}
              {importResult.skipped > 0 && <span> · {importResult.skipped} already existed</span>}
              {importResult.failed > 0 && (
                <span style={{ color: '#EF4444' }}> · {importResult.failed} failed</span>
              )}
              {depth && importResult.imported > 0 && (
                <span> — progress visible in the queue panel</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
