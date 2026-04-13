# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Start Both Servers
```bash
./start.sh
```

### Backend (FastAPI)
```bash
cd backend
venv/bin/uvicorn main:app --host 0.0.0.0 --port 9001 --reload
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev    # http://localhost:3001
npm run build
```

### Health check
```bash
curl http://localhost:9001/api/config
```

## Architecture

Local web app that analyzes chess games using Stockfish + optional Gemini AI for scoresheet OCR.

**Backend** (`backend/`) — FastAPI on port 9001:
- `main.py` — All API routes. Stockfish is a lazy global singleton initialized on first use or when config changes.
- `engines/stockfish.py` — `StockfishAnalyzer` wraps `chess.engine.SimpleEngine` (python-chess UCI interface). Streaming multipv analysis via `get_multipv_stream()`.
- `engines/gemini_ocr.py` — Gemini AI OCR for handwritten scoresheets. Reads API key from `config.json` at call time.
- `database.py` — Raw SQLite via `sqlite3`. Games stored as JSON blobs with indexed metadata columns. `init_db()` runs migrations on startup.
- `config.json` — Persisted config (stockfish path, gemini key, player name, threads). Not committed — copy from `config.example.json`.

**Frontend** (`frontend/src/`) — React 18 + Vite:
- `App.jsx` — Router with routes: `/`, `/config`, `/upload`, `/games`, `/review`. Analysis state lives here, passed as prop to `<Review>`. Wrapped with `<ToastProvider>`.
- `components/Upload.jsx` — Multi-step wizard: step 1 (image drop or PGN paste) → step 2 (crop region) → step 3 (`ScoreSheetInput` editor). Crop coordinates sent as percentages (0–100).
- `components/Review.jsx` — Analysis view: Recharts charts, `react-chessboard`, move list, live Stockfish eval via WebSocket.
- `components/ScoreSheetInput.jsx` — PGN move editor with validation, drag-to-reorder, and game save.
- `components/Games.jsx` — Game library (searchable list + opening explorer tree).
- `components/Config.jsx` — Settings page.
- `components/Toast.jsx` — Toast notification system (`useToast()` hook).

**Data flow:**
1. Image uploaded via `POST /api/upload-only` → saved to `backend/uploads/`
2. User draws crop → `POST /api/ocr-crop` with `skip_ocr=true` → saves preview to `backend/cropped/`
3. "Run AI Extraction" → same endpoint with `skip_ocr=false` → Gemini OCR → returns JSON moves
4. User edits moves in ScoreSheetInput
5. "Analyze" → WebSocket `/api/ws/full-analysis` → Stockfish analysis per move → navigates to `/review`
6. Review page → WebSocket `/api/ws/evaluate` streams live multipv eval on move navigation

**WebSocket connections** use `window.location.host` (no hardcoded port) proxied through Vite's dev server (`ws: true` in vite.config.js).

## Key Configuration
- Backend port: **9001**
- Frontend port: **3001** (Vite), proxies `/api` (including WebSocket) to `http://127.0.0.1:9001`
- Stockfish path: set in `backend/config.json` (macOS Homebrew default: `/opt/homebrew/opt/stockfish/bin/stockfish`)
- `backend/config.json` is gitignored; copy from `config.example.json`
