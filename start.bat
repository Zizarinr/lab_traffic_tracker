@echo off
REM Lab Scan KTM - entry deployment (dipakai Task Scheduler & shortcut).
REM Output server dicatat ke logs\server.log agar bisa diperiksa setelah jalan tersembunyi.
setlocal
cd /d "%~dp0"

if not exist "logs" mkdir "logs"

where node >nul 2>nul
if errorlevel 1 (
    echo [%date% %time%] GAGAL: node tidak ditemukan di PATH >> "logs\server.log"
    exit /b 1
)

echo [%date% %time%] memulai server >> "logs\server.log"
node server.js >> "logs\server.log" 2>&1
echo [%date% %time%] server berhenti (kode %errorlevel%) >> "logs\server.log"
exit /b %errorlevel%
