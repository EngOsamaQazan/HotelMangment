@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================
echo   Migrate remote database to local PostgreSQL
echo   (This requires an open SSH tunnel - see script header)
echo   Requesting Administrator elevation...
echo ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File','%~dp0scripts\migrate-db-to-local.ps1' -Verb RunAs"
