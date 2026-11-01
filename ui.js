// ui.js - wiring for MacroPad Local (talks to the local HID agent)
import { CODE_TO_HID, HID_TO_NAME, bindingToText } from './keymap.js';
import { AgentClient, agentAlive } from './client.js';
import { appendStatusText, setStatusText } from './ui-utils.js';
import { runPersistenceDiagnostic } from './diagnostic.js';
import { writeBindingsAndSave } from './save-logic.js';

const NKEYS = 3;
const $ = (id) => document.getElementById(id);
const logEl = $('log');
const statusEl = $('status');

const log = (tag, msg) => { logEl.textContent += `[${tag}] ${msg}\n`; logEl.scrollTop = logEl.scrollHeight; };
const setStatus = (msg, cls = 'info') => setStatusText(statusEl, msg, cls);
const append = (msg, cls = 'info') => appendStatusText(statusEl, msg, cls);

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
        <button class="btn small" data-set="${i}" title="Make this button type a single key. Modifiers and combos are ignored.">Click to set</button>
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

  const cleanup = () => {
    document.removeEventListener('keydown', onKey, true);
    dlg.removeEventListener('cancel', onCancel);
    if (dlg.open) dlg.close();
  };
  const onCancel = () => cleanup();
  dlg.addEventListener('cancel', onCancel);
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
    const saved = await writeBindingsAndSave(dev, bindings, NKEYS, (i, ok) => {
      append(`Key ${i + 1}: ${ok ? 'written' : 'write NAK'}`, ok ? 'ok' : 'err');
    });
    if (!saved.written) append('Flash commit skipped because a key write failed ✗', 'err');
    else append(saved.saved ? 'Committed to flash ✓' : 'Flash commit returned NAK ✗', saved.saved ? 'ok' : 'err');
  } catch (e) {
    append('Save failed: ' + e.message, 'err');
  } finally {
    await pullServerLog();
  }
}

// --- persistence diagnostic -------------------------------------------------
async function verifyPersistence() {
  if (!dev) return;
  try {
    await runPersistenceDiagnostic(dev, append);
    await readAll();
  } catch (e) {
    append('Diagnostic error: ' + e.message, 'err');
  } finally {
    await pullServerLog();
  }
}
