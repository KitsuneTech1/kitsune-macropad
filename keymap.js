// keymap.js — pure helpers shared by the UI (no device I/O here).

// KeyboardEvent.code -> HID keyboard usage id
export const CODE_TO_HID = (() => {
  const m = {};
  for (let i = 0; i < 26; i++) m['Key' + String.fromCharCode(65 + i)] = 0x04 + i;
  for (let i = 1; i <= 9; i++) m['Digit' + i] = 0x1d + i;
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
  for (let i = 1; i <= 12; i++) m['F' + i] = 0x39 + i;
  for (let i = 13; i <= 24; i++) m['F' + i] = 0x68 + (i - 13);
  for (let i = 1; i <= 9; i++) m['Numpad' + i] = 0x58 + i;
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

// binding = { keycode }  (single HID usage; this analog firmware stores a tap pair)
export function bindingToText(b) {
  if (!b) return '(unreadable)';
  if (!b.keycode) return '(unassigned)';
  return HID_TO_NAME[b.keycode] || ('0x' + b.keycode.toString(16));
}
