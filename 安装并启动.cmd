@echo off
cd /d "%~dp0"
where pythonw >nul 2>&1
if not errorlevel 1 (
start "" pythonw "%~dp0setup_launcher.pyw"
exit /b
)
where pyw >nul 2>&1
if not errorlevel 1 (
start "" pyw -3 "%~dp0setup_launcher.pyw"
exit /b
)
python "%~dp0setup_launcher.pyw"
if errorlevel 1 pause
