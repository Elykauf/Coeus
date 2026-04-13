import React, { useState, useEffect } from 'react'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { Chess } from 'chess.js'
import ScoreSheetInput from './ScoreSheetInput'
import { useToast } from './Toast'
import OnlineImport from './OnlineImport'

function Upload({ setAnalysis }) {
  const toast = useToast()
  const location = useLocation()
  const editState = location.state || {}

  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pgn, setPgn] = useState(editState.pgn || '')
  const [title, setTitle] = useState(editState.title || '')
  const [step, setStep] = useState(editState.pgn ? 3 : 1)
  const [cropPreviewUrl, setCropPreviewUrl] = useState(null)
  const [crop, setCrop] = useState({ unit: '%', x: 25, y: 25, width: 50, height: 50 })
  const [isOcrRunning, setIsOcrRunning] = useState(false)
  const [isCroppingPreview, setIsCroppingPreview] = useState(false)
  const [rawOcrText, setRawOcrText] = useState('')
  const [showReference, setShowReference] = useState(true)
  const [isTsRunning, setIsTsRunning] = useState(false)
  const [analysisDepth, setAnalysisDepth] = useState('Standard')
  const [analysisProgress, setAnalysisProgress] = useState(null)
  const [savedGameId, setSavedGameId] = useState(editState.gameId || null)
  // Stable UUID for this import session — used as upsert key so re-running analysis never duplicates
  const [gameUuid] = useState(() => editState.gameUuid || (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); })))
  const [importMethod, setImportMethod] = useState('photo')
  const analysisWs = React.useRef(null)
  const navigate = useNavigate()

  // Auto-hide reference image if PGN is valid and has moves
  useEffect(() => {
    if (pgn.trim()) {
      try {
        const game = new Chess()
        const success = game.loadPgn(pgn)
        if (success && game.history().length > 0) {
          setShowReference(false)
        } else {
          setShowReference(true)
        }
      } catch (e) {
        setShowReference(true)
      }
    }
  }, [pgn])

  const handleFileSelect = async (e) => {
    if (!e || !e.target || !e.target.files) return
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    setFile(selectedFile)
    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const response = await axios.post('/api/upload-only', formData)
      setPreviewUrl(response.data.file_url)
      setTitle(selectedFile.name.split('.')[0])
      setStep(2)
    } catch (error) {
      toast.error("Upload failed. Please try again.")
    }
  }

  const runPreviewGeneration = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    if (!file || (!crop || crop.width === 0 || crop.height === 0)) {
      toast.error("Please wait for the image to load or select a region.")
      return
    }

    setIsCroppingPreview(true)
    try {
      const formData = new FormData()
      formData.append('filename', file.name)
      formData.append('x', crop.x || 0)
      formData.append('y', crop.y || 0)
      formData.append('width', crop.width || 0)
      formData.append('height', crop.height || 0)
      formData.append('skip_ocr', 'true')

      const response = await axios.post('/api/ocr-crop', formData)
      if (response.data.crop_url) {
        setCropPreviewUrl(`${response.data.crop_url}?t=${new Date().getTime()}`)
      }
    } catch (error) {
      toast.error("Failed to render crop preview.")
    } finally {
      setIsCroppingPreview(false)
    }
  }

  const parseOcrOutput = (data) => {
    if (data && data.moves) {
      let pgn = "";
      data.moves.forEach(m => {
        if (m.white_move || m.black_move) {
          pgn += `${m.move_number}. ${m.white_move || ""}`;
          if (m.white_time) pgn += ` {[%clk ${m.white_time}]}`;
          pgn += ` ${m.black_move || ""}`;
          if (m.black_time) pgn += ` {[%clk ${m.black_time}]}`;
          pgn += " ";
        }
      });
      return pgn.trim();
    }
    
    // Fallback for old string format
    let text = data.toString().replace(/```(pgn|markdown|html)?/gi, '').replace(/```/g, '').trim()

    if (text.includes('<table') || text.includes('<td>') || text.includes('<tr>')) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'text/html')
      const rows = doc.querySelectorAll('tr')
      let parsedPgn = ""; let defaultMove = 1
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim()).filter(c => c)
        if (cells.length > 0) {
          const numCellIndex = cells.findIndex(c => c.match(/^\d+\.?$/))
          let num = defaultMove
          if (numCellIndex !== -1) { num = parseInt(cells[numCellIndex].replace(/\D/g, '')); cells.splice(numCellIndex, 1) }
          defaultMove = num + 1
          const moves = cells.filter(c => c.toLowerCase() !== 'white' && c.toLowerCase() !== 'black' && c !== '')
          if (moves.length > 0) parsedPgn += `${num}. ${moves[0] || ""} ${moves[1] || ""} `
        }
      })
      if (parsedPgn.trim()) return parsedPgn.trim()
    }

    if (text.includes('|') && text.includes('---')) {
      const lines = text.split('\n'); let parsedPgn = ""; let defaultMove = 1
      lines.forEach(line => {
        if (line.includes('|') && !line.includes('---')) {
          const cells = line.split('|').map(s => s.trim()).filter(s => s)
          if (cells.length > 0 && cells[0].toLowerCase() !== 'white') {
            const numCellIndex = cells.findIndex(c => c.match(/^\d+\.?$/))
            let num = defaultMove
            if (numCellIndex !== -1) { num = parseInt(cells[numCellIndex].replace(/\D/g, '')); cells.splice(numCellIndex, 1) }
            defaultMove = num + 1
            const moves = cells.filter(c => c.toLowerCase() !== 'white' && c.toLowerCase() !== 'black')
            if (moves.length > 0) parsedPgn += `${num}. ${moves[0] || ""} ${moves[1] || ""} `
          }
        }
      })
      if (parsedPgn.trim()) return parsedPgn.trim()
    }

    return text
  }

  const runFinalOcr = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    if (!cropPreviewUrl) { toast.error("Please scan a region first to verify the cropped area."); return }

    setIsOcrRunning(true)
    try {
      const formData = new FormData()
      formData.append('filename', file.name)
      formData.append('x', crop.x || 0)
      formData.append('y', crop.y || 0)
      formData.append('width', crop.width || 0)
      formData.append('height', crop.height || 0)
      formData.append('skip_ocr', 'false')

      const response = await axios.post('/api/ocr-crop', formData)
      if (response.data.pgn) {
        setRawOcrText(JSON.stringify(response.data.pgn, null, 2))
        let parsed = parseOcrOutput(response.data.pgn)
        setPgn(parsed)
        setStep(3)
      }
    } catch (error) {
      toast.error("Failed to extract moves.")
    } finally {
      setIsOcrRunning(false)
    }
  }

  const runTimestampExtraction = async () => {
    if (!pgn.trim()) { toast.error("Extract moves first!"); return }
    setIsTsRunning(true)
    try {
      const formData = new FormData()
      formData.append('filename', `crop_${file.name}`)
      formData.append('pgn_context', pgn)

      const response = await axios.post('/api/extract-timestamps', formData)
      if (response.data.timestamps) {
        // Merge timestamps into PGN
        const tsMap = {}
        response.data.timestamps.forEach(ts => {
          tsMap[ts.move_number] = ts
        })

        // Simple PGN merging logic
        const moveRegex = /(\d+)\.\s+([^\s{]+)(?:\s+\{\s*\[%clk\s+([^\\]]+)\]\s*\})?(?:\s+([^\s{]+)(?:\s+\{\s*\[%clk\s+([^\\]]+)\]\s*\})?)?/g
        let match; let newPgn = ""
        while ((match = moveRegex.exec(pgn)) !== null) {
          const num = parseInt(match[1])
          const white = match[2]
          const black = match[4] || ''
          const ts = tsMap[num] || {}
          
          newPgn += `${num}. ${white}`
          if (ts.white_time) newPgn += ` {[%clk ${ts.white_time}]}`
          if (black) {
            newPgn += ` ${black}`
            if (ts.black_time) newPgn += ` {[%clk ${ts.black_time}]}`
          }
          newPgn += " "
        }
        setPgn(newPgn.trim())
        toast.success("Timestamps merged.")
      }
    } catch (error) {
      toast.error("Failed to extract timestamps.")
    } finally {
      setIsTsRunning(false)
    }
  }

  const runFullAnalysis = () => {
    if (!pgn.trim()) return
    navigate('/analyze', { state: { title, pgn, depth: analysisDepth, game_uuid: gameUuid } })
  }



  return (
    <div className="upload-page">
      {step === 1 && (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div className="card">
            <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-lg)', borderBottom: '1px solid var(--border-dim)', paddingBottom: 'var(--space-md)' }}>
              {[
                { id: 'photo',  label: 'Scoresheet' },
                { id: 'pgn',    label: 'PGN' },
                { id: 'online', label: 'Online Import' },
              ].map(m => (
                <button
                  key={m.id}
                  className={`btn ${importMethod === m.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setImportMethod(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {importMethod === 'photo' && (
              <div className="upload-dropzone" onClick={() => document.getElementById('fileInput').click()}>
                <div className="dropzone-icon">📸</div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>Click to select an image of your scoresheet</p>
                <input id="fileInput" type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                <button type="button" className="btn btn-primary" onClick={(e) => { e.stopPropagation(); document.getElementById('fileInput').click() }}>Choose File</button>
              </div>
            )}

            {importMethod === 'pgn' && (
              <div>
                <textarea
                  placeholder="Paste PGN here..."
                  onChange={(e) => setPgn(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 'var(--space-md)' }}
                  onClick={() => {
                    if (!pgn.trim()) { toast.error("Paste some PGN first!"); return }
                    setTitle("Pasted Game")
                    setStep(3)
                  }}
                >
                  Load Editor
                </button>
              </div>
            )}

            {importMethod === 'online' && <OnlineImport />}
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} style={{ fontSize: '12px' }}>Back</button>
            <h2 className="step-heading" style={{ margin: 0 }}>2. Outline the Moves</h2>
          </div>

          <div className="crop-layout">
            <div className="crop-panel">
              <ReactCrop
                crop={crop}
                onChange={(pixelCrop, percentCrop) => setCrop(percentCrop)}
              >
                <img
                  src={previewUrl}
                  style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
                  alt="Crop target"
                />
              </ReactCrop>
            </div>

            {cropPreviewUrl && (
              <div className="crop-preview-panel">
                <h4>Last Scan Region</h4>
                <img src={cropPreviewUrl} style={{ maxWidth: '100%', maxHeight: '50vh', display: 'block' }} alt="Last Cropped Region" />
              </div>
            )}
          </div>

          {isOcrRunning ? (
            <div className="ocr-loading">
              <div className="ocr-spinner" />
              <div className="ocr-progress-bar">
                <div className="ocr-progress-fill" />
              </div>
              <p className="ocr-loading-label">Extracting moves with Gemini — this may take a few seconds...</p>
            </div>
          ) : (
            <div className="crop-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={runPreviewGeneration}
                disabled={isCroppingPreview}
              >
                {isCroppingPreview ? 'Saving Crop...' : 'Generate Preview'}
              </button>

              {cropPreviewUrl && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={runFinalOcr}
                >
                  Run AI Extraction
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <>
          <div className={(previewUrl && showReference) ? 'step3-layout' : 'step3-layout-single'}>
            {previewUrl && showReference && (
              <div>
                <div className="step3-header">
                  <h3>Reference Image</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={() => setShowReference(false)} className="btn btn-secondary" style={{ fontSize: '12px' }}>Hide</button>
                    <button type="button" onClick={() => setStep(2)} className="btn btn-secondary" style={{ fontSize: '12px' }}>Adjust Crop</button>
                  </div>
                </div>
                <img
                  src={previewUrl}
                  style={{ width: '100%', position: 'sticky', top: 'var(--space-lg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-dim)' }}
                  alt="Reference"
                />
              </div>
            )}
            <div>
              <div className="step3-header" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => navigate('/games')}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    title="Exit import"
                  >✕ Close</button>
                  {previewUrl && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setStep(2)}
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                    >Back to Crop</button>
                  )}
                  <h3 style={{ margin: 0, whiteSpace: 'nowrap' }}>{editState.gameId ? 'Editing Game' : 'Notation Editor'}</h3>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Game title…"
                    className="game-info-input"
                    style={{
                      height: '28px',
                      minWidth: 200,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {editState.gameId && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: '12px' }}
                      onClick={async () => {
                        if (pgn) {
                          await axios.post('/api/save-pgn', { title: title || editState.title, pgn, game_uuid: gameUuid })
                        }
                        navigate('/games')
                      }}
                    >Save & Return</button>
                  )}
                  {previewUrl && !showReference && (
                    <button type="button" onClick={() => setShowReference(true)} className="btn btn-secondary" style={{ fontSize: '12px' }}>Show Reference</button>
                  )}
                  {pgn && (
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={runTimestampExtraction} 
                      disabled={isTsRunning}
                      style={{ fontSize: '12px' }}
                    >
                      {isTsRunning ? 'Scanning Times...' : 'Extract Timestamps'}
                    </button>
                  )}
                  {pgn && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select 
                        value={analysisDepth} 
                        onChange={(e) => setAnalysisDepth(e.target.value)}
                        className="game-info-input"
                        style={{ width: 'auto', minWidth: 120, height: '28px', padding: '0 8px' }}
                      >
                        <option value="Fast">Fast (0.5s)</option>
                        <option value="Standard">Standard (2.0s)</option>
                        <option value="Deep">Deep (10.0s)</option>
                      </select>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={runFullAnalysis}
                      >
                        Full Analysis
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {rawOcrText && (
                <details className="ocr-raw-output">
                  <summary>Raw OCR Output</summary>
                  <pre>{rawOcrText}</pre>
                </details>
              )}
              {pgn && <ScoreSheetInput pgn={pgn} setPgn={setPgn} gameId={savedGameId} gameUuid={gameUuid} initialTitle={title || null} />}
            </div>
          </div>

          <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3>Export / Import PGN</h3>
              <button 
                className="btn btn-secondary" 
                style={{ fontSize: '12px' }}
                onClick={() => {
                  navigator.clipboard.writeText(pgn);
                  toast.success("PGN copied to clipboard!");
                }}
              >
                Copy
              </button>
            </div>
            <textarea 
              value={pgn} 
              onChange={(e) => setPgn(e.target.value)}
              placeholder="Paste PGN here to import, or copy from here to export..."
              style={{ width: '100%', height: '120px', fontFamily: 'monospace', fontSize: '14px', background: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-sm)' }} 
            />
          </div>
        </>
      )}
      {/* Modal removed */}
    </div>
  )
}

export default Upload
