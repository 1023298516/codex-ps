import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import { createBridgeServer } from '../src/server.js';

function waitForSocketEvent(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket event'));
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onMessage(data) {
      const event = JSON.parse(data.toString('utf8'));
      if (!predicate(event)) return;
      cleanup();
      resolve(event);
    }

    socket.on('message', onMessage);
    socket.on('error', onError);
  });
}

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

test('POST /chat persists the active Codex thread id', async () => {
  const updates = [];
  const server = createBridgeServer({
    appServer: {
      get threadId() {
        return 'thread-1';
      },
      async startTurn() {
        return { turn: { id: 'turn-1' } };
      }
    },
    store: {
      async update(patch) {
        updates.push(patch);
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
    assert.deepEqual(updates, [{ mode: 'safe-auto' }, { threadId: 'thread-1' }]);
  } finally {
    await server.close();
  }
});

test('WebSocket /socket accepts a panel chat message', async () => {
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
  const socket = new WebSocket(`ws://127.0.0.1:${listener.address().port}/socket`);
  try {
    const statusPromise = waitForSocketEvent(socket, event => event.type === 'status');
    await once(socket, 'open');
    const status = await statusPromise;
    assert.equal(status.message, 'Connected to Codex PS bridge');

    const userMessagePromise = waitForSocketEvent(socket, event => event.type === 'user_message');
    const ackPromise = waitForSocketEvent(socket, event => event.message === 'Message sent to Codex');
    socket.send(JSON.stringify({ type: 'chat', message: 'hello ws', mode: 'full-auto' }));
    const userMessage = await userMessagePromise;
    assert.equal(userMessage.text, 'hello ws');
    assert.equal(userMessage.mode, 'full-auto');

    const ack = await ackPromise;
    assert.equal(ack.type, 'status');
    assert.deepEqual(calls, ['hello ws']);
  } finally {
    socket.close();
    await server.close();
  }
});
