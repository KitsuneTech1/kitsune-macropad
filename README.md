# SayoPad Remapper

Custom English remapper for the **SayoDevice 1x3P** macro pad (`VID 0x8089`). Writes
bindings to the pad's **onboard flash** so they persist across reboots, and can assign
keys as **F13–F24 AutoHotkey triggers** for use in your own scripts.

## Why there's a local agent

Browsers can only talk to USB HID via WebHID, which **Firefox/Safari don't support**.
So a tiny local Python agent (`agent.py`) does the USB I/O and serves the web UI on
`http://localhost:8770`. The browser just calls localhost — so it works in **any
browser, Firefox included**. No WebHID, no Chromium requirement.

## Run

Double-click **`start.bat`** (installs `hidapi` the first time, then launches the agent
and opens your browser at `http://localhost:8770`). Or manually:

```
python -m pip install hidapi
python agent.py
```

1. Click **Connect** — the agent opens the pad and shows the 3 current bindings.
2. Per key:
   - **Click to set** — press the key you want (single key; this analog firmware doesn't
     do on-device modifier combos — use an AHK trigger for those).
   - **AHK trigger** — assigns the next free F13–F24. Catch it in your own AutoHotkey
     script with `F13::`. The app doesn't generate a script; it just makes the button
     send the F-key.
3. **Save to device** — writes all 3 keys and commits to flash.
4. **Verify persistence** — writes a sentinel, has you unplug/replug, and confirms whether
   your firmware actually keeps writes across a power cycle.

## This pad is analog

The 1x3P (fw 0x9a08) is a hall-effect pad. Its key config is a 46-byte structure holding
actuation/calibration data; the tap keycode lives at byte offsets 21 and 27. The agent
reads the whole structure, edits **only** the keycode bytes, and writes it back — so your
actuation settings are never disturbed.

## Files

- `agent.py` — local HID agent (protocol + localhost HTTP/JSON API + static server)
- `index.html` · `styles.css` — UI
- `ui.js` — UI logic · `client.js` — localhost API client · `keymap.js` — keycode tables
- `start.bat` — launcher

## Protocol notes

- Report ID 2; packet `[cmd, len, ...payload, checksum, pad]` (63 data bytes).
- checksum = `(reportId + cmd + len + sum(payload)) & 0xFF`.
- `0x00` init (model/fw/support list) · key cmd `0x16` (read `pat=0` / write `pat=1`) ·
  `0x04` flash save `[0x72, 0x96]`. Open the **Raw HID log** panel to see TX/RX hex.
