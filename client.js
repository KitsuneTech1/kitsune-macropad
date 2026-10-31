// client.js - talks to the local Python HID agent over localhost.
// Mirrors the old WebHID device interface so the UI barely changes.

async function jget(path) {
  const r = await fetch(path);
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
async function jpost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export class AgentClient {
  constructor() {
    this.name = null;
    this.model = null;
    this.version = null;
  }

  async connect() {
    const j = await jget('/api/connect');
    this.name = j.name;
    this.model = j.model;
    this.version = j.version;
    return j;
  }

  async readKey(index) {
    const j = await jget('/api/keys');
    return j.keys[index];
  }

  // Returns all three at once (one round-trip); the UI uses this for readAll.
  async readAll() {
    const j = await jget('/api/keys');
    return j.keys;
  }

  async writeKey(index, b) {
    const j = await jpost('/api/key', { index, keycode: b.keycode || 0 });
    return j.ok;
  }

  async save() {
    const j = await jpost('/api/save', {});
    return j.ok;
  }

  async reconnect() {
    const j = await jpost('/api/reconnect', {});
    return j.ok;
  }

  async serverLog() {
    try { return (await jget('/api/log')).log; } catch { return []; }
  }
}

// Is the agent reachable at all?
export async function agentAlive() {
  try {
    await fetch('/api/log', { method: 'GET' });
    return true;
  } catch {
    return false;
  }
}
