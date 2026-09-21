@echo off
cd /d "%~dp0"
python --version >nul 2>&1
if errorlevel 1 (
echo Please install Python 3.11 or newer from https://www.python.org/downloads/ and enable Add Python to PATH.
pause
exit /b 1
)
if not exist .venv\Scripts\python.exe python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
pause
exit /b 1
)
.venv\Scripts\python.exe launch.py
