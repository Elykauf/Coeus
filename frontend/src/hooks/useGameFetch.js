// ── useGameFetch ───────────────────────────────────────────────────────────────
// Fetches the game list with debounced filter changes and latest-request-wins
// logic (ignores stale responses from React 18 StrictMode double-invokes).

import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'

/**
 * @param {{ dateFrom?: string, dateTo?: string, player?: string, source?: string, analyzedOnly?: boolean }} filters
 * @returns {{ games, loading, fetchGames, updateResult }}
 */
export function useGameFetch(filters) {
  const { dateFrom, dateTo, player, source, analyzedOnly } = filters

  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)

  // Incremented on every filter change; responses with a stale fetchId are discarded.
  const fetchIdRef = useRef(0)

  // Debounce timer ref
  const timerRef = useRef(null)

  const fetchGames = useCallback(async () => {
    const fetchId = ++fetchIdRef.current
    setLoading(true)
    try {
      const params = {}
      if (dateFrom)     params.date_from = dateFrom
      if (dateTo)       params.date_to   = dateTo
      if (player)       params.player    = player
      if (source)       params.source    = source
      if (analyzedOnly) params.analyzed  = true

      const res = await axios.get('/api/db/games', { params })
      // Discard if filters changed while request was in-flight
      if (fetchId !== fetchIdRef.current) return
      setGames(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false)
    }
  }, [dateFrom, dateTo, player, source, analyzedOnly])

  // Initial fetch on mount
  useEffect(() => { fetchGames() }, [])

  // Auto-search when filters change (debounced)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { fetchGames() }, 500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [dateFrom, dateTo, player, source, analyzedOnly, fetchGames])

  // Optimistically update result, then sync to server
  const updateResult = useCallback(async (id, result) => {
    setGames(gs => gs.map(g => g.id === id ? { ...g, result } : g))
    try {
      await axios.patch(`/api/db/games/${id}/meta`, { result })
    } catch (e) {
      console.error('Result update failed', e)
    }
  }, [])

  return { games, loading, fetchGames, updateResult }
}
