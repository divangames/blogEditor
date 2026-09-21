@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -m pip install -r requirements.txt
if errorlevel 1 goto failed
python app.py
goto end
:failed
echo Не удалось установить зависимости. Проверьте установку Python.
:end
pause
