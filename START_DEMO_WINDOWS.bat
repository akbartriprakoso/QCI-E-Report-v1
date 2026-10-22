@echo off
title QCI E-Report - Database Server
set "PORT=8090"
set "DATA_MODE=database"
node "%~dp0server.js"
pause
