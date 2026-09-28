@echo off
setlocal
cd /d "%~dp0"
set "OUTMAX_START_PATH=/hasl/"

where py >nul 2>nul
if not errorlevel 1 (
    py -3 app.py
) else (
    python app.py
)
