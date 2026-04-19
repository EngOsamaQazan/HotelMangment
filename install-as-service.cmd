@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================
echo   Register hotel-app as auto-start (hidden)
echo   Uses Windows Task Scheduler - no PM2 needed
echo   Requesting Administrator elevation...
echo ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File','%~dp0scripts\setup-autostart.ps1' -Verb RunAs"
