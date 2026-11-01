import assert from 'node:assert/strict';
import { AgentClient, agentAlive } from '../client.js';

const originalFetch = globalThis.fetch;
try {
  let calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push([path, options]);
    return { ok: true, status: 200, json: async () => ({ log: [] }) };
  };
  assert.equal(await agentAlive(), true);

  const client = new AgentClient();
  globalThis.fetch = async (path, options) => {
    calls.push([path, options]);
    return { ok: true, status: 200, json: async () => ({ ok: true, name: 'Pad', model: 1, version: 2 }) };
  };
  await client.connect();
  const connectCall = calls.at(-1);
  assert.equal(connectCall[0], '/api/connect');
  assert.equal(connectCall[1].method, 'POST');

  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ html: '<h1>not the agent</h1>' }) });
  assert.equal(await agentAlive(), false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('client tests passed');
