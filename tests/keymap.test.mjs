import assert from 'node:assert/strict';
import { CODE_TO_HID, HID_TO_NAME, bindingToText } from '../keymap.js';

assert.equal(CODE_TO_HID.KeyA, 0x04);
assert.equal(CODE_TO_HID.Digit0, 0x27);
assert.equal(CODE_TO_HID.Space, 0x2c);
assert.equal(CODE_TO_HID.F24, 0x73);
assert.equal(CODE_TO_HID.Numpad0, 0x62);

assert.equal(HID_TO_NAME[0x68], 'F13');
assert.equal(bindingToText({ keycode: 0 }), '(unassigned)');
assert.equal(bindingToText({ keycode: 0x2c }), 'Space');
assert.equal(bindingToText({ keycode: 0x7f }), '0x7f');
assert.equal(bindingToText({ keycode: '<img src=x onerror=alert(1)>' }), '(invalid)');
assert.equal(bindingToText({ keycode: 256 }), '(invalid)');

console.log('keymap tests passed');
