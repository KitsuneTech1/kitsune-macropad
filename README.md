# SayoPad Remapper

Custom English WebHID configurator for the **SayoDevice 1x3P** 3-key macro pad
(`VID 0x8089`, O3C protocol family). Replaces the flaky Chinese stock tool, writes
bindings to the pad's **onboard flash** so they persist across reboots, and can assign
keys as **F13–F24 AutoHotkey triggers** for arbitrary PC actions.

## Run

Double-click **`start.bat`** (or run `powershell -ExecutionPolicy Bypass -File start.ps1`).
It serves the app on `http://localhost:8770` and opens Edge. WebHID only works in
Chromium browsers (Edge / Chrome / Brave) — not Firefox or Safari.

1. Click **Connect** and pick the SayoDevice in the browser prompt.
2. Each key card shows its current binding.
   - **Click to set** — press the key/combo you want (hold modifiers).
   - **AHK trigger** — assigns the next free F13–F24 (unique keys that won't collide
     with your real keyboard, so AutoHotkey can grab them cleanly).
3. **Save to device** — writes all 3 keys and commits to flash.
4. **Copy AHK script** / **Save pad.ahk** — generates an AutoHotkey v2 file with hotkey
   stubs for any keys set as AHK triggers. Fill in the bodies and keep it running
   (shortcut in `shell:startup` to autostart).

## Does it actually persist? Run the diagnostic.

Some O3C firmware revisions silently reject flash writes. Click **Verify persistence**:
it writes a sentinel (F24) to Key 1, commits, asks you to unplug/replug, then re-reads to
prove whether the write survived a power cycle. Verdict:

- **✓ accepts persistent writes** — on-device remap is reliable, you're done.
- **✗ silently rejects writes** — this unit needs a PC-side remapper instead (see below).

## If the diagnostic fails (✗)

On-device binding can't stick on that firmware. The fallback is a Windows
device-specific remapper using the [Interception](https://github.com/oblitum/Interception)
driver (needed to tell the pad's keys apart from your DREVO keyboard). Not built yet —
ping me and we'll add it.

## Protocol notes

- Report ID 2 (or 33 on newer fw); packet `[cmd, len, ...payload, checksum, pad]`, 63 data bytes.
- checksum = `(reportId + cmd + len + sum(payload)) & 0xFF`.
- `0x00` init (model/fw/support list) · key cmd `0x16` (read pat=0 / write pat=1, 8-byte
  struct: pattern, key#, type, retain, mods, kc1, kc2, kc3) · `0x04` save-to-flash `[0x72,0x96]`.
- Key command and report ID are auto-detected from the init response. Open the **Raw HID
  log** panel to see TX/RX hex for debugging your specific unit.

Files: `index.html` · `styles.css` · `ui.js` · `sayo.js` (protocol) · `start.ps1` / `start.bat`.
