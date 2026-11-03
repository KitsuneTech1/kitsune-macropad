#!/usr/bin/env bash
echo "========================================================"
echo "  MacroPad Local (kitsune-macropad)"
echo "  Kitsune Technologies LLC"
echo "========================================================"
echo ""

if ! command -v python3 >/dev/null 2>&1; then
    echo "[ERROR] Python 3 was not found on your system."
    echo "Please install Python 3.10+ from https://python.org/"
    exit 1
fi

python3 -c "import hid" >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Installing hidapi..."
    python3 -m pip install hidapi
fi

echo "Starting MacroPad agent on http://localhost:17890 ..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:17890 &
elif command -v open >/dev/null 2>&1; then
    open http://localhost:17890 &
fi

python3 agent.py
