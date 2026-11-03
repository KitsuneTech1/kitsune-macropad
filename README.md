<p align="center"><a href="https://kitsunetechnologies.org/work"><img src="https://raw.githubusercontent.com/KitsuneTech1/.github/main/assets/kitsune-banner.svg" alt="Built by Kitsune Technologies" width="760"></a></p>

# MacroPad Local (kitsune-macropad)

> Cross-browser USB HID configuration tool and local bridge agent for the SayoDevice 1x3P macro pad. Configures keys, function assignments (F13-F24), and onboard flash persistence from any browser—Firefox and Safari included.

<p align="center">
  <a href="https://github.com/KitsuneTech1/kitsune-macropad/releases"><img src="https://img.shields.io/github/v/release/KitsuneTech1/kitsune-macropad?style=flat-square&color=blue" alt="Release"></a>
  <a href="https://github.com/KitsuneTech1/kitsune-macropad/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/KitsuneTech1/kitsune-macropad/ci.yml?branch=master&label=CI&style=flat-square" alt="CI Status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License"></a>
  <a href="https://www.python.org/downloads/"><img src="https://img.shields.io/badge/Python-3.8+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python Version"></a>
  <a href="agent.py"><img src="https://img.shields.io/badge/Browsers-Firefox%20%7C%20Chrome%20%7C%20Safari%20%7C%20Edge-success?style=flat-square" alt="Any Browser"></a>
  <a href="agent.py"><img src="https://img.shields.io/badge/Hardware-SayoDevice%201x3P%20(0x8089)-orange?style=flat-square" alt="SayoDevice 1x3P"></a>
</p>

<p align="center">
  <a href="https://github.com/KitsuneTech1/kitsune-macropad/releases/latest"><strong>📦 Download Latest Release ZIP</strong></a> •
  <a href="#-quick-start-noob-friendly"><strong>⚡ Quick Start Guide</strong></a> •
  <a href="#architecture--usb-hid-bridge"><strong>🔌 Hardware Architecture</strong></a>
</p>

---

![MacroPad Local UI](docs/screenshot.png)

## Architecture & USB HID Bridge

Unlike official browser configurators that rely on proprietary WebHID APIs restricted to Chromium, MacroPad Local uses a lightweight local Python background bridge. This decouples hardware USB I/O from the frontend, ensuring compatibility with Firefox, Safari, Chrome, and Edge on Windows, Linux, and macOS.

```mermaid
flowchart LR
    Browser([Browser Web UI: Any Browser]) -->|HTTP REST & JSON| LocalAgent[Local Python HID Agent :17890]
    
    subgraph Host Hardware Boundary
        LocalAgent -->|hidapi USB Endpoint| USB[OS USB Subsystem]
        USB -->|Report Descriptor Read/Write| Device[(SayoDevice 1x3P Hardware VID:0x8089)]
        Device -->|Flash Commit| OnboardMemory[(Onboard EEPROM / Flash)]
    end
```

---

## Features

- **Any Browser Compatible**: Works seamlessly in Firefox, Chrome, Edge, and Safari.
- **Single-Key Remapping**: Click to bind standard keyboard keys (letters, numbers, arrows, numpad, symbols).
- **AutoHotkey (AHK) Integration**: Easily remap keys to extended virtual function keys (`F13` through `F24`) so your own AutoHotkey scripts can intercept them without interfering with standard keys.
- **Onboard Flash Commit**: Saves configurations permanently to device hardware memory.
- **Persistence Verification**: Includes a hardware persistence test that writes sentinel values across USB reconnect cycles to detect counterfeit or read-only firmware.
- **Raw Diagnostic Panel**: Live inspection window shows real-time TX/RX USB HID frames for protocol debugging.

---

## 🚀 Quick Start (Noob-Friendly)

### 1. Download & Launch
1. Download [**MacroPad Local ZIP**](https://github.com/KitsuneTech1/kitsune-macropad/releases/latest) and extract it.
2. Plug your SayoDevice 1x3P macro pad into any USB port.
3. Double-click **`start.bat`** (Windows) or execute `./start.sh` (macOS/Linux).
4. The launcher automatically installs the `hidapi` driver and opens `http://localhost:17890` in your default browser.

### 2. Configure Your Keys
1. Click **Connect** in the browser dashboard.
2. For each of the 3 keys, click **Click to set** and press your desired key, or select **AHK trigger** (F13-F24).
3. Click **Save to device** to commit changes to the onboard memory.

---

## 🧪 Testing & Verification

Run the automated offline unit tests:

```bash
python -m pytest tests
```

Tests cover:
- USB VID/PID device discovery and connection state machines.
- Protocol report serialization and validation.
- Input validation on keycode translation maps.

---

## License

MIT. Copyright (c) 2026 Kitsune Technologies LLC. Full text in [LICENSE](LICENSE).

<p align="center"><sub>Part of <b>Buildtober 2026</b>: 31 open source projects in 31 days. Built by <a href="https://kitsunetechnologies.org/work">Kitsune Technologies</a>. More at <a href="https://github.com/KitsuneTech1">github.com/KitsuneTech1</a>.</sub></p>
