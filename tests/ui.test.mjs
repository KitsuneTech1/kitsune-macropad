import assert from 'node:assert/strict';
import { appendStatusText, setStatusText } from '../ui-utils.js';
import { runPersistenceDiagnostic } from '../diagnostic.js';
import { writeBindingsAndSave } from '../save-logic.js';

class FakeElement {
  constructor() { this.childNodes = []; }
  replaceChildren(...nodes) { this.childNodes = nodes; }
  appendChild(node) { this.childNodes.push(node); }
}

const fakeDocument = {
  createElement() { return { className: '', textContent: '' }; },
  createTextNode(text) { return { textContent: text }; },
};

const status = new FakeElement();
setStatusText(status, '<img src=x onerror=alert(1)>', 'unknown', fakeDocument);
assert.equal(status.childNodes[0].textContent, '<img src=x onerror=alert(1)>');
assert.equal(status.childNodes[0].className, 'info');
appendStatusText(status, 'safe', 'ok', fakeDocument);
assert.equal(status.childNodes[1].textContent, '\n');
assert.equal(status.childNodes[2].textContent, 'safe');

let saveCalls = 0;
const failedDevice = {
  async writeKey(index) { return index === 0; },
  async save() { saveCalls++; return true; },
};
const failed = await writeBindingsAndSave(failedDevice, [{ keycode: 1 }, { keycode: 2 }], 2);
assert.deepEqual(failed, { written: false, saved: false });
assert.equal(saveCalls, 0);

const original = { keycode: 4 };
const calls = [];
let currentKey = original;
const diagnosticDevice = {
  async readKey() { calls.push('read'); return currentKey; },
  async writeKey(_index, binding) { calls.push(['write', binding.keycode]); currentKey = { keycode: binding.keycode }; return true; },
  async save() { calls.push('save'); return true; },
  async reconnect() { calls.push('reconnect'); throw new Error('replug failed'); },
};
await assert.rejects(() => runPersistenceDiagnostic(diagnosticDevice), /replug failed/);
assert.deepEqual(calls, ['read', ['write', 0x73], 'save', 'read', 'reconnect', ['write', 4], 'save']);

console.log('ui and workflow tests passed');
