@echo off
REM Lab Scan KTM - backup terjadwal (dipakai Task Scheduler).
REM Pemakaian: backup.bat --keep=30
REM Hasil dan error dicatat ke logs\backup.log agar bisa diperiksa.
setlocal
cd /d "%~dp0"

if not exist "logs" mkdir "logs"

echo [%date% %time%] backup terjadwal mulai >> "logs\backup.log"
node scripts\backup.js %* >> "logs\backup.log" 2>&1
echo [%date% %time%] selesai (kode %errorlevel%) >> "logs\backup.log"
exit /b %errorlevel%
