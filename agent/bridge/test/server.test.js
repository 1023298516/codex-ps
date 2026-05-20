import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBridgeServer } from '../src/server.js';
import { saveProductReference } from '../src/product-replacement.js';

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

test('GET /product-reference serves uploaded product reference previews', async () => {
  const referenceDir = await mkdtemp(join(tmpdir(), 'codex-ps-product-refs-'));
  const saved = await saveProductReference({
    referenceDir,
    name: 'front.png',
    mimeType: 'image/png',
    data: Buffer.from('front png').toString('base64')
  });
  const server = createBridgeServer({
    appServer: { startTurn: async () => ({}) },
    productReferenceDir: referenceDir
  });
  const listener = await server.listen(0);
  try {
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/product-reference?path=${encodeURIComponent(saved.path)}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(await response.text(), 'front png');
  } finally {
    await server.close();
    await rm(referenceDir, { recursive: true, force: true });
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

    const summaryPromise = waitForSocketEvent(socket, event => (
      event.type === 'assistant_delta' && /已导入 Photoshop/.test(event.text || '')
    ));
    socket.send(JSON.stringify({ type: 'import_images', paths: [firstPath, secondPath], mode: 'safe-auto' }));
    await waitForCondition(() => calls.length === 4);
    const summary = await summaryPromise;

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
    assert.match(summary.text, /first\.png/);
    assert.doesNotMatch(summary.text, /imagePath|filePath|Result:|\/tmp\//);
    assert.ok(summary.text.length < 160);
  } finally {
    socket.close();
    await server.close();
    await rm(imageDir, { recursive: true, force: true });
  }
});

test('WebSocket /socket uploads and lists product replacement reference images', async () => {
  const referenceDir = await mkdtemp(join(tmpdir(), 'codex-ps-product-refs-'));
  const server = createBridgeServer({
    appServer: {
      async startTurn() {
        return { turn: { id: 'turn-1' } };
      }
    },
    productReferenceDir: referenceDir
  });
  const listener = await server.listen(0);
  const socket = new WebSocket(`ws://127.0.0.1:${listener.address().port}/socket`);
  try {
    await waitForOpenSocket(socket);

    const uploadPromise = waitForSocketEvent(socket, event => event.type === 'product_references');
    socket.send(JSON.stringify({
      type: 'upload_product_reference',
      name: 'front.png',
      mimeType: 'image/png',
      data: Buffer.from('front').toString('base64')
    }));
    const uploaded = await uploadPromise;
    assert.equal(uploaded.references.length, 1);
    assert.equal(uploaded.references[0].name, 'front.png');
    assert.match(uploaded.references[0].previewUrl, /^\/product-reference\?path=/);

    const listPromise = waitForSocketEvent(socket, event => event.type === 'product_references');
    socket.send(JSON.stringify({ type: 'list_product_references' }));
    const listed = await listPromise;
    assert.equal(listed.references.length, 1);
    assert.equal(listed.references[0].path, uploaded.references[0].path);

    const deletePromise = waitForSocketEvent(socket, event => event.type === 'product_references');
    socket.send(JSON.stringify({
      type: 'delete_product_reference',
      path: uploaded.references[0].path
    }));
    const afterDelete = await deletePromise;
    assert.equal(afterDelete.references.length, 0);
    await assert.rejects(() => readFile(uploaded.references[0].path, 'utf8'));
  } finally {
    socket.close();
    await server.close();
    await rm(referenceDir, { recursive: true, force: true });
  }
});

test('WebSocket /socket creates and reads a Photoshop product target layer', async () => {
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
    }
  });
  const listener = await server.listen(0);
  const socket = new WebSocket(`ws://127.0.0.1:${listener.address().port}/socket`);
  try {
    await waitForOpenSocket(socket);

    const createdPromise = waitForSocketEvent(socket, event => (
      event.type === 'assistant_delta' && /目标 01/.test(event.text || '')
    ));
    socket.send(JSON.stringify({ type: 'create_product_target', mode: 'safe-auto' }));
    await createdPromise;

    const readPromise = waitForSocketEvent(socket, event => (
      event.type === 'assistant_delta' && /目标图层/.test(event.text || '')
    ));
    socket.send(JSON.stringify({ type: 'read_product_target', mode: 'safe-auto' }));
    await readPromise;

    assert.equal(calls.length, 2);
    assert.equal(calls[0].tool, 'photoshop_execute_script');
    assert.match(calls[0].args.code, /目标 01/);
    assert.equal(calls[1].tool, 'photoshop_execute_script');
  } finally {
    socket.close();
    await server.close();
  }
});

