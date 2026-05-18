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

function nextSocketEvent(socket, timeoutMs = 50) {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      resolve(null);
    }, timeoutMs);

    function onMessage(data) {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(JSON.parse(data.toString('utf8')));
    }

    socket.on('message', onMessage);
  });
}

async function waitForOpenSocket(socket) {
  if (socket.readyState !== WebSocket.OPEN) await once(socket, 'open');
  await new Promise(resolve => setTimeout(resolve, 20));
}

async function waitForCondition(predicate, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition');
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

test('GET /gallery-image serves generated image previews', async () => {
  const imageDir = await mkdtemp(join(tmpdir(), 'codex-ps-generated-'));
  const server = createBridgeServer({
    appServer: { startTurn: async () => ({}) },
    codexImageDir: imageDir
  });
  const listener = await server.listen(0);
  try {
    const imagePath = join(imageDir, 'preview.png');
    await writeFile(imagePath, 'png bytes', 'utf8');
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/gallery-image?path=${encodeURIComponent(imagePath)}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(await response.text(), 'png bytes');
  } finally {
    await server.close();
    await rm(imageDir, { recursive: true, force: true });
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

test('direct latest-image import opens the image when Photoshop has no active document', async () => {
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
    codexImageDir: imageDir
  });
  const listener = await server.listen(0);
  try {
    const imagePath = join(imageDir, 'latest.png');
    await writeFile(imagePath, 'fake png', 'utf8');
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '导入最新 Codex 图片到当前 Photoshop 画布，作为智能对象。', mode: 'safe-auto' })
    });
    assert.equal(response.status, 200);

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

test('raw app-server notifications are not forwarded to the panel', async () => {
  const server = createBridgeServer({
    appServer: {
      async startTurn() {
        return { turn: { id: 'turn-1' } };
      }
    }
  });
  const listener = await server.listen(0);
  const socket = new WebSocket(`ws://127.0.0.1:${listener.address().port}/socket`);
  try {
    const statusPromise = waitForSocketEvent(socket, event => event.type === 'status');
    await once(socket, 'open');
    await statusPromise;

    await server.handleAppServerNotification({ method: 'custom/event', params: { value: 1 } });
    const event = await nextSocketEvent(socket);
    assert.equal(event, null);
  } finally {
    socket.close();
    await server.close();
  }
});

test('WebSocket /socket lists gallery images', async () => {
  const imageDir = await mkdtemp(join(tmpdir(), 'codex-ps-generated-'));
  const server = createBridgeServer({
    appServer: {
      async startTurn() {
        return { turn: { id: 'turn-1' } };
      }
    },
    codexImageDir: imageDir
  });
  const listener = await server.listen(0);
  const socket = new WebSocket(`ws://127.0.0.1:${listener.address().port}/socket`);
  try {
    const imagePath = join(imageDir, 'gallery.png');
    await writeFile(imagePath, 'fake png', 'utf8');
    await waitForOpenSocket(socket);

    const galleryPromise = waitForSocketEvent(socket, event => event.type === 'gallery_images');
    socket.send(JSON.stringify({ type: 'list_gallery' }));
    const event = await galleryPromise;
    assert.equal(event.images.length, 1);
    assert.equal(event.images[0].path, imagePath);
    assert.equal(event.images[0].previewUrl, `/gallery-image?path=${encodeURIComponent(imagePath)}`);
  } finally {
    socket.close();
    await server.close();
    await rm(imageDir, { recursive: true, force: true });
  }
});

test('WebSocket /socket imports selected gallery images', async () => {
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
    codexImageDir: imageDir
  });
  const listener = await server.listen(0);
  const socket = new WebSocket(`ws://127.0.0.1:${listener.address().port}/socket`);
  try {
    const firstPath = join(imageDir, 'first.png');
    const secondPath = join(imageDir, 'second.png');
    await writeFile(firstPath, 'first', 'utf8');
    await writeFile(secondPath, 'second', 'utf8');
    await waitForOpenSocket(socket);

    socket.send(JSON.stringify({ type: 'import_images', paths: [firstPath, secondPath], mode: 'safe-auto' }));
    await waitForCondition(() => calls.length === 4);

    assert.deepEqual(calls, [{
      server: 'photoshop',
      tool: 'photoshop_place_image',
      args: { filePath: firstPath, x: 0, y: 0 }
    }, {
      server: 'photoshop',
      tool: 'photoshop_fit_layer_to_document',
      args: { fillDocument: false }
    }, {
      server: 'photoshop',
      tool: 'photoshop_place_image',
      args: { filePath: secondPath, x: 0, y: 0 }
    }, {
      server: 'photoshop',
      tool: 'photoshop_fit_layer_to_document',
      args: { fillDocument: false }
    }]);
  } finally {
    socket.close();
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
