#!/bin/bash

# Chess Analyzer - Start Script
# Starts both the backend (FastAPI) and frontend (Vite) servers.
# Prerequisites: backend venv set up (`cd backend && python3 -m venv venv && venv/bin/pip install -r requirements.txt`)

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check backend venv exists
if [ ! -f "$SCRIPT_DIR/backend/venv/bin/uvicorn" ]; then
  echo -e "${YELLOW}Backend venv not found. Run:${NC}"
  echo "  cd backend && python3 -m venv venv && venv/bin/pip install -r requirements.txt"
  exit 1
fi

# Check config exists
if [ ! -f "$SCRIPT_DIR/backend/config.json" ]; then
  echo -e "${YELLOW}No config.json found. Copying from example:${NC}"
  cp "$SCRIPT_DIR/backend/config.example.json" "$SCRIPT_DIR/backend/config.json"
  echo "  Edit backend/config.json to set your Stockfish path and optional Gemini API key."
fi

echo "Starting Chess Analyzer..."
echo ""

# Start backend
echo -e "${BLUE}Starting Backend (port 9001)${NC}"
cd "$SCRIPT_DIR/backend"
venv/bin/uvicorn main:app --host 0.0.0.0 --port 9001 &
BACKEND_PID=$!

# Start frontend
echo -e "${BLUE}Starting Frontend (port 3001)${NC}"
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}Both servers starting...${NC}"
echo ""
echo "  App:    http://localhost:3001"
echo "  API:    http://localhost:9001"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