test('WebSocket /socket identifies current products and locks the confirmed target', async () => {
  const imageDir = await mkdtemp(join(tmpdir(), 'codex-ps-generated-'));
  const referenceDir = await mkdtemp(join(tmpdir(), 'codex-ps-product-refs-'));
  const turns = [];
  const calls = [];
  const server = createBridgeServer({
    appServer: {
      async startTurn(input) {
        turns.push(input);
        return { turn: { id: 'turn-1' } };
      },
      async callMcpTool(serverName, tool, args) {
        calls.push({ server: serverName, tool, args });
        if (tool === 'photoshop_export_canvas_png') {
          await writeFile(args.outputPath, 'canvas', 'utf8');
        }
        return { content: [{ type: 'text', text: `${tool}: ok left: 10 top: 20 right: 210 bottom: 420` }] };
      }
    },
    codexImageDir: imageDir,
    productReferenceDir: referenceDir
  });
  const listener = await server.listen(0);
  const socket = new WebSocket(`ws://127.0.0.1:${listener.address().port}/socket`);
  try {
    await waitForOpenSocket(socket);

    socket.send(JSON.stringify({ type: 'identify_product_target', mode: 'safe-auto' }));
    await waitForCondition(() => turns.length === 1);
    assert.match(turns[0][0].text, /识别当前 Photoshop 详情页里的产品/);
    assert.equal(turns[0].filter(item => item.type === 'localImage').length, 1);
    assert.ok(calls.some(call => call.tool === 'photoshop_export_canvas_png'));
    assert.ok(calls.some(call => /圈选目标组/.test(call.args?.code || '')));

    const lockedPromise = waitForSocketEvent(socket, event => event.type === 'product_target_state' && event.locked === true);
    socket.send(JSON.stringify({ type: 'lock_product_target', mode: 'safe-auto' }));
    const locked = await lockedPromise;
    assert.equal(locked.target.bounds.left, 10);
    assert.equal(locked.target.bounds.bottom, 420);
  } finally {
    socket.close();
    await server.close();
    await rm(imageDir, { recursive: true, force: true });
    await rm(referenceDir, { recursive: true, force: true });
  }
});

test('WebSocket /socket generates a product replacement preview then imports it as a new result layer', async () => {
  const imageDir = await mkdtemp(join(tmpdir(), 'codex-ps-generated-'));
  const referenceDir = await mkdtemp(join(tmpdir(), 'codex-ps-product-refs-'));
  const reference = await saveProductReference({
    referenceDir,
    name: 'front.png',
    mimeType: 'image/png',
    data: Buffer.from('front').toString('base64')
  });
  const turns = [];
  const calls = [];
  const server = createBridgeServer({
    appServer: {
      async startTurn(input) {
        turns.push(input);
        return { turn: { id: 'turn-1' } };
      },
      async callMcpTool(serverName, tool, args) {
        calls.push({ server: serverName, tool, args });
        if (tool === 'photoshop_export_canvas_png') {
          await writeFile(args.outputPath, 'canvas', 'utf8');
        }
        return { content: [{ type: 'text', text: `${tool}: ok` }] };
      }
    },
    codexImageDir: imageDir,
    productReferenceDir: referenceDir,
    imageWaitTimeoutMs: 100
  });
  const listener = await server.listen(0);
  const socket = new WebSocket(`ws://127.0.0.1:${listener.address().port}/socket`);
  try {
    await waitForOpenSocket(socket);

    socket.send(JSON.stringify({
      type: 'generate_product_replacement_preview',
      mode: 'safe-auto',
      replacementMode: 'multi',
      referencePaths: [reference.path],
      mainReferencePath: reference.path
    }));
    await waitForCondition(() => turns.length === 1);
    assert.match(turns[0][0].text, /双向结合/);
    assert.match(turns[0][0].text, /多方位替换/);
    assert.match(turns[0][0].text, /圈出的目标/);
    assert.doesNotMatch(turns[0][0].text, /目标数量/);
    assert.match(turns[0][0].text, /主产品图：front\.png/);
    assert.equal(turns[0].filter(item => item.type === 'localImage').length, 2);

    const threadDir = join(imageDir, 'thread');
    await mkdir(threadDir);
    const previewPath = join(threadDir, 'replacement.png');
    await writeFile(previewPath, 'replacement', 'utf8');

    const previewPromise = waitForSocketEvent(socket, event => event.type === 'product_replacement_preview');
    await server.handleAppServerNotification({ method: 'turn/completed', params: {} });
    const preview = await previewPromise;
    assert.equal(preview.image.path, previewPath);
    assert.match(preview.image.previewUrl, /^\/gallery-image\?path=/);

    socket.send(JSON.stringify({
      type: 'import_product_replacement_preview',
      mode: 'safe-auto',
      path: previewPath
    }));
    await waitForCondition(() => calls.some(call => call.tool === 'photoshop_fit_layer_to_document'));
    assert.deepEqual(calls.slice(-3).map(call => call.tool), [
      'photoshop_place_image',
      'photoshop_fit_layer_to_document',
      'photoshop_execute_script'
    ]);
    assert.match(calls.at(-1).args.code, /替换结果组/);
  } finally {
    socket.close();
    await server.close();
    await rm(imageDir, { recursive: true, force: true });
    await rm(referenceDir, { recursive: true, force: true });
  }
});

