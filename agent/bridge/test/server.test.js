import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeServer } from '../src/server.js';

test('GET /health returns bridge status', async () => {
  const server = createBridgeServer({ appServer: { startTurn: async () => ({}) } });
  const listener = await server.listen(0);
  try {
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    await server.close();
  }
});

test('POST /chat accepts a message', async () => {
  const calls = [];
  const server = createBridgeServer({
    appServer: {
      async startTurn(message) {
        calls.push(message);
        return { turn: { id: 'turn-1' } };
      }
    }
  });
  const listener = await server.listen(0);
  try {
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello', mode: 'safe-auto' })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(calls, ['hello']);
  } finally {
    await server.close();
  }
});
