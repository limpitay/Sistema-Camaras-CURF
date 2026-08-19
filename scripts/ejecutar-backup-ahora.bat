@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-datos.ps1"
echo.
pause
