@echo off
REM Chess Game Analyzer - Start Script for Windows

echo Starting Chess Game Analyzer...
echo.

echo Starting Backend Server (Port 8000)...
cd /d %~dp0backend
call "C:\Users\elijah\AppData\Local\Programs\Python\Python39\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 &

echo Starting Frontend Server (Port 5173)...
cd /d %~dp0frontend
call npm run dev &

echo.
echo Both servers starting...
echo.
echo Access the app at: http://localhost:5173
echo API health check: http://localhost:8000/api/health
echo.
echo Press Ctrl+C to stop all servers
echo.
