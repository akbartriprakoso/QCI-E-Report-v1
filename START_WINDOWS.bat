@echo off
set PORT=8090
set DATA_MODE=legacy-api
set LEGACY_API_BASE=http://10.13.5.151:5000/api
node "%~dp0server.js"
pause
