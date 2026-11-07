@echo off
cd /d "%~dp0"

where pythonw >nul 2>nul
if %errorlevel%==0 (
  start "" pythonw "%~dp0app.py"
  exit /b
)

where pyw >nul 2>nul
if %errorlevel%==0 (
  start "" pyw -3 "%~dp0app.py"
  exit /b
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" python "%~dp0app.py"
  exit /b
)

echo Python 3.8+ not found. Install Python and add it to PATH.
pause
