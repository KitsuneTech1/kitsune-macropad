@echo off
REM SayoPad Remapper — local HID agent launcher.
REM Works in ANY browser (Firefox included) because the agent does the USB I/O.
setlocal
cd /d "%~dp0"

python -c "import hid" 1>nul 2>nul
if errorlevel 1 (
  echo Installing hidapi ^(one time^)...
  python -m pip install --quiet hidapi
)

echo Starting SayoPad agent on http://localhost:8770 ...
python agent.py
