@echo off
cd /d "%~dp0"
echo ===============================================
echo QCI E-REPORT - SYSTEM CHECK
echo ===============================================
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js belum terpasang atau belum ada di PATH.
  goto end
)
node --version
node -e "const major=Number(process.versions.node.split('.')[0]); process.exit(major >= 18 ? 0 : 1)"
if errorlevel 1 (
  echo ERROR: Node.js 18 atau lebih baru diperlukan.
  goto end
)
if exist node_modules\exceljs\package.json (echo Dependency exceljs: OK) else (echo Dependency exceljs: ERROR - jalankan npm install)
if exist public\index.html (echo Web App: OK) else (echo Web App: ERROR)
if exist server.js (echo Server: OK) else (echo Server: ERROR)
echo.
echo Port lokal/LAN: 8090
echo QCI PM v1.3 dapat tetap berjalan di port 8787 pada PC yang sama.
echo Pemeriksaan selesai.
:end
pause
