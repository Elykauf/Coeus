import React, { useState, useEffect } from 'react'
import axios from 'axios'

const DEFAULT_CONFIG = {
  stockfish_path: '/usr/local/bin/stockfish',
  gemini_api_key: '',
  player_name: '',
  stockfish_threads: 1,
  stockfish_hash: 4096,
}

function StatusMsg({ status }) {
  if (!status) return null
  if (typeof status === 'string') return <p className="status-msg testing">{status}</p>
  if (status.type === 'success') return <p className="status-msg success">✓ {status.msg}</p>
  if (status.type === 'error') return <p className="status-msg error">✕ {status.msg}</p>
  return null
}

function Config() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [saved, setSaved] = useState(false)
  const [stockfishStatus, setStockfishStatus] = useState(null)
  const [geminiStatus, setGeminiStatus] = useState(null)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => { loadConfig() }, [])

  const loadConfig = async () => {
    try {
      const response = await axios.get('/api/config')
      setConfig(prev => ({ ...prev, ...response.data }))
      setSaved(true)
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  const handleSave = async () => {
    try {
      await axios.post('/api/config', {
        stockfish_path: config.stockfish_path,
        gemini_api_key: config.gemini_api_key,
        player_name: config.player_name,
        stockfish_threads: config.stockfish_threads,
        stockfish_hash: config.stockfish_hash,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  const handleTestStockfish = async () => {
    setStockfishStatus('Testing Stockfish...')
    try {
      const response = await axios.post('/api/config/test-stockfish', {
        stockfish_path: config.stockfish_path,
        gemini_api_key: config.gemini_api_key
      })
      setStockfishStatus(response.data.status === 'success'
        ? { type: 'success', msg: response.data.message }
        : { type: 'error', msg: response.data.message })
    } catch (e) {
      setStockfishStatus({ type: 'error', msg: 'Network error or server down.' })
    }
    setTimeout(() => setStockfishStatus(null), 5000)
  }

  const handleTestGemini = async () => {
    setGeminiStatus('Testing API key...')
    try {
      const response = await axios.post('/api/config/test-gemini', {
        stockfish_path: config.stockfish_path,
        gemini_api_key: config.gemini_api_key
      })
      setGeminiStatus(response.data.status === 'success'
        ? { type: 'success', msg: response.data.message }
        : { type: 'error', msg: response.data.message })
    } catch (e) {
      setGeminiStatus({ type: 'error', msg: 'Network error or server down.' })
    }
    setTimeout(() => setGeminiStatus(null), 5000)
  }

  return (
    <div>

      <div className="form-group">
        <label>Stockfish Path</label>
        <div className="input-row">
          <input
            type="text"
            value={config.stockfish_path}
            onChange={(e) => setConfig({ ...config, stockfish_path: e.target.value })}
          />
          <button className="btn btn-secondary" onClick={handleTestStockfish}>Test Engine</button>
        </div>
        <StatusMsg status={stockfishStatus} />
      </div>

      <div className="form-group">
        <label>CPU Threads — <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>{config.stockfish_threads}</span></label>
        <input
          type="range"
          min={1}
          max={navigator.hardwareConcurrency || 8}
          value={config.stockfish_threads}
          onChange={(e) => setConfig({ ...config, stockfish_threads: Number(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent-gold)' }}
        />
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
          {navigator.hardwareConcurrency
            ? `Your CPU has ${navigator.hardwareConcurrency} logical cores. Takes effect after saving.`
            : 'Higher values speed up analysis. Takes effect after saving.'}
        </p>
      </div>

      <div className="form-group">
        <label>Google Gemini API Key</label>
        <div className="input-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={config.gemini_api_key}
            onChange={(e) => setConfig({ ...config, gemini_api_key: e.target.value })}
            placeholder="AIza..."
          />
          <button
            className="btn btn-secondary"
            onClick={() => setShowKey(s => !s)}
            style={{ flexShrink: 0 }}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
          <button className="btn btn-secondary" onClick={handleTestGemini} style={{ flexShrink: 0 }}>Test Key</button>
        </div>
        <StatusMsg status={geminiStatus} />
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
          Used for OCR extraction of handwritten scoresheets. Get a key at{' '}
          <span style={{ color: 'var(--accent-gold)' }}>aistudio.google.com</span>.
        </p>
      </div>

      <div className="form-group">
        <label>Your Chess Player Name</label>
        <div className="input-row">
          <input
            type="text"
            value={config.player_name}
            onChange={(e) => setConfig({ ...config, player_name: e.target.value })}
            placeholder="Enter your name as it appears in PGNs"
          />
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
          Used to calculate win/loss stats in the Opening Tree.
        </p>
      </div>

      <button className="btn btn-primary" onClick={handleSave}>Save Configuration</button>
      {saved && <p className="status-msg success" style={{ display: 'inline-block', marginLeft: 'var(--space-md)' }}>✓ Saved</p>}
    </div>
  )
}

export default Config
