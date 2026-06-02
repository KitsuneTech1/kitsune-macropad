// ui.js — wiring for the SayoPad Remapper
import { SayoDevice, CODE_TO_HID, HID_TO_NAME, bindingToText, modsFromEvent } from './sayo.js';

const NKEYS = 3;
const $ = (id) => document.getElementById(id);
const logEl = $('log');
const statusEl = $('status');

const log = (tag, msg) => {
  logEl.textContent += `[${tag}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};
const setStatus = (msg, cls = 'info') => { statusEl.innerHTML = `<span class="${cls}">${msg}</span>`; };
const append = (msg, cls = 'info') => { statusEl.innerHTML += `\n<span class="${cls}">${msg}</span>`; };

let dev = null;
let bindings = new Array(NKEYS).fill(null); // {type, mods, keys:[..]}

if (!('hid' in navigator)) {
  $('unsupported').classList.remove('hidden');
  $('connect').disabled = true;
}

$('connect').addEventListener('click', connect);
$('save').addEventListener('click', saveAll);
$('verify').addEventListener('click', verifyPersistence);

async function connect() {
  try {
    dev = new SayoDevice(log);
    await dev.request();
    await dev.open();
    const id = dev.model ? `model 0x${dev.model.toString(16)} · fw 0x${(dev.version||0).toString(16)}` : 'connected';
    $('devinfo').textContent = `${dev.dev.productName || 'SayoDevice'} — ${id}`;
    $('hint').classList.remove('hidden');
    $('keys').classList.remove('hidden');
    $('actions').classList.remove('hidden');
    await readAll();
    setStatus('Connected. Click a key to rebind it.', 'ok');
  } catch (e) {
    setStatus('Connect failed: ' + e.message, 'err');
    log('error', e.message);
  }
}

async function readAll() {
  for (let i = 0; i < NKEYS; i++) {
    try { bindings[i] = await dev.readKey(i); }
    catch (e) { bindings[i] = null; log('error', `read key ${i}: ${e.message}`); }
  }
  renderKeys();
}

function renderKeys() {
  const sec = $('keys');
  sec.innerHTML = '';
  for (let i = 0; i < NKEYS; i++) {
    const b = bindings[i];
    const txt = b ? bindingToText(b) : '(unreadable)';
    const empty = !b || (!b.mods && !b.keys.some((k) => k));
    const card = document.createElement('div');
    card.className = 'keycard';
    card.innerHTML = `
      <h3>Key ${i + 1}</h3>
      <div class="binding ${empty ? 'empty' : ''}">${txt}</div>
      <div class="row">
        <button class="btn small" data-set="${i}" title="Make this button type a real key or combo (e.g. Ctrl+C). No extra software.">Click to set</button>
        <button class="btn small" data-ahk="${i}" title="Send a hidden F-key that AutoHotkey turns into any action you want.">AHK trigger</button>
      </div>`;
    sec.appendChild(card);
  }
  sec.querySelectorAll('[data-set]').forEach((el) =>
    el.addEventListener('click', () => captureKey(+el.dataset.set)));
  sec.querySelectorAll('[data-ahk]').forEach((el) =>
    el.addEventListener('click', () => assignAhk(+el.dataset.ahk)));
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
    const mods = modsFromEvent(e);
    if (!hid) { $('capturedText').textContent = `${e.code} (unsupported)`; return; }
    captureResult = { type: bindings[index]?.type || 0, mods, keys: [hid, 0, 0] };
    $('capturedText').textContent = bindingToText(captureResult);
    $('captureOk').disabled = false;
  };
  document.addEventListener('keydown', onKey, true);

  const cleanup = () => {
    document.removeEventListener('keydown', onKey, true);
    dlg.close();
  };
  $('captureOk').onclick = () => { if (captureResult) { bindings[index] = captureResult; renderKeys(); } cleanup(); };
  $('captureCancel').onclick = cleanup;
  dlg.showModal();
}

// Assign the next free F13–F24 as a unique AHK trigger.
function assignAhk(index) {
  const used = new Set();
  bindings.forEach((b) => b?.keys.forEach((k) => { if (k >= 0x68 && k <= 0x73) used.add(k); }));
  let hid = 0x68;
  while (used.has(hid) && hid <= 0x73) hid++;
  if (hid > 0x73) { setStatus('All F13–F24 triggers are in use.', 'err'); return; }
  bindings[index] = { type: bindings[index]?.type || 0, mods: 0, keys: [hid, 0, 0] };
  renderKeys();
  setStatus(`Key ${index + 1} now sends ${HID_TO_NAME[hid]}. Click "Save to device", then use ${HID_TO_NAME[hid]}:: in your AutoHotkey script.`, 'info');
}

// --- save -------------------------------------------------------------------
async function saveAll() {
  if (!dev) return;
  setStatus('Writing keys…', 'info');
  try {
    for (let i = 0; i < NKEYS; i++) {
      const b = bindings[i] || { type: 0, mods: 0, keys: [0, 0, 0] };
      const ok = await dev.writeKey(i, b);
      append(`Key ${i + 1}: ${ok ? 'written' : 'write NAK'}`, ok ? 'ok' : 'err');
    }
    const saved = await dev.save();
    append(saved ? 'Committed to flash ✓' : 'Flash commit returned NAK ✗', saved ? 'ok' : 'err');
  } catch (e) {
    append('Save failed: ' + e.message, 'err');
    log('error', e.message);
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
    log('diag', `original key0: ${bindingToText(original)}`);

    append('Writing sentinel F24 + flash save…');
    await dev.writeKey(0, { type: original.type, mods: 0, keys: [SENTINEL, 0, 0] });
    const savedOk = await dev.save();
    if (!savedOk) { append('Flash commit NAK — firmware likely rejects writes ✗', 'err'); return; }

    const immediate = await dev.readKey(0);
    const wroteOk = immediate && immediate.keys[0] === SENTINEL;
    append(`Immediate read-back: ${wroteOk ? 'F24 present ✓' : 'sentinel NOT present ✗'}`, wroteOk ? 'ok' : 'err');
    if (!wroteOk) { await restore(original); return; }

    append('Now UNPLUG the pad, wait 2s, and PLUG IT BACK IN. Waiting…', 'info');
    await dev.close().catch(() => {});
    await dev.reconnect();
    append('Reconnected. Re-reading Key 1…', 'info');

    const after = await dev.readKey(0);
    const persisted = after && after.keys[0] === SENTINEL;
    if (persisted) {
      append('VERDICT: firmware accepts persistent writes ✓ — on-device remap is reliable.', 'ok');
    } else {
      append('VERDICT: firmware silently rejects flash writes ✗ — bindings will not survive reboot on this unit. We should use the PC-side fallback.', 'err');
    }
    await restore(original);
    await readAll();
  } catch (e) {
    append('Diagnostic error: ' + e.message, 'err');
    log('error', e.message);
  }
}

async function restore(original) {
  try {
    await dev.writeKey(0, original);
    await dev.save();
    append('Original Key 1 binding restored.', 'info');
  } catch (e) { append('Could not restore Key 1: ' + e.message, 'err'); }
}
