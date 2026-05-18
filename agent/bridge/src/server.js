import http from 'node:http';
import { basename } from 'node:path';
import { WebSocketServer } from 'ws';
import { normalizeAppServerNotification, panelEvent, serializeSse } from './events.js';
import { normalizeMode } from './policy.js';
import { createPhotoshopTools } from './photoshop-tools.js';
import { latestCodexImage, listCodexImages, readCodexImageFile, waitForLatestCodexImage } from './codex-images.js';

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

function sendFile(res, status, data, contentType) {
  res.writeHead(status, {
    'content-type': contentType,
    'access-control-allow-origin': '*',
    'cache-control': 'no-cache'
  });
  res.end(data);
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

function shortenTechnicalText(text, maxLength = 180) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '没有返回更多错误信息。';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

function imageFileLabel(filePath) {
  return basename(filePath || '') || 'Codex 图片';
}

function toolResultMentions(result, pattern) {
  return pattern.test(textFromToolResult(result));
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

function codexImageGenerationPrompt(prompt) {
  return [
    '请使用 Codex 内置图片生成能力生成一张图片。',
    `图片需求：${prompt}`,
    '只生成图片，不要调用 Photoshop MCP，也不要调用 OpenAI API Key。'
  ].join('\n');
}

async function runDirectIntent(tools, intent) {
  switch (intent.action) {
    case 'read_document':
      return tools.readDocument();
    case 'read_layers':
      return tools.readLayers();
    default:
      throw new Error(`Unknown direct Photoshop action: ${intent.action}`);
  }
}

export function createBridgeServer({
  appServer,
  store,
  host = '127.0.0.1',
  codexImageDir,
  imageWaitTimeoutMs = 15000
} = {}) {
  const sseClients = new Set();
  const webSocketClients = new Set();
  const webSocketServer = new WebSocketServer({ noServer: true });
  const pendingCodexImageImports = [];

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

  async function placeCodexImageFile({ image, mode, source }) {
    const generated = source === 'generated';
    const actionName = generated ? 'place_generated_codex_image' : 'place_latest_codex_image';
    const tools = createPhotoshopTools({ appServer, mode });

    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: actionName, status: 'started' }));
    const placeResult = await tools.placeImage({ filePath: image.path });

    if (toolResultMentions(placeResult, /No active document/i)) {
      const openResult = await tools.openImage({ filePath: image.path });
      const label = imageFileLabel(image.path);
      const text = generated
        ? `Codex 图片已生成：${label}\n当前没有打开画布，已作为新 Photoshop 文档打开。`
        : `最新 Codex 图片已找到：${label}\n当前没有打开画布，已作为新 Photoshop 文档打开。`;
      await store?.appendOperation?.({ type: 'tool_event', tool: `open_${actionName}`, result: text });
      if (openResult?.isError) {
        broadcast(panelEvent('error', {
          message: `图片已生成，但打开新文档失败：${label}\n${shortenTechnicalText(textFromToolResult(openResult))}`,
          details: openResult
        }));
      } else {
        broadcast(panelEvent('assistant_delta', { text }));
      }
      return;
    }

    if (placeResult?.isError) {
      const label = imageFileLabel(image.path);
      const text = generated
        ? `Codex 图片已生成，但导入 Photoshop 失败：${label}\n${shortenTechnicalText(textFromToolResult(placeResult))}`
        : `最新 Codex 图片导入 Photoshop 失败：${label}\n${shortenTechnicalText(textFromToolResult(placeResult))}`;
      await store?.appendOperation?.({ type: 'tool_event', tool: actionName, result: text });
      broadcast(panelEvent('error', { message: text, details: placeResult }));
      return;
    }

    const fitResult = await tools.fitActiveLayerToDocument({ fillDocument: false });
    const label = imageFileLabel(image.path);
    const text = fitResult?.isError
      ? `${generated ? 'Codex 图片已导入 Photoshop' : '最新 Codex 图片已导入 Photoshop'}：${label}\n图片已放入画布，但适配画布失败：${shortenTechnicalText(textFromToolResult(fitResult))}`
      : `${generated ? 'Codex 图片已导入 Photoshop' : '最新 Codex 图片已导入 Photoshop'}：${label}\n已作为智能对象放入当前画布，并适配到画布大小。`;
    await store?.appendOperation?.({ type: 'tool_event', tool: actionName, result: text });
    broadcast(panelEvent('assistant_delta', { text }));
  }

  async function placeGeneratedCodexImage(request) {
    const image = await waitForLatestCodexImage({
      searchDir: codexImageDir,
      afterMs: request.startedAtMs,
      timeoutMs: imageWaitTimeoutMs
    });
    if (!image) {
      broadcast(panelEvent('error', {
        message: 'Codex 已完成回复，但没有检测到新的生成图片。可以在这里让我重新生成一次。'
      }));
      return;
    }

    await placeCodexImageFile({ image, mode: request.mode, source: 'generated' });
  }

  async function placeLatestCodexImage(mode) {
    const image = await latestCodexImage({ searchDir: codexImageDir });
    if (!image) {
      broadcast(panelEvent('error', {
        message: '没有找到可导入的 Codex 图片。可以先在面板里生成一张。'
      }));
      return;
    }

    await placeCodexImageFile({ image, mode, source: 'latest' });
  }

  async function listGalleryImages() {
    return listCodexImages({ searchDir: codexImageDir });
  }

  async function importGalleryImages(paths = [], mode = 'safe-auto') {
    const normalizedMode = normalizeMode(mode);
    if (!Array.isArray(paths) || paths.length === 0) {
      broadcast(panelEvent('error', { message: '请先在图库里选择至少一张图片。' }));
      return;
    }

    for (const filePath of paths) {
      await readCodexImageFile({ searchDir: codexImageDir, filePath });
      await placeCodexImageFile({
        image: { path: filePath },
        mode: normalizedMode,
        source: 'latest'
      });
    }

    broadcast(panelEvent('assistant_delta', { text: `已导入 ${paths.length} 张图库图片到 Photoshop。` }));
  }

  async function handlePanelChat(body) {
    const mode = normalizeMode(body.mode);
    await store?.update?.({ mode });
    broadcast(panelEvent('user_message', { text: body.message, mode }));
    const directIntent = directIntentForMessage(body.message);
    if (directIntent) {
      if (directIntent.action === 'generate_and_place_image') {
        const startedAtMs = Date.now();
        pendingCodexImageImports.push({ startedAtMs, mode, prompt: directIntent.prompt });
        broadcast(panelEvent('tool_event', { server: 'codex', tool: 'image_generation', status: 'started' }));
        await appServer.startTurn(codexImageGenerationPrompt(directIntent.prompt));
        if (appServer.threadId) await store?.update?.({ threadId: appServer.threadId });
        return;
      }

      if (directIntent.action === 'place_latest_codex_image') {
        await placeLatestCodexImage(mode);
        return;
      }

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

  async function handleAppServerNotification(notification) {
    // Keep the normal Codex chat stream visible, then run Photoshop side effects
    // after Codex's own image generation turn has finished writing files.
    const event = normalizeAppServerNotification(notification);
    if (event.type !== 'raw_event') broadcast(event);

    if (notification?.method !== 'turn/completed' || pendingCodexImageImports.length === 0) return;
    const request = pendingCodexImageImports.shift();
    try {
      await placeGeneratedCodexImage(request);
    } catch (error) {
      broadcast(panelEvent('error', { message: error.message }));
    }
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

      if (req.method === 'GET' && req.url?.startsWith('/gallery-image')) {
        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        const filePath = url.searchParams.get('path');
        const image = await readCodexImageFile({ searchDir: codexImageDir, filePath });
        sendFile(res, 200, image.buffer, image.contentType);
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

        if (body.type === 'list_gallery') {
          const images = await listGalleryImages();
          sendSocket(socket, panelEvent('gallery_images', { images }));
          return;
        }

        if (body.type === 'import_images') {
          await importGalleryImages(body.paths, body.mode);
          sendSocket(socket, panelEvent('status', { message: 'Gallery import requested' }));
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
    broadcast,
    handleAppServerNotification
  };
}
