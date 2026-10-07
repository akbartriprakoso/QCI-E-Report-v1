@echo off
cd /d "%~dp0"
title Pasang QCI E-Report sebagai aplikasi startup
echo Menyiapkan QCI E-Report sebagai server LAN saat Windows mulai...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_e_report_startup.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo Instalasi startup gagal dengan kode %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
