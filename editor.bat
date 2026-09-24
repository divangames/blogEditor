@echo off
setlocal
cd /d "%~dp0"
set "GIT_CONFIG_COUNT=1"
set "GIT_CONFIG_KEY_0=safe.directory"
set "GIT_CONFIG_VALUE_0=%CD:\=/%"

where py >nul 2>nul
if not errorlevel 1 (
    set "PY=py -3"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo Python 3 was not found. Install Python and try again.
        pause
        exit /b 1
    )
    set "PY=python"
)

echo.
echo ========================================
echo       OUTMAX ARTICLE EDITOR
echo ========================================
echo 1. Start editor
echo 2. Commit and push to GitHub
echo 3. Update GitHub Pages
echo 4. Do everything ^(push + update VPS + Pages^)
echo 5. Prepare STATIC folder and ZIP for own server
echo 6. Prepare FULL editor for VPS / Docker
echo 7. Prepare FULL editor for Python hosting
echo 8. Prepare BOTH full editor packages
echo 9. Update live VPS editor
echo 0. Exit
echo.
choice /c 1234567890 /n /m "Select [1/2/3/4/5/6/7/8/9/0]: "
if errorlevel 10 exit /b 0
if errorlevel 9 goto vps
if errorlevel 8 goto fullboth
if errorlevel 7 goto fullpython
if errorlevel 6 goto fulldocker
if errorlevel 5 goto server
if errorlevel 4 goto all
if errorlevel 3 goto pages
if errorlevel 2 goto deploy
if errorlevel 1 goto launch

:launch
%PY% -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/', timeout=2)" >nul 2>nul
if not errorlevel 1 (
    echo Editor is already running. Opening browser...
    start "" "http://127.0.0.1:8765/"
    exit /b 0
)
%PY% -m pip install -r requirements.txt
if errorlevel 1 goto failed
echo Starting editor at http://127.0.0.1:8765/
%PY% app.py
exit /b %errorlevel%

:deploy
%PY% deploy.py
if errorlevel 1 goto failed
pause
exit /b 0

:pages
%PY% pages.py
if errorlevel 1 goto failed
pause
exit /b 0

:all
%PY% deploy.py
if errorlevel 1 goto failed
%PY% deploy_vps.py
if errorlevel 1 goto failed
%PY% pages.py
if errorlevel 1 goto failed
pause
exit /b 0

:server
%PY% prepare_server_deploy.py
if errorlevel 1 goto failed
pause
exit /b 0

:fulldocker
%PY% prepare_full_deploy.py docker
if errorlevel 1 goto failed
pause
exit /b 0

:fullpython
%PY% prepare_full_deploy.py python
if errorlevel 1 goto failed
pause
exit /b 0

:fullboth
%PY% prepare_full_deploy.py both
if errorlevel 1 goto failed
pause
exit /b 0

:vps
%PY% deploy_vps.py
if errorlevel 1 goto failed
pause
exit /b 0

:failed
echo The operation failed. See the error above.
pause
exit /b 1
