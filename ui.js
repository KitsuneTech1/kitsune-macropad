// ui.js - wiring for the SayoPad Remapper (talks to the local HID agent)
import { CODE_TO_HID, HID_TO_NAME, bindingToText } from './keymap.js';
import { AgentClient, agentAlive } from './client.js';

const NKEYS = 3;
const $ = (id) => document.getElementById(id);
const logEl = $('log');
const statusEl = $('status');

const log = (tag, msg) => { logEl.textContent += `[${tag}] ${msg}\n`; logEl.scrollTop = logEl.scrollHeight; };
const setStatus = (msg, cls = 'info') => { statusEl.innerHTML = `<span class="${cls}">${msg}</span>`; };
const append = (msg, cls = 'info') => { statusEl.innerHTML += `\n<span class="${cls}">${msg}</span>`; };

let dev = null;
let bindings = new Array(NKEYS).fill(null);

$('connect').addEventListener('click', connect);
$('save').addEventListener('click', saveAll);
$('verify').addEventListener('click', verifyPersistence);

// Check the agent is running before anything else.
(async () => {
  if (!(await agentAlive())) {
    $('unsupported').classList.remove('hidden');
    $('connect').disabled = true;
  }
})();

async function pullServerLog() {
  if (!dev) return;
  const lines = await dev.serverLog();
  logEl.textContent = lines.join('\n') + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

async function connect() {
  try {
    dev = new AgentClient();
    setStatus('Connecting to pad…', 'info');
    await dev.connect();
    const id = dev.model ? `model 0x${dev.model.toString(16)} · fw 0x${(dev.version || 0).toString(16)}` : 'connected';
    $('devinfo').textContent = `${dev.name || 'SayoDevice'} - ${id}`;
    $('hint').classList.remove('hidden');
    $('keys').classList.remove('hidden');
    $('actions').classList.remove('hidden');
    await readAll();
    await pullServerLog();
    setStatus('Connected. Click a key to rebind it.', 'ok');
  } catch (e) {
    setStatus('Connect failed: ' + e.message, 'err');
    log('error', e.message);
  }
}

async function readAll() {
  try {
    bindings = await dev.readAll();
  } catch (e) {
    bindings = new Array(NKEYS).fill(null);
    log('error', 'readAll: ' + e.message);
  }
  renderKeys();
}

function renderKeys() {
  const sec = $('keys');
  sec.innerHTML = '';
  for (let i = 0; i < NKEYS; i++) {
    const b = bindings[i];
    const txt = b ? bindingToText(b) : '(unreadable)';
    const empty = !b || !b.keycode;
    const card = document.createElement('div');
    card.className = 'keycard';
    card.innerHTML = `
      <h3>Key ${i + 1}</h3>
      <div class="binding ${empty ? 'empty' : ''}">${txt}</div>
      <div class="row">
        <button class="btn small" data-set="${i}" title="Make this button type a real key or combo (e.g. Ctrl+C). No extra software.">Click to set</button>
        <button class="btn small" data-ahk="${i}" title="Send a unique F-key (F13-F24) you can catch in your own AutoHotkey script.">AHK trigger</button>
      </div>`;
    sec.appendChild(card);
  }
  sec.querySelectorAll('[data-set]').forEach((el) => el.addEventListener('click', () => captureKey(+el.dataset.set)));
  sec.querySelectorAll('[data-ahk]').forEach((el) => el.addEventListener('click', () => assignAhk(+el.dataset.ahk)));
}

// --- key capture dialog -----------------------------------------------------
let captureResult = null;
function captureKey(index) {
  const dlg = $('capture');
  captureResult = null;
  $('capturedText').textContent = '…';
  $('captureOk').disabled = true;

  const onKey = (e) => {
    e.preventDefault();
    const hid = CODE_TO_HID[e.code];
    if (!hid) { $('capturedText').textContent = `${e.code} (unsupported)`; return; }
    const combo = e.ctrlKey || e.shiftKey || e.altKey || e.metaKey;
    captureResult = { keycode: hid };
    $('capturedText').textContent = bindingToText(captureResult) +
      (combo ? '  (modifier ignored, use AHK trigger for combos)' : '');
    $('captureOk').disabled = false;
  };
  document.addEventListener('keydown', onKey, true);

  const cleanup = () => { document.removeEventListener('keydown', onKey, true); dlg.close(); };
  $('captureOk').onclick = () => { if (captureResult) { bindings[index] = captureResult; renderKeys(); } cleanup(); };
  $('captureCancel').onclick = cleanup;
  dlg.showModal();
}

function assignAhk(index) {
  const used = new Set();
  bindings.forEach((b) => { if (b && b.keycode >= 0x68 && b.keycode <= 0x73) used.add(b.keycode); });
  let hid = 0x68;
  while (used.has(hid) && hid <= 0x73) hid++;
  if (hid > 0x73) { setStatus('All F13-F24 triggers are in use.', 'err'); return; }
  bindings[index] = { keycode: hid };
  renderKeys();
  setStatus(`Key ${index + 1} now sends ${HID_TO_NAME[hid]}. Click "Save to device", then use ${HID_TO_NAME[hid]}:: in your AutoHotkey script.`, 'info');
}

// --- save -------------------------------------------------------------------
async function saveAll() {
  if (!dev) return;
  setStatus('Writing keys…', 'info');
  try {
    for (let i = 0; i < NKEYS; i++) {
      const b = bindings[i] || { keycode: 0 };
      const ok = await dev.writeKey(i, b);
      append(`Key ${i + 1}: ${ok ? 'written' : 'write NAK'}`, ok ? 'ok' : 'err');
    }
    const saved = await dev.save();
    append(saved ? 'Committed to flash ✓' : 'Flash commit returned NAK ✗', saved ? 'ok' : 'err');
  } catch (e) {
    append('Save failed: ' + e.message, 'err');
  } finally {
    await pullServerLog();
  }
}

// --- persistence diagnostic -------------------------------------------------
async function verifyPersistence() {
  if (!dev) return;
  const SENTINEL = 0x73; // F24
  setStatus('Diagnostic: reading current Key 1…', 'info');
  try {
    const original = await dev.readKey(0);
    if (!original) throw new Error('cannot read Key 1');

    append('Writing sentinel F24 + flash save…');
    await dev.writeKey(0, { keycode: SENTINEL });
    const savedOk = await dev.save();
    if (!savedOk) { append('Flash commit NAK, firmware likely rejects writes ✗', 'err'); return; }

    const immediate = await dev.readKey(0);
    const wroteOk = immediate && immediate.keycode === SENTINEL;
    append(`Immediate read-back: ${wroteOk ? 'F24 present ✓' : 'sentinel NOT present ✗'}`, wroteOk ? 'ok' : 'err');
    if (!wroteOk) { await restore(original); return; }

    append('Now UNPLUG the pad, wait 2s, and PLUG IT BACK IN. Waiting…', 'info');
    await dev.reconnect();
    append('Reconnected. Re-reading Key 1…', 'info');

    const after = await dev.readKey(0);
    const persisted = after && after.keycode === SENTINEL;
    if (persisted) append('VERDICT: firmware accepts persistent writes ✓. On-device remap is reliable.', 'ok');
    else append('VERDICT: firmware silently rejects flash writes ✗. Bindings will not survive reboot on this unit.', 'err');

    await restore(original);
    await readAll();
  } catch (e) {
    append('Diagnostic error: ' + e.message, 'err');
  } finally {
    await pullServerLog();
  }
}

async function restore(original) {
  try {
    await dev.writeKey(0, original);
    await dev.save();
    append('Original Key 1 binding restored.', 'info');
  } catch (e) { append('Could not restore Key 1: ' + e.message, 'err'); }
}
