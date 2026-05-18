import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

test('POST /chat routes image generation requests to Codex built-in image generation', async () => {
  const turns = [];
  const mcpCalls = [];
  const server = createBridgeServer({
    appServer: {
      get threadId() {
        return 'thread-1';
      },
      async startTurn(message) {
        turns.push(message);
        return { turn: { id: 'turn-1' } };
      },
      async callMcpTool(serverName, tool, args) {
        mcpCalls.push({ server: serverName, tool, args });
        return { content: [{ type: 'text', text: 'ok' }] };
      }
    }
  });
  const listener = await server.listen(0);
  try {
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '生成一只猪', mode: 'safe-auto' })
    });
    assert.equal(response.status, 200);
    assert.equal(turns.length, 1);
    assert.match(turns[0], /内置图片生成能力/);
    assert.match(turns[0], /生成一只猪/);
    assert.deepEqual(mcpCalls, []);
  } finally {
    await server.close();
  }
});

test('turn completion places the newly generated Codex image into Photoshop', async () => {
  const imageDir = await mkdtemp(join(tmpdir(), 'codex-ps-generated-'));
  const calls = [];
  const server = createBridgeServer({
    appServer: {
      async startTurn() {
        return { turn: { id: 'turn-1' } };
      },
      async callMcpTool(serverName, tool, args) {
        calls.push({ server: serverName, tool, args });
        return { content: [{ type: 'text', text: `${tool}: ok` }] };
      }
    },
    codexImageDir: imageDir,
    imageWaitTimeoutMs: 100
  });
  const listener = await server.listen(0);
  try {
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '生成一只猪', mode: 'safe-auto' })
    });
    assert.equal(response.status, 200);

    const threadDir = join(imageDir, 'thread');
    await mkdir(threadDir);
    const imagePath = join(threadDir, 'pig.png');
    await writeFile(imagePath, 'fake png', 'utf8');
    await server.handleAppServerNotification({ method: 'turn/completed', params: {} });

    assert.deepEqual(calls, [{
      server: 'photoshop',
      tool: 'photoshop_place_image',
      args: {
        filePath: imagePath,
        x: 0,
        y: 0
      }
    }, {
      server: 'photoshop',
      tool: 'photoshop_fit_layer_to_document',
      args: { fillDocument: false }
    }]);
  } finally {
    await server.close();
    await rm(imageDir, { recursive: true, force: true });
  }
});

test('turn completion opens the generated image when Photoshop has no active document', async () => {
  const imageDir = await mkdtemp(join(tmpdir(), 'codex-ps-generated-'));
  const calls = [];
  const server = createBridgeServer({
    appServer: {
      async startTurn() {
        return { turn: { id: 'turn-1' } };
      },
      async callMcpTool(serverName, tool, args) {
        calls.push({ server: serverName, tool, args });
        if (tool === 'photoshop_place_image') {
          return { isError: true, content: [{ type: 'text', text: 'Error placing image: No active document' }] };
        }
        return { content: [{ type: 'text', text: `${tool}: ok` }] };
      }
    },
    codexImageDir: imageDir,
    imageWaitTimeoutMs: 100
  });
  const listener = await server.listen(0);
  try {
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '生成一张香水图', mode: 'safe-auto' })
    });
    assert.equal(response.status, 200);

    const threadDir = join(imageDir, 'thread');
    await mkdir(threadDir);
    const imagePath = join(threadDir, 'perfume.png');
    await writeFile(imagePath, 'fake png', 'utf8');
    await server.handleAppServerNotification({ method: 'turn/completed', params: {} });

    assert.deepEqual(calls, [{
      server: 'photoshop',
      tool: 'photoshop_place_image',
      args: {
        filePath: imagePath,
        x: 0,
        y: 0
      }
    }, {
      server: 'photoshop',
      tool: 'photoshop_open_image',
      args: {
        filePath: imagePath
      }
    }]);
  } finally {
    await server.close();
    await rm(imageDir, { recursive: true, force: true });
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
