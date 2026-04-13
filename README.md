# Chess Analyzer

A self-hosted web app for analyzing chess games. Import a handwritten scoresheet via AI-powered OCR or paste PGN directly, run Stockfish engine analysis, and review your play with evaluation charts, blunder highlights, best-move suggestions, and an opening tree explorer built from your own game library.

## Features

- **Scoresheet OCR** — photograph a handwritten scoresheet, draw a crop region, and extract moves automatically using Gemini AI
- **PGN import** — paste any PGN directly into the move editor; drag to reorder or correct moves before analyzing
- **Stockfish analysis** — real-time engine evaluation streamed over WebSocket; configurable depth and thread count
- **Review view** — evaluation bar, centipawn-loss chart, move grades (A+ → F), top engine lines, and live multi-PV eval as you navigate the game
- **Game library** — searchable by player name and date range, grouped by month, with a mini board thumbnail per game
- **Opening tree explorer** — visualize your repertoire from any position with W/D/L stats and your personal record per move
- **Time insights** — when clock annotations are present, charts show accuracy vs. time spent per move

## Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.9+ | Backend |
| Node.js 18+ | Frontend build |
| [Stockfish](https://stockfishchess.org/download/) | Must be installed separately |
| Gemini API key *(optional)* | Only needed for scoresheet OCR |

**Install Stockfish:**
```bash
# macOS
brew install stockfish

# Ubuntu / Debian
sudo apt install stockfish

# Windows — download from stockfishchess.org and note the .exe path
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Elykauf/chess-analyzer.git
cd chess-analyzer

# 2. Backend
cd backend
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp config.example.json config.json
# Edit config.json — set stockfish_path, optionally add gemini_api_key

# 3. Frontend
cd ../frontend
npm install

# 4. Launch
cd ..
./start.sh
```

Open **http://localhost:3001**.

> On first run, open **Settings (⚙)** to verify your Stockfish path.

## Configuration

`backend/config.json` (not committed — copy from `config.example.json`):

| Field | Description | Example |
|---|---|---|
| `stockfish_path` | Absolute path to the Stockfish binary | `/opt/homebrew/opt/stockfish/bin/stockfish` |
| `gemini_api_key` | Google AI Studio key; leave blank to disable OCR | `AIza...` |
| `player_name` | Your name as it appears in PGN headers (used for opening tree stats) | `Magnus` |
| `stockfish_threads` | CPU threads allocated to the engine | `4` |

All settings are also editable live from the **⚙ Settings** menu in the app.

## Usage

### Importing a game

**From PGN** — go to Upload, paste PGN, edit moves if needed, then click **Analyze**.

**From a scoresheet photo:**
1. Drop or select a photo of the scoresheet
2. Draw a crop rectangle around the move columns
3. Click **Run AI Extraction** — Gemini reads the moves
4. Correct any misread moves in the editor
5. Click **Analyze**

### Reviewing analysis

After analysis you land on the Review page:
- The **evaluation chart** shows engine score across the game; blunders/mistakes/inaccuracies are marked
- Click any move to jump to that position — live multi-PV lines appear in the sidebar
- **Accuracy grades** (A+ → F) are computed per move from centipawn loss
- Use the **arrow keys** or click the move list to step through the game

### Game library

**My Games** — lists all saved games with player search and date-range filters. Click a game to reload it into Review.

**Opening Tree** — explore your repertoire from any position. Click a move to drill down; each node shows games played, W/D/L percentages, your personal record, and average engine eval.

## Development

```bash
# Backend (port 9001, auto-reload)
cd backend
venv/bin/uvicorn main:app --host 0.0.0.0 --port 9001 --reload

# Frontend (port 3001)
cd frontend
npm run dev
```

The frontend proxies all `/api` requests (including WebSocket) to the backend via Vite's dev server.

## Tests

End-to-end tests use [Playwright](https://playwright.dev/) and run against a separate `chess_e2e.db` so they never touch your game library.

```bash
# Install test dependencies (once)
npm install

# Run all tests (headless)
npm run test:e2e

# Run with a visible browser
npm run test:e2e:headed

# Interactive UI mode
npm run test:e2e:ui
```

The test runner starts both servers automatically. `backend/config.json` must exist and point to a valid Stockfish binary.

## Project Structure

```
chess-analyzer/
├── backend/
│   ├── main.py              # FastAPI server — all API and WebSocket routes
│   ├── database.py          # SQLite persistence (games, moves, position cache)
│   ├── engines/
│   │   ├── stockfish.py     # Stockfish UCI wrapper (python-chess)
│   │   └── gemini_ocr.py    # Gemini AI scoresheet OCR
│   ├── config.example.json  # Config template
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx           # Router + global analysis state
│       └── components/
│           ├── Upload.jsx        # Import wizard (OCR + PGN paste)
│           ├── ScoreSheetInput.jsx  # Move editor with drag-to-reorder
│           ├── Review.jsx        # Analysis view (charts, board, move list)
│           ├── Games.jsx         # Game library + opening explorer
│           ├── Config.jsx        # Settings panel
│           └── Toast.jsx         # Toast notification system
├── e2e/                     # Playwright end-to-end tests
├── start.sh                 # Launch script (macOS / Linux)
├── start.bat                # Launch script (Windows)
└── playwright.config.js

```

## Tech Stack

**Backend** — Python, FastAPI, python-chess, Stockfish (UCI), SQLite, Google Gemini AI, Pillow

**Frontend** — React 18, Vite, react-chessboard, chess.js, Recharts, Framer Motion, Axios

**Tests** — Playwright

## License

MIT — see [LICENSE](LICENSE).
