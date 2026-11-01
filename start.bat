@echo off
REM MacroPad Local - local HID agent launcher.
REM Works in ANY browser (Firefox included) because the agent does the USB I/O.
setlocal
cd /d "%~dp0"

python -c "import hid" 1>nul 2>nul
if errorlevel 1 (
  echo Installing hidapi ^(one time^)...
  python -m pip install --quiet hidapi
  if errorlevel 1 (
    echo Could not install hidapi. Run "python -m pip install hidapi" in a terminal and try again.
    exit /b 1
  )
)

echo Starting MacroPad Local on http://localhost:17890 ...
python agent.py
