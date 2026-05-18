import http from 'node:http';
import { WebSocketServer } from 'ws';
import { panelEvent, serializeSse } from './events.js';
import { normalizeMode } from './policy.js';
import { createPhotoshopTools } from './photoshop-tools.js';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(data));
}

function textFromToolResult(result) {
  const content = result?.content;
  if (Array.isArray(content)) {
    const text = content
      .filter(item => item?.type === 'text' && item.text)
      .map(item => item.text)
      .join('\n');
    if (text) return text;
  }
  return JSON.stringify(result);
}

function directIntentForMessage(message = '') {
  const text = String(message).trim();
  if (/读取.*(画布|文档信息|文档)|读.*(画布|文档信息|文档)/.test(text)) return { action: 'read_document' };
  if (/读取.*图层|读.*图层/.test(text)) return { action: 'read_layers' };
  if (/导入.*最新.*图|放入.*最新.*图|置入.*最新.*图/.test(text)) return { action: 'place_latest_codex_image' };

  const asksForImage = /^(生成|画|绘制|创建|做)(?!.*(文字|文案|代码|说明|列表))/.test(text) || /生图|生成.*(图片|图像|照片|海报|视觉)/.test(text);
  if (asksForImage) return { action: 'generate_and_place_image', prompt: text };

  return null;
}

async function runDirectIntent(tools, intent) {
  switch (intent.action) {
    case 'read_document':
      return tools.readDocument();
    case 'read_layers':
      return tools.readLayers();
    case 'place_latest_codex_image':
      return tools.placeLatestCodexImage({ fitMode: 'fit' });
    case 'generate_and_place_image':
      return tools.generateAndPlaceImage({
        prompt: intent.prompt,
        fitMode: 'fit',
        layerName: 'AI Generated Image'
      });
    default:
      throw new Error(`Unknown direct Photoshop action: ${intent.action}`);
  }
}

export function createBridgeServer({ appServer, store, host = '127.0.0.1' } = {}) {
  const sseClients = new Set();
  const webSocketClients = new Set();
  const webSocketServer = new WebSocketServer({ noServer: true });

  function broadcast(event) {
    for (const res of sseClients) res.write(serializeSse(event));
    const payload = JSON.stringify(event);
    for (const socket of webSocketClients) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  }

  function sendSocket(socket, event) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
  }

  async function handlePanelChat(body) {
    const mode = normalizeMode(body.mode);
    await store?.update?.({ mode });
    broadcast(panelEvent('user_message', { text: body.message, mode }));
    const directIntent = directIntentForMessage(body.message);
    if (directIntent) {
      const tools = createPhotoshopTools({ appServer, mode });
      broadcast(panelEvent('tool_event', { server: 'photoshop', tool: directIntent.action, status: 'started' }));

      const result = await runDirectIntent(tools, directIntent);
      const text = textFromToolResult(result);
      await store?.appendOperation?.({ type: 'tool_event', tool: directIntent.action, result: text });
      if (result?.isError) {
        broadcast(panelEvent('error', { message: text, details: result }));
      } else {
        broadcast(panelEvent('assistant_delta', { text }));
        broadcast(panelEvent('turn_completed', { result }));
      }
      return;
    }

    await appServer.startTurn(body.message);
    if (appServer.threadId) await store?.update?.({ threadId: appServer.threadId });
  }

  const listener = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && req.url === '/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'access-control-allow-origin': '*'
        });
        sseClients.add(res);
        res.write(serializeSse(panelEvent('status', { message: 'Connected to Codex PS bridge' })));
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (req.method === 'POST' && req.url === '/chat') {
        const body = await readJson(req);
        await handlePanelChat(body);
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (error) {
      broadcast(panelEvent('error', { message: error.message }));
      sendJson(res, 500, { ok: false, error: error.message });
    }
  });

  listener.on('upgrade', (req, socket, head) => {
    if (req.url !== '/socket') {
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(req, socket, head, ws => {
      webSocketServer.emit('connection', ws, req);
    });
  });

  webSocketServer.on('connection', socket => {
    webSocketClients.add(socket);
    sendSocket(socket, panelEvent('status', { message: 'Connected to Codex PS bridge' }));

    socket.on('message', async data => {
      try {
        const body = JSON.parse(data.toString('utf8'));
        if (body.type === 'chat') {
          await handlePanelChat(body);
          sendSocket(socket, panelEvent('status', { message: 'Message sent to Codex' }));
          return;
        }

        if (body.type === 'interrupt') {
          await appServer.interruptTurn?.();
          broadcast(panelEvent('status', { message: 'Stop requested' }));
          return;
        }

        sendSocket(socket, panelEvent('error', { message: `Unknown panel command: ${body.type || 'missing type'}` }));
      } catch (error) {
        sendSocket(socket, panelEvent('error', { message: error.message }));
      }
    });

    socket.on('close', () => webSocketClients.delete(socket));
  });

  return {
    listen(port = 17891) {
      return new Promise(resolve => listener.listen(port, host, () => resolve(listener)));
    },
    close() {
      for (const socket of webSocketClients) socket.close();
      webSocketServer.close();
      return new Promise(resolve => listener.close(resolve));
    },
    broadcast
  };
}
