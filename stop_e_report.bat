@echo off
setlocal
cd /d "%~dp0"
title Hentikan QCI E-Report

set "TASK_NAME=QCI E-Report"
set "FIREWALL_NAME=QCI E-Report LAN 8090"

schtasks /End /TN "%TASK_NAME%" >nul 2>&1
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1
netsh advfirewall firewall delete rule name="%FIREWALL_NAME%" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=[IO.Path]::GetFullPath('%~dp0').TrimEnd('\'); $pids=Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($id in $pids){$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id); if($p -and $p.CommandLine -match 'server\.js' -and $p.CommandLine -match [regex]::Escape($root)){Stop-Process -Id $id -Force -ErrorAction SilentlyContinue}}"

echo QCI E-Report sudah dihentikan dan startup otomatisnya dilepas.
pause
endlocal