test('WebSocket /socket generates a local retouch layer directly from the current Photoshop selection', async () => {
  const imageDir = await mkdtemp(join(tmpdir(), 'codex-ps-generated-'));
  const referenceDir = await mkdtemp(join(tmpdir(), 'codex-ps-product-refs-'));
  const reference = await saveProductReference({
    referenceDir,
    name: 'front.png',
    mimeType: 'image/png',
    data: Buffer.from('front').toString('base64')
  });
  const turns = [];
  const calls = [];
  const server = createBridgeServer({
    appServer: {
      async startTurn(input) {
        turns.push(input);
        return { turn: { id: 'turn-1' } };
      },
      async callMcpTool(serverName, tool, args) {
        calls.push({ server: serverName, tool, args });
        if (tool === 'photoshop_export_canvas_png') {
          await writeFile(args.outputPath, 'canvas', 'utf8');
        }
        return { content: [{ type: 'text', text: `${tool}: ok left: 30 top: 40 right: 180 bottom: 260` }] };
      }
    },
    codexImageDir: imageDir,
    productReferenceDir: referenceDir,
    imageWaitTimeoutMs: 100
  });
  const listener = await server.listen(0);
  const socket = new WebSocket(`ws://127.0.0.1:${listener.address().port}/socket`);
  try {
    await waitForOpenSocket(socket);

    socket.send(JSON.stringify({
      type: 'generate_product_retouch_layer',
      mode: 'safe-auto',
      referencePaths: [reference.path],
      mainReferencePath: reference.path
    }));
    await waitForCondition(() => turns.length === 1);
    assert.match(turns[0][0].text, /局部返修/);
    assert.match(turns[0][0].text, /Photoshop 当前选区/);
    assert.match(turns[0][0].text, /直接导入为新建返修图层/);
    assert.doesNotMatch(turns[0][0].text, /预览/);
    assert.equal(calls[0].tool, 'photoshop_execute_script');
    assert.match(calls[0].args.code, /doc\.selection\.bounds/);

    const threadDir = join(imageDir, 'thread');
    await mkdir(threadDir);
    const retouchPath = join(threadDir, 'retouch.png');
    await writeFile(retouchPath, 'retouch', 'utf8');

    const importedPromise = waitForSocketEvent(socket, event => event.type === 'assistant_delta' && /局部返修图层/.test(event.text || ''));
    await server.handleAppServerNotification({ method: 'turn/completed', params: {} });
    await importedPromise;
    await waitForCondition(() => calls.some(call => /局部返修组/.test(call.args?.code || '')));
    assert.deepEqual(calls.slice(-3).map(call => call.tool), [
      'photoshop_place_image',
      'photoshop_fit_layer_to_document',
      'photoshop_execute_script'
    ]);

    const rollbackPromise = waitForSocketEvent(socket, event => event.type === 'assistant_delta' && /已回退上一版局部返修/.test(event.text || ''));
    socket.send(JSON.stringify({ type: 'rollback_product_retouch', mode: 'safe-auto' }));
    await rollbackPromise;
    assert.ok(calls.some(call => /局部返修组/.test(call.args?.code || '') && /visible = false/.test(call.args.code)));
  } finally {
    socket.close();
    await server.close();
    await rm(imageDir, { recursive: true, force: true });
    await rm(referenceDir, { recursive: true, force: true });
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
