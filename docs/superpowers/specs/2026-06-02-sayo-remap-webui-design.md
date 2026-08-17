# SayoDevice 1x3P Custom Remap WebUI — Design

**Date:** 2026-06-02
**Project dir:** repository root

## Problem

Moo has a SayoDevice 1x3P 3-key macro pad (`VID 0x8089 / PID 0x000C`, O3C protocol
family). The stock config tool (pcsayo.com / web.sayodevice.com) is in Chinese, works
poorly, and remaps **do not persist across reboots**. Goal: a custom, English, reliable
WebUI to remap the 3 keys, with bindings stored on the device so they persist — plus an
AutoHotkey bridge mode so the buttons can trigger arbitrary PC actions.

## Root-cause hypothesis

SayoDevice stores key config in onboard flash. Persistence requires sending the
**flash-commit command (`0x04`)** after writing bindings. The stock tool likely never
commits, or the unit's firmware silently rejects flash writes (a known O3C firmware quirk).
The build's first deliverable is a **diagnostic that determines which** before investing in
polish.

## Protocol (from open-source Sayobot/sayo-device-web-hid + RE notes)

- WebHID, vendor collection, **Report ID `0x02`**, 64-byte wire packets.
- Packet layout: `[cmd, data_len, ...payload, checksum, ...zero-pad]`.
- Checksum = `(report_id + cmd + data_len + sum(payload)) & 0xFF`, placed at offset
  `2 + data_len`.
- **cmd `0x16`** — key config. Read with `pattern=0`, write with `pattern=1`.
- **cmd `0x04`** — save to flash, payload `[0x72, 0x96]`.
- **cmd `0x00`** — init (send date/time as 4 bytes); sent on connect if required.
- Exact key-binding byte encoding will be **ported from the official open-source repo**
  (`Sayobot/sayo-device-web-hid`) rather than guessed, to avoid encoding errors.

## Architecture

Single-file static WebUI + tiny localhost launcher. No build step, no npm, no background
service. Three layers:

1. **`sayo.js`** — protocol layer. `connect()` (WebHID `requestDevice` filtered to VID
   `0x8089`, vendor usage page), `buildPacket(cmd, payload)`, `sendReport`/`readReport`,
   `readKeyConfig()`, `writeKey(index, binding)`, `saveToFlash()`, plus
   encode/decode helpers between human-readable bindings and the device byte format.
2. **`index.html` + `ui.js` + styles** — the configurator UI (below).
3. **`start.ps1`** — serves the folder on `http://localhost:<port>` (WebHID needs a secure
   context; localhost qualifies) and opens Edge. A `start.bat` wrapper for double-click.

WebHID is Chromium-only (Edge/Chrome/Brave) and requires a user gesture to connect — the UI
opens with a single **Connect** button.

## UI

- **Header:** device name + firmware revision (read on connect).
- **3 key cards** matching physical layout. Each card shows:
  - Current binding, decoded (e.g. `Ctrl+C`, `F13`, `Volume Up`).
  - **"Click to set"** → captures next keypress in-browser (modifiers + key), or a
    dropdown for keys that can't be typed (media/consumer keys, mouse buttons).
  - **"Assign as AHK trigger"** → sets the key to the next free `F13`–`F24` keycode.
- **Binding types supported in v1:** single key, modifier combo, media/consumer key, and
  the F13–F24 AHK-trigger keys. *No multi-step macro sequences in v1 (YAGNI).*
- **Footer actions:**
  - **Save to device** — writes all 3 keys (cmd `0x16` write) then commits (cmd `0x04`).
    Honest per-step status line.
  - **Verify Persistence** — the diagnostic (below).
  - **Copy AHK script** — generates an AutoHotkey v2 file with `F13::`/`F14::`/`F15::`
    hotkey stubs for the keys assigned as AHK triggers; **Save pad.ahk** writes it to disk.

## Verify Persistence diagnostic

Self-contained test, prints a verdict:

1. Read key-1 binding, remember it.
2. Write a sentinel binding (e.g. `F24`) + flash-save.
3. Read back immediately → confirms the write path works at all.
4. Prompt user to unplug/replug, then re-read → confirms it survived a power cycle.
5. Restore the original key-1 binding + save.
6. Print verdict:
   - **"Firmware accepts persistent writes ✓"** → on-device remap is the solution.
   - **"Firmware silently rejects flash writes ✗"** → pivot to PC-side fallback.

## AHK bridge

The pad persistently emits an `F13`–`F24` keycode (survives reboot, works on any PC). The
generated `pad.ahk` (AutoHotkey v2) maps those to arbitrary actions; the user fills in the
stub bodies. AHK autostart (Startup folder) persists on this PC. This combines an on-device
persistent trigger with flexible PC-side actions.

## Fallback (only if diagnostic returns ✗)

If the firmware rejects flash writes, on-device remap can't stick. Fallback is a Windows
device-specific remapper, which requires the Interception driver to distinguish the pad from
the DREVO keyboard. **Out of scope for v1** — we build it only if the diagnostic proves it's
needed.

## Testing

- Protocol layer: unit-test `buildPacket` checksum/layout and binding encode/decode against
  known-good byte vectors from the official repo.
- End-to-end: manual via the Verify Persistence diagnostic on the real device.

## Out of scope (v1)

- Multi-step macro sequences.
- RGB/LED control.
- Knob/encoder config (1x3P has no knob).
- PC-side Interception fallback (build only if diagnostic fails).
