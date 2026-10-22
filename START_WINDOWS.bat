@echo off
cd /d "%~dp0"
title QCI E-Report - LAN Server
set PORT=8090
set SERVER_HOST=0.0.0.0
set DATA_MODE=database
node server.js
pause
