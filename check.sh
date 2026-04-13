#!/bin/bash

# Chess Game Analyzer - Check if servers are already running

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🔍 Checking Chess Game Analyzer servers..."
echo ""

# Check backend
if lsof -i :9001 &>/dev/null; then
    echo -e "${GREEN}✅ Backend server is running on port 9001${NC}"
    BACKEND_RUNNING=true
else
    echo -e "${BLUE}❌ Backend server not running on port 9001${NC}"
    BACKEND_RUNNING=false
fi

# Check frontend
if lsof -i :3001 &>/dev/null; then
    echo -e "${GREEN}✅ Frontend server is running on port 3001${NC}"
    FRONTEND_RUNNING=true
else
    echo -e "${BLUE}❌ Frontend server not running on port 3001${NC}"
    FRONTEND_RUNNING=false
fi

echo ""

# Determine action
if [ "$BACKEND_RUNNING" = true ] && [ "$FRONTEND_RUNNING" = true ]; then
    echo -e "${GREEN}✅ All servers are already running!${NC}"
    echo ""
    echo "🌐 Access the app at: http://localhost:3001"
    exit 0
elif [ "$BACKEND_RUNNING" = true ]; then
    echo -e "${BLUE}⚠️  Backend is running, starting frontend only...${NC}"
    cd ~/projects/chess-analyzer/frontend
    npm run dev &
    exit 0
elif [ "$FRONTEND_RUNNING" = true ]; then
    echo -e "${BLUE}⚠️  Frontend is running, starting backend only...${NC}"
    cd ~/projects/chess-analyzer/backend
    venv/bin/uvicorn main:app --host 0.0.0.0 --port 9001 &
    exit 0
else
    echo -e "${BLUE}🚀 Starting all servers...${NC}"
    echo ""
    ~/projects/chess-analyzer/start.sh
    exit 0
fi
