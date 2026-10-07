@echo off
cd /d "%~dp0"
title QCI E-Report - LAN Server
set "PORT=8090"
set "SERVER_HOST=0.0.0.0"
set "DATA_MODE=legacy-api"
set "LEGACY_API_BASE=http://10.13.5.151:5000/api"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js tidak ditemukan. Install Node.js 18 atau lebih baru.
  pause
  exit /b 1
)
node server.js
pause
