// sayo.js — SayoDevice O3C-family WebHID protocol layer
// Talks to the vendor collection of a SayoDevice (VID 0x8089).
// Packet on the wire: [cmd, data_len, ...payload, checksum, ...zero-pad] (63 data bytes).
// checksum = (reportId + cmd + data_len + sum(payload)) & 0xFF, at offset 2 + data_len.

export const VENDOR_ID = 0x8089;
const PACKET_LEN = 63;            // bytes excluding the report-id byte
const RESP_TIMEOUT_MS = 1500;

// Commands
const CMD_INIT = 0x00;
const CMD_SAVE = 0x04;
// Candidate key-config commands; the real one is auto-detected from the INIT support list.
const KEY_CMD_CANDIDATES = [0x16, 0x06, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d,
                            0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23];

// HID usage <-> KeyboardEvent.code tables ------------------------------------
// code -> HID keyboard usage id
export const CODE_TO_HID = (() => {
  const m = {};
  for (let i = 0; i < 26; i++) m['Key' + String.fromCharCode(65 + i)] = 0x04 + i; // A-Z
  for (let i = 1; i <= 9; i++) m['Digit' + i] = 0x1d + i;                          // 1-9 -> 0x1e..0x26
  m['Digit0'] = 0x27;
  Object.assign(m, {
    Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c,
    Minus: 0x2d, Equal: 0x2e, BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31,
    Semicolon: 0x33, Quote: 0x34, Backquote: 0x35, Comma: 0x36, Period: 0x37, Slash: 0x38,
    CapsLock: 0x39,
    PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48, Insert: 0x49, Home: 0x4a,
    PageUp: 0x4b, Delete: 0x4c, End: 0x4d, PageDown: 0x4e,
    ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52,
    NumLock: 0x53, NumpadDivide: 0x54, NumpadMultiply: 0x55, NumpadSubtract: 0x56,
    NumpadAdd: 0x57, NumpadEnter: 0x58, NumpadDecimal: 0x63,
  });
  for (let i = 1; i <= 12; i++) m['F' + i] = 0x39 + i;          // F1-F12 -> 0x3a..0x45
  for (let i = 13; i <= 24; i++) m['F' + i] = 0x68 + (i - 13);  // F13-F24 -> 0x68..0x73
  for (let i = 1; i <= 9; i++) m['Numpad' + i] = 0x58 + i;      // Numpad1-9 -> 0x59..0x61
  m['Numpad0'] = 0x62;
  return m;
})();

export const HID_TO_NAME = (() => {
  const m = {};
  for (let i = 0; i < 26; i++) m[0x04 + i] = String.fromCharCode(65 + i);
  for (let i = 1; i <= 9; i++) m[0x1d + i] = String(i);
  m[0x27] = '0';
  Object.assign(m, {
    0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space',
    0x2d: '-', 0x2e: '=', 0x2f: '[', 0x30: ']', 0x31: '\\', 0x33: ';', 0x34: "'",
    0x35: '`', 0x36: ',', 0x37: '.', 0x38: '/', 0x39: 'CapsLock',
    0x46: 'PrtSc', 0x47: 'ScrLk', 0x48: 'Pause', 0x49: 'Insert', 0x4a: 'Home',
    0x4b: 'PgUp', 0x4c: 'Delete', 0x4d: 'End', 0x4e: 'PgDn',
    0x4f: 'Right', 0x50: 'Left', 0x51: 'Down', 0x52: 'Up',
    0x53: 'NumLock', 0x54: 'Num/', 0x55: 'Num*', 0x56: 'Num-', 0x57: 'Num+',
    0x58: 'NumEnter', 0x62: 'Num0', 0x63: 'Num.',
  });
  for (let i = 1; i <= 12; i++) m[0x39 + i] = 'F' + i;
  for (let i = 13; i <= 24; i++) m[0x68 + (i - 13)] = 'F' + i;
  for (let i = 1; i <= 9; i++) m[0x58 + i] = 'Num' + i;
  return m;
})();

const MOD_BITS = [
  ['ControlLeft', 0x01], ['ShiftLeft', 0x02], ['AltLeft', 0x04], ['MetaLeft', 0x08],
  ['ControlRight', 0x10], ['ShiftRight', 0x20], ['AltRight', 0x40], ['MetaRight', 0x80],
];
const MOD_NAMES = [
  [0x01, 'Ctrl'], [0x02, 'Shift'], [0x04, 'Alt'], [0x08, 'Win'],
  [0x10, 'RCtrl'], [0x20, 'RShift'], [0x40, 'RAlt'], [0x80, 'RWin'],
];

export function modsFromEvent(e) {
  let m = 0;
  if (e.ctrlKey) m |= 0x01;
  if (e.shiftKey) m |= 0x02;
  if (e.altKey) m |= 0x04;
  if (e.metaKey) m |= 0x08;
  return m;
}

// A binding is { mods: uint8, keys: [uint8, uint8, uint8] (kc1..kc3) }
export function bindingToText(b) {
  if (!b) return '(unreadable)';
  const parts = [];
  for (const [bit, name] of MOD_NAMES) if (b.mods & bit) parts.push(name);
  for (const kc of b.keys) if (kc) parts.push(HID_TO_NAME[kc] || ('0x' + kc.toString(16)));
  return parts.length ? parts.join(' + ') : '(unassigned)';
}

