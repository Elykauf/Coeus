#!/bin/bash

# Chess Analyzer - Tailscale Run Script
# Exposes the app via your Tailscale network with automatic HTTPS.
# Prerequisites:
#   - Tailscale must be installed and authenticated (`tailscale up`)
#   - Backend venv set up (`cd backend && python3 -m venv venv && venv/bin/pip install -r requirements.txt`)
#   - Both servers bind to Tailscale IP so tailscale serve can proxy them

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect Tailscale IP
TAILSCALE_IP=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Self',{}).get('TailscaleIPs',[''])[0])" 2>/dev/null || echo "")
TAILSCALE_HOSTNAME=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Self',{}).get('DNSName',''))" 2>/dev/null || echo "")

if [ -z "$TAILSCALE_IP" ]; then
    echo -e "${YELLOW}Tailscale not running or not authenticated. Run:${NC}"
    echo "  tailscale up"
    exit 1
fi

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

echo "Starting Chess Analyzer on Tailscale..."
echo ""

# Kill any existing servers on those ports
fuser -k ${TAILSCALE_IP}:9001/tcp 2>/dev/null || true
fuser -k ${TAILSCALE_IP}:3001/tcp 2>/dev/null || true
fuser -k 127.0.0.1:9001/tcp 2>/dev/null || true
fuser -k 127.0.0.1:3001/tcp 2>/dev/null || true

# Start backend bound to all interfaces
echo -e "${BLUE}Starting Backend (0.0.0.0:9001)${NC}"
cd "$SCRIPT_DIR/backend"
venv/bin/uvicorn main:app --host 0.0.0.0 --port 9001 &
BACKEND_PID=$!

# Small delay to let backend bind
sleep 1

# Start frontend bound to all interfaces
echo -e "${BLUE}Starting Frontend (0.0.0.0:3001)${NC}"
cd "$SCRIPT_DIR/frontend"
HOST=0.0.0.0 npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}Both servers starting on Tailscale...${NC}"
echo ""
echo "  App:    https://${TAILSCALE_HOSTNAME}"
echo "  API:    https://${TAILSCALE_HOSTNAME}/api"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
