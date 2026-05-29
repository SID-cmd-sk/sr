@echo off
title SR Platform Services
color 0A

echo.
echo  ================================================
echo   SR Platform - Starting Local
echo  ================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found. Install from https://python.org
    pause
    exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

echo  [Setup] Checking Python dependencies...
pip show flask >nul 2>&1
if errorlevel 1 (
    echo  [Setup] Installing flask and flask-cors...
    pip install flask flask-cors --quiet
)

if not exist "local\wa-service\node_modules" (
    echo  [Setup] Installing WhatsApp bridge dependencies...
    cd local\wa-service
    call npm install --silent
    cd ..\..
)

echo.
echo  [1/2] Starting Email Relay on port 3002...
start "SR Email Server" cmd /c "title SR Email Server && python local\email_server.py"

timeout /t 2 /nobreak >nul

echo  [2/2] Starting WhatsApp Bridge on port 3001...
start "SR WhatsApp Bridge" cmd /c "title SR WhatsApp Bridge && cd local\wa-service && node bridge.js"

echo.
echo  ================================================
echo   Both services started!
echo   Email Relay  ->  http://localhost:3002
echo   WA Bridge    ->  http://localhost:3001
echo.
echo   Keep this window open or close it safely.
echo  ================================================
echo.
pause
