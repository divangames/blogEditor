@echo off
rem Запускает отдельный редактор email-рассылок OUTMAX.
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
    set "PY=py -3"
) else (
    set "PY=python"
)
%PY% -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/email/', timeout=2)" >nul 2>nul
if not errorlevel 1 (
    start "" "http://127.0.0.1:8765/email/"
    exit /b 0
)
%PY% -m pip install -r requirements.txt
if errorlevel 1 (
    pause
    exit /b 1
)
set "OUTMAX_START_PATH=/email/"
%PY% app.py
