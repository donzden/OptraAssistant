@echo off
setlocal
set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%

echo =============================================
echo  OptraAssistant - Starting Dev Environment
echo =============================================
echo.

echo [1/4] Starting Postgres + Redis...
start "DB" cmd /k "cd /d "%ROOT%" && docker-compose up postgres redis"

echo Waiting 8s for database to be ready...
timeout /t 8 /nobreak > nul

echo [2/4] Starting API (port 4000)...
start "API" cmd /k "cd /d "%ROOT%\api" && npm install && node_modules\.bin\prisma migrate dev && npm run dev"

echo [3/4] Starting Engine (port 8000)...
start "Engine" cmd /k "cd /d "%ROOT%\engine" && pip install -r requirements.txt -q && uvicorn app.main:app --reload"

echo [4/4] Starting Frontend (port 5173)...
start "Frontend" cmd /k "cd /d "%ROOT%\frontend" && npm install && npm run dev"

echo.
echo =============================================
echo  All services starting up.
echo  Open http://localhost:5173 in your browser.
echo  (allow ~30s on first run)
echo =============================================
