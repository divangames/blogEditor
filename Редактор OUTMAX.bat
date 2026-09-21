@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
    set "PY=py -3"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo Python не найден. Установите Python 3 и запустите батник снова.
        pause
        exit /b 1
    )
    set "PY=python"
)

:menu
cls
echo ========================================
echo       РЕДАКТОР СТАТЕЙ OUTMAX
echo ========================================
echo.
echo 1. Запустить редактор
echo 2. Деплой в GitHub
echo 0. Выход
echo.
choice /c 120 /n /m "Выберите пункт [1/2/0]: "
if errorlevel 3 exit /b 0
if errorlevel 2 goto deploy
if errorlevel 1 goto launch

:launch
%PY% -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/', timeout=2)" >nul 2>nul
if not errorlevel 1 (
    echo Редактор уже запущен. Открываю браузер...
    start "" "http://127.0.0.1:8765/"
    goto done
)
%PY% -m pip install -r requirements.txt
if errorlevel 1 goto failed
echo.
echo Редактор запускается по адресу http://127.0.0.1:8765/
%PY% app.py
goto done

:deploy
%PY% deploy.py
if errorlevel 1 goto failed
goto done

:failed
echo.
echo Операция не выполнена. Подробности показаны выше.

:done
echo.
pause
goto menu