export const hex = (arr) => Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join(' ');

// ---------------------------------------------------------------------------
export class SayoDevice {
  constructor(log = () => {}) {
    this.dev = null;
    this.reportId = 2;
    this.keyCmd = 0x16;
    this.model = null;
    this.version = null;
    this._log = log;
    this._waiters = [];
    this._onInput = this._onInput.bind(this);
  }

  async request() {
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: VENDOR_ID }],
    });
    if (!devices.length) throw new Error('No device selected.');
    // Prefer a collection that exposes a vendor usage page (0xFF00 / 0xFF11).
    this.dev = devices.find((d) =>
      d.collections.some((c) => c.usagePage >= 0xff00)) || devices[0];
    return this.dev;
  }

  async open() {
    if (!this.dev) throw new Error('No device. Call request() first.');
    if (!this.dev.opened) await this.dev.open();
    this.dev.addEventListener('inputreport', this._onInput);
    // Pick a report id offered by a vendor collection, else default to 2.
    for (const c of this.dev.collections) {
      if (c.usagePage >= 0xff00 && c.outputReports?.length) {
        this.reportId = c.outputReports[0].reportId ?? this.reportId;
        break;
      }
    }
    this._log('open', `report id ${this.reportId}`);
    await this._detect();
  }

  // Re-acquire the device after an unplug/replug. Permission persists for the
  // origin, so getDevices() returns it without a new prompt.
  async reconnect(timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const devs = await navigator.hid.getDevices();
      const d = devs.find((x) => x.vendorId === VENDOR_ID &&
        x.collections.some((c) => c.usagePage >= 0xff00)) ||
        devs.find((x) => x.vendorId === VENDOR_ID);
      if (d) {
        this.dev = d;
        await this.open();
        return true;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('Device did not reappear after replug.');
  }

  async close() {
    if (this.dev?.opened) {
      this.dev.removeEventListener('inputreport', this._onInput);
      await this.dev.close();
    }
  }

  _onInput(e) {
    const data = new Uint8Array(e.data.buffer);
    this._log('rx', `rid ${e.reportId}: ${hex(data.slice(0, 12))}`);
    const w = this._waiters.shift();
    if (w) { clearTimeout(w.timer); w.resolve({ reportId: e.reportId, data }); }
  }

  _checksum(cmd, len, payload) {
    let s = (this.reportId + cmd + len) & 0xff;
    for (const b of payload) s = (s + b) & 0xff;
    return s & 0xff;
  }

  async _send(cmd, payload = []) {
    const buf = new Uint8Array(PACKET_LEN);
    buf[0] = cmd;
    buf[1] = payload.length;
    for (let i = 0; i < payload.length; i++) buf[2 + i] = payload[i];
    buf[2 + payload.length] = this._checksum(cmd, payload.length, payload);
    this._log('tx', `rid ${this.reportId} cmd 0x${cmd.toString(16)}: ${hex(buf.slice(0, 12))}`);
    const resp = this._await();
    await this.dev.sendReport(this.reportId, buf);
    return resp;
  }

  _await() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this._waiters.findIndex((w) => w.timer === timer);
        if (i >= 0) this._waiters.splice(i, 1);
        reject(new Error('Device did not respond (timeout).'));
      }, RESP_TIMEOUT_MS);
      this._waiters.push({ resolve, reject, timer });
    });
  }

  async _detect() {
    // INIT: send date/time; response carries version, model and supported-command list.
    const now = new Date();
    const payload = [now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()];
    try {
      const { data } = await this._send(CMD_INIT, payload);
      this.version = (data[3] << 8) | data[2];
      this.model = (data[5] << 8) | data[4];
      const len = data[1];
      const support = Array.from(data.slice(8, 2 + len));
      const found = KEY_CMD_CANDIDATES.find((c) => support.includes(c));
      if (found) this.keyCmd = found;
      this._log('init', `model 0x${(this.model||0).toString(16)} ver 0x${(this.version||0).toString(16)} keyCmd 0x${this.keyCmd.toString(16)} support [${support.map((c)=>c.toString(16)).join(',')}]`);
    } catch (e) {
      this._log('init', 'no INIT response; using defaults (keyCmd 0x16, rid ' + this.reportId + ')');
    }
  }

  // Read one key -> { type, mods, keys:[kc1,kc2,kc3] } or null if unreadable.
  async readKey(index) {
    const { data } = await this._send(this.keyCmd, [0, index]);
    if (data[0] !== 0x00 || data[1] < 8) return null;
    // response payload (after cmd,len): type, retain, plain_0(mods), plain_1..3
    const type = data[2];
    const mods = data[4];
    const keys = [data[5], data[6], data[7]];
    return { type, mods, keys };
  }

  // Write one key. Pass the `type` byte read back from readKey to preserve firmware state.
  async writeKey(index, { type = 0, mods = 0, keys = [0, 0, 0] }) {
    const payload = [1, index, type, 0, mods, keys[0] || 0, keys[1] || 0, keys[2] || 0];
    const { data } = await this._send(this.keyCmd, payload);
    return data[0] === 0x00;
  }

  async save() {
    const savedRid = this.reportId;
    this.reportId = 2; // flash-save is documented on report id 2
    try {
      const { data } = await this._send(CMD_SAVE, [0x72, 0x96]);
      return data[0] === 0x00;
    } finally {
      this.reportId = savedRid;
    }
  }
}
