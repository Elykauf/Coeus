import React, { useState, useEffect, useRef } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import axios from 'axios'
import { NamePromptModal, MoveCorrectionModal, ScoreSheetRow } from './ui'
import { parsePgnHeaders } from '../utils/games'

const ScoreSheetInput = ({ pgn, setPgn, gameId, gameUuid, initialTitle }) => {
  const [gameResult, setGameResult] = useState('*')
  const [modalData, setModalData] = useState(null)
  const [illegalIndex, setIllegalIndex] = useState(-1)
  const [illegalSide, setIllegalSide] = useState(null)
  const [notTop5, setNotTop5] = useState([])
  const [history, setHistory] = useState([])
  const [selectedIndex, setSelectedIndex] = useState({ idx: 0, side: 'white' })
  const [currentFen, setCurrentFen] = useState('start')
  const [boardOrientation, setBoardOrientation] = useState('white')
  const [savedName, setSavedName] = useState(initialTitle || null)
  const [namePrompt, setNamePrompt] = useState(null) // pgn to save after naming
  const internalPgnUpdate = useRef(false)

  // Metadata fields
  const [whiteName, setWhiteName] = useState('')
  const [blackName, setBlackName] = useState('')
  const [whiteElo, setWhiteElo] = useState('')
  const [blackElo, setBlackElo] = useState('')
  const [timeControl, setTimeControl] = useState('')

  // Auto-prompt for name when a valid PGN arrives from the parent (e.g. paste)
  useEffect(() => {
    if (internalPgnUpdate.current) { internalPgnUpdate.current = false; return }
    if (pgn && /\d+\./.test(pgn)) {
      const h = parsePgnHeaders(pgn)
      if (h.White && h.White !== '?') setWhiteName(h.White)
      if (h.Black && h.Black !== '?') setBlackName(h.Black)
      if (h.WhiteElo) setWhiteElo(h.WhiteElo)
      if (h.BlackElo) setBlackElo(h.BlackElo)
      if (h.TimeControl) setTimeControl(h.TimeControl)
      if (h.Result && ['1-0', '0-1', '1/2-1/2', '*'].includes(h.Result)) setGameResult(h.Result)
      if (!savedName) setNamePrompt(pgn)
    }
  }, [pgn])
  const boardContainerRef = React.useRef(null)
  const [boardWidth, setBoardWidth] = useState(480)

  React.useEffect(() => {
    const el = boardContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setBoardWidth(Math.round(entry.contentRect.width))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const parseMoves = () => {
    // 1. Remove PGN headers (tags at the start of lines like [Event "..."])
    // We only want to remove brackets that are at the start of a line or only preceded by whitespace
    const body = pgn.replace(/^[\s]*\[(?!%)[^\]]+\][\s]*$/gm, '').trim()
    
    const truncateClock = (clk) => {
      if (!clk) return ''
      return clk.split(/[.,]/)[0]
    }

    // 2. Tokenize the PGN body
    // This regex captures:
    // - Move numbers: 1., 2., 1...
    // - SAN moves: e4, Nf3, O-O, cxb8=Q+
    // - Comments: {[%clk ...]}
    const tokenRegex = /(\d+\.+)|(\{[\s\S]*?\})|([^\s{}]+)/g
    const tokens = body.match(tokenRegex) || []
    
    const rows = []
    const flatMoves = []
    let lastRow = null

    let gameOutcome = null
    const resultLabels = {
      '1-0': 'White won',
      '0-1': 'Black won',
      '1/2-1/2': 'Draw',
      '1/2': 'Draw',
      '*': 'Unfinished'
    }

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      
      if (token.match(/^\d+\.+$/)) {
        const num = parseInt(token)
        if (!lastRow || (lastRow.num !== num && !token.includes('...'))) {
          if (lastRow) rows.push(lastRow)
          lastRow = { num, white: '', whiteTime: '', black: '', blackTime: '' }
        }
      } else if (token.startsWith('{')) {
        const clkMatch = token.match(/\[%clk\s+([^\]]+)\]/)
        const clk = clkMatch ? truncateClock(clkMatch[1]) : ''
        if (lastRow) {
          if (lastRow.black) lastRow.blackTime = clk
          else if (lastRow.white) lastRow.whiteTime = clk
          if (flatMoves.length > 0) flatMoves[flatMoves.length - 1].time = clk
        }
      } else {
        const move = token
        if (['1-0', '0-1', '1/2-1/2', '*', '1/2'].includes(move)) {
          gameOutcome = resultLabels[move] || move
          if (!lastRow) {
            lastRow = { num: 1, white: gameOutcome, whiteTime: '', black: '', blackTime: '' }
          } else if (!lastRow.white) {
            lastRow.white = gameOutcome
          } else if (!lastRow.black) {
            lastRow.black = gameOutcome
          } else {
            rows.push(lastRow)
            lastRow = { num: lastRow.num + 1, white: gameOutcome, whiteTime: '', black: '', blackTime: '' }
          }
          break // End of game
        }

        if (!lastRow) {
          lastRow = { num: 1, white: move, whiteTime: '', black: '', blackTime: '' }
          flatMoves.push({ move, time: '' })
        } else if (!lastRow.white) {
          lastRow.white = move
          flatMoves.push({ move, time: '' })
        } else if (!lastRow.black) {
          lastRow.black = move
          flatMoves.push({ move, time: '' })
        } else {
          rows.push(lastRow)
          lastRow = { num: lastRow.num + 1, white: move, whiteTime: '', black: '', blackTime: '' }
          flatMoves.push({ move, time: '' })
        }
      }
    }
    if (lastRow) rows.push(lastRow)

    // Only pad if we haven't reached a definitive outcome
    const paddedRows = [...rows]
    if (!gameOutcome) {
      const totalRows = Math.max(50, rows.length + 5)
      for (let i = paddedRows.length; i < totalRows; i++) {
        paddedRows.push({ num: i + 1, white: '', whiteTime: '', black: '', blackTime: '' })
      }
    }

    return { rows: paddedRows, flat: flatMoves, result: gameOutcome || '*' }
  }

  const { rows: movesArr, flat: actualMoves } = parseMoves()

  useEffect(() => {
    const g = new Chess()
    const flatSelectedI = selectedIndex.side === 'white' ? selectedIndex.idx * 2 : selectedIndex.idx * 2 + 1
    try {
      const prior = actualMoves.slice(0, flatSelectedI + 1)
      for (const m of prior) if (m.move) g.move(m.move)
      setCurrentFen(g.fen())
    } catch (e) {}
  }, [selectedIndex, pgn])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (modalData) return
      const { idx, side } = selectedIndex
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (side === 'white') setSelectedIndex({ idx, side: 'black' })
        else setSelectedIndex({ idx: idx + 1, side: 'white' })
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (side === 'black') setSelectedIndex({ idx, side: 'white' })
        else if (idx > 0) setSelectedIndex({ idx: idx - 1, side: 'black' })
      } else if (e.key === 'ArrowDown') {
        e.preventDefault(); setSelectedIndex({ idx: idx + 1, side })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); if (idx > 0) setSelectedIndex({ idx: idx - 1, side })
      } else if (e.key === 'Enter') {
        e.preventDefault(); handleCellOpen(idx, side)
      } else if (e.key.toLowerCase() === 'f') {
        setBoardOrientation(p => p === 'white' ? 'black' : 'white')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, modalData])

  useEffect(() => {
    const validate = async () => {
      const RESULT_STRINGS = ['White won', 'Black won', 'Draw', 'Unfinished'];
      const g = new Chess(); const seq = []; let fI = -1; let fS = null
      for (let i = 0; i < movesArr.length; i++) {
        if (movesArr[i].white) {
          if (RESULT_STRINGS.includes(movesArr[i].white)) break;
          try { if (!g.move(movesArr[i].white)) throw 1; seq.push(movesArr[i].white) }
          catch { fI = i; fS = 'white'; break }
        }
        if (movesArr[i].black) {
          if (RESULT_STRINGS.includes(movesArr[i].black)) break;
          try { if (!g.move(movesArr[i].black)) throw 1; seq.push(movesArr[i].black) }
          catch { fI = i; fS = 'black'; break }
        }
      }
      setIllegalIndex(fI); setIllegalSide(fS)
      if (seq.length > 0) {
        try {
          const resp = await axios.post('/api/validate-moves', { moves: seq })
          const fails = []; resp.data.results.forEach((v, idx) => { if (!v) fails.push(idx) })
          setNotTop5(fails)
        } catch (e) {}
      }
    }
    validate()
  }, [pgn])

  const rebuildPgn = (flat) => {
    let newP = ""
    for (let i = 0; i < flat.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1
      const white = flat[i]
      const black = flat[i + 1]
      
      newP += `${moveNum}. ${white?.move || ""}`
      if (white?.time) newP += ` {[%clk ${white.time}]}`
      
      if (black) {
        newP += ` ${black.move || ""}`
        if (black.time) newP += ` {[%clk ${black.time}]}`
      }
      newP += " "
    }
    return newP.trim()
  }

  const buildHeadersPgn = (movesBody) => {
    const lines = []
    if (whiteName) lines.push(`[White "${whiteName}"]`)
    if (blackName) lines.push(`[Black "${blackName}"]`)
    if (whiteElo) lines.push(`[WhiteElo "${whiteElo}"]`)
    if (blackElo) lines.push(`[BlackElo "${blackElo}"]`)
    if (timeControl) lines.push(`[TimeControl "${timeControl}"]`)
    lines.push(`[Result "${gameResult}"]`)
    
    // Strip existing result from body if we have one so we don't duplicate it
    const cleanBody = movesBody.replace(/(?:1-0|0-1|1\/2-1\/2|\*)$/, '').trim()
    return lines.length ? lines.join('\n') + '\n\n' + cleanBody + ' ' + gameResult : cleanBody + ' ' + gameResult
  }

  const saveGamePgn = async (name, pgnText) => {
    try {
      const fullPgn = buildHeadersPgn(pgnText)
      await axios.post('/api/save-pgn', { title: name, pgn: fullPgn, game_uuid: gameUuid || null })
      setSavedName(name)
    } catch (e) { console.error('Save failed', e) }
  }

  // Re-save when metadata fields change (debounced, only if already named)
  const pgnRef = useRef(pgn)
  useEffect(() => { pgnRef.current = pgn }, [pgn])

  useEffect(() => {
    if (!savedName) return
    const id = setTimeout(() => saveGamePgn(savedName, pgnRef.current), 400)
    return () => clearTimeout(id)
  }, [whiteName, blackName, whiteElo, blackElo, timeControl, gameResult, savedName])

  const updateMove = (idx, side, v, mode = 'replace', time = null) => {
    setHistory(h => [...h.slice(-19), pgn])
    const curFlat = [...actualMoves]
    const fIdx = side === 'white' ? idx * 2 : idx * 2 + 1

    const truncateClock = (clk) => clk ? clk.split(/[.,]/)[0] : ''

    const moveObj = {
      move: v,
      time: time !== null ? truncateClock(time) : (curFlat[fIdx]?.time || '')
    }

    if (mode === 'slide') curFlat.splice(fIdx, 0, moveObj)
    else curFlat[fIdx] = moveObj

    const newPgn = rebuildPgn(curFlat)
    internalPgnUpdate.current = true
    setPgn(newPgn)

    if (!savedName) {
      setNamePrompt(newPgn)
    } else {
      saveGamePgn(savedName, newPgn)
    }
  }

  const deleteHalfMove = (idx, side) => {
    setHistory(h => [...h.slice(-19), pgn])
    const curFlat = [...actualMoves]
    const fIdx = side === 'white' ? idx * 2 : idx * 2 + 1
    curFlat.splice(fIdx, 1)
    setPgn(rebuildPgn(curFlat))
  }

  const insertHalfMove = (idx, side) => {
    setHistory(h => [...h.slice(-19), pgn])
    const curFlat = [...actualMoves]
    const fIdx = side === 'white' ? idx * 2 : idx * 2 + 1
    curFlat.splice(fIdx, 0, { move: '', time: '' })
    setPgn(rebuildPgn(curFlat))
  }

  const shiftToBlack = (idx) => {
    setHistory(h => [...h.slice(-19), pgn])
    const curFlat = [...actualMoves]
    const fIdx = idx * 2
    curFlat.splice(fIdx, 0, { move: '', time: '' })
    setPgn(rebuildPgn(curFlat))
  }

  const handleCellOpen = (idx, side, isIns = false) => {
    setSelectedIndex({ idx, side })
    const flatI = side === 'white' ? idx * 2 : idx * 2 + 1
    const tG = new Chess()
    try {
      const prior = actualMoves.slice(0, flatI)
      for (const m of prior) if (m.move) tG.move(m.move)
      const currentMove = actualMoves[flatI]
      const preFen = tG.fen()
      if (!isIns && currentMove?.move) { try { tG.move(currentMove.move) } catch (e) {} }
      setModalData({
        idx,
        side,
        num: idx + 1,
        fen: tG.fen(),
        preFen,
        sug: currentMove?.move || '', 
        time: currentMove?.time || '',
        isIns 
      })
    } catch (e) {}
  }

  const handleUndo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]; setHistory(h => h.slice(0, -1)); setPgn(prev)
  }

  return (
    <>
      {/* Game info bar — full width above the board+table layout */}
      <div className="game-info-bar">
        <div className="game-info-player">
          <span className="game-info-color-dot white-dot" />
          <input
            className="game-info-input"
            placeholder="White player"
            maxLength={60}
            style={{ maxWidth: '60ch' }}
            value={whiteName}
            onChange={e => setWhiteName(e.target.value)}
          />
          <input
            className="game-info-input game-info-elo"
            placeholder="Elo"
            maxLength={5}
            minLength={4}
            value={whiteElo}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '') // strip non-numeric
              setWhiteElo(val)
            }}
          />
        </div>
        <span className="game-info-vs">vs</span>
        <div className="game-info-player">
          <span className="game-info-color-dot black-dot" />
          <input
            className="game-info-input"
            placeholder="Black player"
            maxLength={60}
            style={{ maxWidth: '60ch' }}
            value={blackName}
            onChange={e => setBlackName(e.target.value)}
          />
          <input
            className="game-info-input game-info-elo"
            placeholder="Elo"
            maxLength={4}
            minLength={4}
            value={blackElo}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '') // strip non-numeric
              setBlackElo(val)
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <div className="game-info-time">
          <span className="field-label game-info-time-label">Time</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="game-info-input"
              placeholder="e.g. 60+0"
              value={timeControl}
              onChange={e => setTimeControl(e.target.value)}
              style={{ width: '80px' }}
            />
            <select
              className="game-info-input"
              value={gameResult}
              onChange={e => setGameResult(e.target.value)}
              style={{ width: 'auto', padding: '0 8px' }}
            >
              <option value="*">Result (*)</option>
              <option value="1-0">1-0</option>
              <option value="0-1">0-1</option>
              <option value="1/2-1/2">1/2-1/2</option>
            </select>
          </div>
        </div>
      </div>

      <div className="scoresheet-layout">
        <div className="scoresheet-preview">
          <div className="scoresheet-preview-header">
            <h3>{savedName || 'Board'}</h3>
            <button className="btn btn-secondary" onClick={() => setBoardOrientation(p => p === 'white' ? 'black' : 'white')} style={{ fontSize: '12px', padding: '4px 10px' }}>Flip (F)</button>
          </div>
          <div className="scoresheet-board-wrap" ref={boardContainerRef}>
            <Chessboard
              position={currentFen}
              boardWidth={boardWidth}
              boardOrientation={boardOrientation}
              onPieceDrop={(source, target) => {
                const g = new Chess(currentFen)
                try {
                  const m = g.move({ from: source, to: target, promotion: 'q' })
                  if (m) {
                    const nextSide = selectedIndex.side === 'white' ? 'black' : 'white'
                    const nextIdx = selectedIndex.side === 'white' ? selectedIndex.idx : selectedIndex.idx + 1
                    updateMove(nextIdx, nextSide, m.san)
                    setSelectedIndex({ idx: nextIdx, side: nextSide })
                    return true
                  }
                } catch (e) {}
                return false
              }}
            />
          </div>
        </div>

        <div className="scoresheet-table-wrap">
          <div className="scoresheet-toolbar">
            <button
              className="btn btn-danger"
              onClick={handleUndo}
              disabled={history.length === 0}
              style={{ fontSize: '13px', padding: '5px 14px' }}
            >
              Undo
            </button>
          </div>
          <div className="scoresheet-tables">
            {[0, 1].map(sidePart => (
              <table key={sidePart} className="scoresheet-table">
                <thead>
                  <tr><th>#</th><th>White</th><th>Black</th></tr>
                </thead>
                <tbody>
                  {movesArr.slice(sidePart * Math.ceil(movesArr.length / 2), (sidePart + 1) * Math.ceil(movesArr.length / 2)).map((m, i) => {
                    const actualIdx = sidePart * Math.ceil(movesArr.length / 2) + i
                    return (
                      <ScoreSheetRow
                        key={actualIdx}
                        m={m}
                        rI={actualIdx}
                        illegalSide={illegalSide}
                        illegalIndex={illegalIndex}
                        notTop5={notTop5}
                        handleCellClick={handleCellOpen}
                        insertMove={insertHalfMove}
                        shiftToBlack={shiftToBlack}
                        isSelected={selectedIndex}
                        deleteMove={deleteHalfMove}
                      />
                    )
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      </div>

      {namePrompt && (
        <NamePromptModal
          onSave={(name) => { saveGamePgn(name, namePrompt); setNamePrompt(null) }}
          onCancel={() => setNamePrompt(null)}
        />
      )}

      {modalData && (
        <MoveCorrectionModal
          isOpen={!!modalData}
          onClose={() => setModalData(null)}
          moveNum={modalData.num}
          side={modalData.side}
          currentFen={modalData.preFen || modalData.fen}
          initialFen={modalData.fen}
          suggestedMove={modalData.sug}
          suggestedTime={modalData.time}
          onConfirm={updateMove}
          isInsert={modalData.isIns}
          setModalData={setModalData}
          boardOrientation={boardOrientation}
          idx={modalData.idx}
        />
      )}
    </>
  )
}

export default ScoreSheetInput
