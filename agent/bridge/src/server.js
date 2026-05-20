import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { normalizeAppServerNotification, panelEvent, serializeSse } from './events.js';
import { normalizeMode } from './policy.js';
import { createPhotoshopTools } from './photoshop-tools.js';
import { latestCodexImage, listCodexImages, readCodexImageFile, waitForLatestCodexImage } from './codex-images.js';
import {
  DEFAULT_PRODUCT_REFERENCE_DIR,
  buildProductIdentificationInput,
  buildProductReplacementInput,
  buildProductRetouchInput,
  deleteProductReference,
  listProductReferences,
  parseProductIdentificationTargets,
  readProductReferenceFile,
  saveProductReference
} from './product-replacement.js';

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

function targetFromToolResult(result) {
  const text = textFromToolResult(result);
  const match = text.match(/"?left"?\s*[:=]\s*([-\d.]+)[\s\S]*?"?top"?\s*[:=]\s*([-\d.]+)[\s\S]*?"?right"?\s*[:=]\s*([-\d.]+)[\s\S]*?"?bottom"?\s*[:=]\s*([-\d.]+)/i);
  if (!match) return { text };
  return {
    text,
    bounds: {
      left: Number(match[1]),
      top: Number(match[2]),
      right: Number(match[3]),
      bottom: Number(match[4])
    }
  };
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
  productReferenceDir = DEFAULT_PRODUCT_REFERENCE_DIR,
  imageWaitTimeoutMs = 15000
} = {}) {
  const sseClients = new Set();
  const webSocketClients = new Set();
  const webSocketServer = new WebSocketServer({ noServer: true });
  const pendingCodexImageImports = [];
  const pendingProductReplacementPreviews = [];
  const pendingProductRetouchLayers = [];
  const pendingProductTargetIdentifications = [];
  let latestProductReplacementPreview = null;
  let lockedProductTarget = null;

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

  async function listProductReferenceImages() {
    return listProductReferences({ referenceDir: productReferenceDir });
  }

  async function productReferencesForPaths(paths = [], mainReferencePath = null) {
    const allReferences = await listProductReferenceImages();
    const selectedPaths = Array.isArray(paths) && paths.length > 0
      ? new Set(paths)
      : new Set(allReferences.map(reference => reference.path));
    if (mainReferencePath) selectedPaths.add(mainReferencePath);
    const references = [];
    for (const reference of allReferences) {
      if (!selectedPaths.has(reference.path)) continue;
      await readProductReferenceFile({ referenceDir: productReferenceDir, filePath: reference.path });
      references.push(reference);
    }

    if (references.length === 0) return [];
    const mainPath = mainReferencePath && references.some(reference => reference.path === mainReferencePath)
      ? mainReferencePath
      : references[0].path;
    return references
      .map(reference => reference.path === mainPath ? { ...reference, role: 'main' } : reference)
      .sort((a, b) => {
        if (a.role === 'main') return -1;
        if (b.role === 'main') return 1;
        return 0;
      });
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

  async function createProductTarget(mode = 'safe-auto') {
    const tools = createPhotoshopTools({ appServer, mode: normalizeMode(mode) });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'create_product_target_layer', status: 'started' }));
    const result = await tools.createProductTargetLayer();
    if (result?.isError) {
      broadcast(panelEvent('error', { message: shortenTechnicalText(textFromToolResult(result)), details: result }));
      return;
    }
    broadcast(panelEvent('assistant_delta', { text: '已新建目标图层：圈选目标组 / 目标 01。可以在 Photoshop 里移动或缩放后再读取。' }));
  }

  async function readProductTarget(mode = 'safe-auto') {
    const tools = createPhotoshopTools({ appServer, mode: normalizeMode(mode) });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'read_product_target_layer', status: 'started' }));
    const result = await tools.readProductTargetLayer();
    if (result?.isError) {
      broadcast(panelEvent('error', { message: shortenTechnicalText(textFromToolResult(result)), details: result }));
      return null;
    }
    const target = targetFromToolResult(result);
    lockedProductTarget = null;
    broadcast(panelEvent('assistant_delta', { text: '已读取目标图层：目标 01。确认无误后可以锁定目标。' }));
    broadcast(panelEvent('product_target_state', { locked: false, target }));
    return target;
  }

  async function identifyProductTarget(mode = 'safe-auto') {
    const normalizedMode = normalizeMode(mode);
    const tools = createPhotoshopTools({ appServer, mode: normalizedMode });
    const canvasPath = join(productReferenceDir, 'target-exports', `detail-page-target-${Date.now()}.png`);
    await mkdir(dirname(canvasPath), { recursive: true });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'export_canvas', status: 'started' }));
    const exportResult = await tools.exportCanvasPng({ outputPath: canvasPath });
    if (exportResult?.isError) {
      broadcast(panelEvent('error', { message: shortenTechnicalText(textFromToolResult(exportResult)), details: exportResult }));
      return;
    }

    lockedProductTarget = null;
    pendingProductTargetIdentifications.push({ mode: normalizedMode, text: '', canvasPath, attempt: 1 });
    broadcast(panelEvent('assistant_delta', { text: '正在自动识别并圈出产品；识别完成后会按坐标生成候选目标图层，请确认后锁定。' }));
    broadcast(panelEvent('tool_event', { server: 'codex', tool: 'product_target_identification', status: 'started' }));
    await appServer.startTurn(buildProductIdentificationInput({ canvasPath }));
    if (appServer.threadId) await store?.update?.({ threadId: appServer.threadId });
  }

  async function finishProductTargetIdentification(request) {
    const targets = parseProductIdentificationTargets(request.text);
    if (targets.length === 0) {
      if (request.attempt < 2) {
        pendingProductTargetIdentifications.push({
          mode: request.mode,
          text: '',
          canvasPath: request.canvasPath,
          attempt: request.attempt + 1
        });
        broadcast(panelEvent('assistant_delta', { text: '第一轮没有拿到可靠坐标，正在自动重试更严格的产品识别。' }));
        await appServer.startTurn(buildProductIdentificationInput({
          canvasPath: request.canvasPath,
          strictJsonOnly: true
        }));
        if (appServer.threadId) await store?.update?.({ threadId: appServer.threadId });
        return;
      }

      broadcast(panelEvent('error', {
        message: '自动识别没有拿到可靠坐标，未生成目标框。请重新点击“一键识别”，或换一张更清晰的当前画布后再试。'
      }));
      return;
    }

    const tools = createPhotoshopTools({ appServer, mode: request.mode });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'create_product_target_layer', status: 'started' }));
    const result = await tools.createProductTargetLayer({ targets });
    if (result?.isError) {
      broadcast(panelEvent('error', { message: shortenTechnicalText(textFromToolResult(result)), details: result }));
      return;
    }

    const target = targetFromToolResult(result);
    lockedProductTarget = null;
    broadcast(panelEvent('product_target_state', { locked: false, target }));
    broadcast(panelEvent('assistant_delta', {
      text: `已自动圈出 ${targets.length} 个候选目标。请检查是否覆盖完整产品，确认后点击“确认目标”。`
    }));
  }

  async function lockProductTarget(mode = 'safe-auto') {
    const tools = createPhotoshopTools({ appServer, mode: normalizeMode(mode) });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'read_product_target_layer', status: 'started' }));
    const result = await tools.readProductTargetLayer();
    if (result?.isError) {
      broadcast(panelEvent('error', { message: '没有找到可锁定的目标图层，请先点击“一键识别”自动生成目标。', details: result }));
      return null;
    }
    lockedProductTarget = targetFromToolResult(result);
    broadcast(panelEvent('product_target_state', { locked: true, target: lockedProductTarget }));
    broadcast(panelEvent('assistant_delta', { text: '目标已锁定：后续产品替换会按当前目标区域执行。' }));
    return lockedProductTarget;
  }

  async function createRetouchTarget(mode = 'safe-auto') {
    const tools = createPhotoshopTools({ appServer, mode: normalizeMode(mode) });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'create_retouch_target_layer', status: 'started' }));
    const result = await tools.createRetouchTargetLayer();
    if (result?.isError) {
      broadcast(panelEvent('error', { message: shortenTechnicalText(textFromToolResult(result)), details: result }));
      return;
    }
    broadcast(panelEvent('assistant_delta', { text: '已新建返修区域图层：返修区域组 / 返修区域 01。请在 Photoshop 里移动或缩放到不满意的位置。' }));
  }

  async function readRetouchTarget(mode = 'safe-auto') {
    const tools = createPhotoshopTools({ appServer, mode: normalizeMode(mode) });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'read_retouch_target_layer', status: 'started' }));
    const result = await tools.readRetouchTargetLayer();
    if (result?.isError) {
      broadcast(panelEvent('error', { message: '没有找到返修区域图层，请先新建或手动画出“返修区域 01”。', details: result }));
      return null;
    }
    broadcast(panelEvent('assistant_delta', { text: '已读取返修区域：返修区域 01。局部返修会按这个区域生成，并导入为新图层。' }));
    return targetFromToolResult(result);
  }

  async function readProductSelection(mode = 'safe-auto') {
    const tools = createPhotoshopTools({ appServer, mode: normalizeMode(mode) });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'read_selection', status: 'started' }));
    const result = await tools.readSelectionBounds();
    if (result?.isError) {
      broadcast(panelEvent('error', {
        message: '没有检测到 Photoshop 选区。请先在画布里框选要返修的位置。',
        details: result
      }));
      return null;
    }
    const target = targetFromToolResult(result);
    broadcast(panelEvent('product_selection_state', { target }));
    broadcast(panelEvent('assistant_delta', { text: '已读取 Photoshop 当前选区。点击“局部返修当前选区”会直接生成新返修图层。' }));
    return target;
  }

  async function generateProductReplacementPreview(body = {}) {
    const mode = normalizeMode(body.mode);
    const references = await productReferencesForPaths(body.referencePaths, body.mainReferencePath);
    if (references.length === 0) {
      broadcast(panelEvent('error', { message: '请先上传至少 1 张产品参考图，建议上传 4-5 张多方位图片。' }));
      return;
    }

    const tools = createPhotoshopTools({ appServer, mode });
    const canvasPath = join(productReferenceDir, 'canvas-exports', `detail-page-${Date.now()}.png`);
    await mkdir(dirname(canvasPath), { recursive: true });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'export_canvas', status: 'started' }));
    const exportResult = await tools.exportCanvasPng({ outputPath: canvasPath });
    if (exportResult?.isError) {
      broadcast(panelEvent('error', { message: shortenTechnicalText(textFromToolResult(exportResult)), details: exportResult }));
      return;
    }

    let target = lockedProductTarget;
    if (!target) {
      const targetResult = await tools.readProductTargetLayer();
      if (targetResult?.isError) {
        broadcast(panelEvent('error', { message: '没有找到目标图层，请先点击“一键识别”自动生成目标。', details: targetResult }));
        return;
      }
      target = targetFromToolResult(targetResult);
      broadcast(panelEvent('assistant_delta', { text: '提示：当前目标还未锁定，本次会先按读取到的目标区域生成。' }));
    }

    const startedAtMs = Date.now();
    pendingProductReplacementPreviews.push({ startedAtMs, mode, canvasPath });
    broadcast(panelEvent('tool_event', { server: 'codex', tool: 'product_replacement_preview', status: 'started' }));
    await appServer.startTurn(buildProductReplacementInput({
      canvasPath,
      target,
      references,
      replacementMode: body.replacementMode
    }));
    if (appServer.threadId) await store?.update?.({ threadId: appServer.threadId });
  }

  async function finishProductReplacementPreview(request) {
    const image = await waitForLatestCodexImage({
      searchDir: codexImageDir,
      afterMs: request.startedAtMs,
      timeoutMs: imageWaitTimeoutMs
    });
    if (!image) {
      broadcast(panelEvent('error', { message: 'Codex 已完成回复，但没有检测到新的融合预览图。可以重新生成一次。' }));
      return;
    }

    latestProductReplacementPreview = {
      ...image,
      name: imageFileLabel(image.path),
      previewUrl: `/gallery-image?path=${encodeURIComponent(image.path)}`
    };
    broadcast(panelEvent('product_replacement_preview', { image: latestProductReplacementPreview }));
  }

  async function importProductReplacementPreview({ path, mode = 'safe-auto' } = {}) {
    const filePath = path || latestProductReplacementPreview?.path;
    if (!filePath) {
      broadcast(panelEvent('error', { message: '还没有可导入的产品替换预览图。' }));
      return;
    }
    await readCodexImageFile({ searchDir: codexImageDir, filePath });
    const tools = createPhotoshopTools({ appServer, mode: normalizeMode(mode) });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'import_product_replacement_preview', status: 'started' }));
    const placeResult = await tools.placeImage({ filePath });
    if (placeResult?.isError) {
      broadcast(panelEvent('error', { message: `产品替换预览导入失败：${shortenTechnicalText(textFromToolResult(placeResult))}`, details: placeResult }));
      return;
    }
    await tools.fitActiveLayerToDocument({ fillDocument: true });
    await tools.prepareReplacementResultLayer({ layerName: '替换结果 01' });
    broadcast(panelEvent('assistant_delta', { text: `已导入替换结果 01，新图层已保留，原详情图未被覆盖。` }));
  }

  async function generateProductRetouchLayer(body = {}) {
    const mode = normalizeMode(body.mode);
    const references = await productReferencesForPaths(body.referencePaths, body.mainReferencePath);
    const tools = createPhotoshopTools({ appServer, mode });

    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'read_selection', status: 'started' }));
    const targetResult = await tools.readSelectionBounds();
    if (targetResult?.isError) {
      broadcast(panelEvent('error', {
        message: '没有检测到 Photoshop 选区。请先在画布里框选要返修的位置。',
        details: targetResult
      }));
      return;
    }

    const canvasPath = join(productReferenceDir, 'retouch-exports', `detail-page-current-${Date.now()}.png`);
    await mkdir(dirname(canvasPath), { recursive: true });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'export_canvas', status: 'started' }));
    const exportResult = await tools.exportCanvasPng({ outputPath: canvasPath });
    if (exportResult?.isError) {
      broadcast(panelEvent('error', { message: shortenTechnicalText(textFromToolResult(exportResult)), details: exportResult }));
      return;
    }

    const startedAtMs = Date.now();
    pendingProductRetouchLayers.push({ startedAtMs, mode, canvasPath });
    broadcast(panelEvent('tool_event', { server: 'codex', tool: 'product_retouch_layer', status: 'started' }));
    await appServer.startTurn(buildProductRetouchInput({
      canvasPath,
      target: targetFromToolResult(targetResult),
      references
    }));
    if (appServer.threadId) await store?.update?.({ threadId: appServer.threadId });
  }

  async function finishProductRetouchLayer(request) {
    const image = await waitForLatestCodexImage({
      searchDir: codexImageDir,
      afterMs: request.startedAtMs,
      timeoutMs: imageWaitTimeoutMs
    });
    if (!image) {
      broadcast(panelEvent('error', { message: 'Codex 已完成回复，但没有检测到新的局部返修结果图。可以重新生成一次。' }));
      return;
    }

    await readCodexImageFile({ searchDir: codexImageDir, filePath: image.path });
    const tools = createPhotoshopTools({ appServer, mode: request.mode });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'product_retouch_layer', status: 'started' }));
    const placeResult = await tools.placeImage({ filePath: image.path });
    if (placeResult?.isError) {
      broadcast(panelEvent('error', { message: `局部返修结果导入失败：${shortenTechnicalText(textFromToolResult(placeResult))}`, details: placeResult }));
      return;
    }

    const fitResult = await tools.fitActiveLayerToDocument({ fillDocument: true });
    const prepareResult = await tools.prepareRetouchResultLayer({ layerName: '返修 01' });
    if (prepareResult?.isError) {
      broadcast(panelEvent('error', { message: `返修图层已放入画布，但整理到局部返修组失败：${shortenTechnicalText(textFromToolResult(prepareResult))}`, details: prepareResult }));
      return;
    }

    const fitNote = fitResult?.isError
      ? `\n提示：图层已导入，但自动适配画布失败：${shortenTechnicalText(textFromToolResult(fitResult))}`
      : '';
    broadcast(panelEvent('assistant_delta', { text: `已生成并导入新的局部返修图层：${imageFileLabel(image.path)}。原图和替换结果未被覆盖。${fitNote}` }));
  }

  async function rollbackProductRetouch(mode = 'safe-auto') {
    const tools = createPhotoshopTools({ appServer, mode: normalizeMode(mode) });
    broadcast(panelEvent('tool_event', { server: 'photoshop', tool: 'hide_latest_retouch_layer', status: 'started' }));
    const result = await tools.hideLatestRetouchLayer();
    if (result?.isError) {
      broadcast(panelEvent('error', { message: shortenTechnicalText(textFromToolResult(result)), details: result }));
      return;
    }
    broadcast(panelEvent('assistant_delta', { text: '已回退上一版局部返修：最新可见返修图层已隐藏，原图和替换结果仍保留。' }));
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
    if (pendingProductTargetIdentifications.length > 0 && event.type === 'assistant_delta') {
      pendingProductTargetIdentifications[pendingProductTargetIdentifications.length - 1].text += event.text || '';
    }
    if (event.type !== 'raw_event') broadcast(event);

    if (notification?.method !== 'turn/completed') return;
    if (pendingProductTargetIdentifications.length > 0) {
      const request = pendingProductTargetIdentifications.shift();
      try {
        await finishProductTargetIdentification(request);
      } catch (error) {
        broadcast(panelEvent('error', { message: error.message }));
      }
    }
    if (pendingCodexImageImports.length > 0) {
      const request = pendingCodexImageImports.shift();
      try {
        await placeGeneratedCodexImage(request);
      } catch (error) {
        broadcast(panelEvent('error', { message: error.message }));
      }
    }
    if (pendingProductReplacementPreviews.length > 0) {
      const request = pendingProductReplacementPreviews.shift();
      try {
        await finishProductReplacementPreview(request);
      } catch (error) {
        broadcast(panelEvent('error', { message: error.message }));
      }
    }
    if (pendingProductRetouchLayers.length > 0) {
      const request = pendingProductRetouchLayers.shift();
      try {
        await finishProductRetouchLayer(request);
      } catch (error) {
        broadcast(panelEvent('error', { message: error.message }));
      }
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

      if (req.method === 'GET' && req.url?.startsWith('/product-reference')) {
        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        const filePath = url.searchParams.get('path');
        const image = await readProductReferenceFile({ referenceDir: productReferenceDir, filePath });
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

        if (body.type === 'upload_product_reference') {
          await saveProductReference({
            referenceDir: productReferenceDir,
            name: body.name,
            mimeType: body.mimeType,
            data: body.data
          });
          sendSocket(socket, panelEvent('product_references', { references: await listProductReferenceImages() }));
          return;
        }

        if (body.type === 'list_product_references') {
          sendSocket(socket, panelEvent('product_references', { references: await listProductReferenceImages() }));
          return;
        }

        if (body.type === 'delete_product_reference') {
          await deleteProductReference({
            referenceDir: productReferenceDir,
            filePath: body.path
          });
          sendSocket(socket, panelEvent('product_references', { references: await listProductReferenceImages() }));
          return;
        }

        if (body.type === 'create_product_target') {
          await createProductTarget(body.mode);
          return;
        }

        if (body.type === 'identify_product_target') {
          await identifyProductTarget(body.mode);
          return;
        }

        if (body.type === 'read_product_target') {
          await readProductTarget(body.mode);
          return;
        }

        if (body.type === 'lock_product_target') {
          await lockProductTarget(body.mode);
          return;
        }

        if (body.type === 'create_retouch_target') {
          await createRetouchTarget(body.mode);
          return;
        }

        if (body.type === 'read_retouch_target') {
          await readRetouchTarget(body.mode);
          return;
        }

        if (body.type === 'read_product_selection') {
          await readProductSelection(body.mode);
          return;
        }

        if (body.type === 'generate_product_replacement_preview') {
          await generateProductReplacementPreview(body);
          return;
        }

        if (body.type === 'import_product_replacement_preview') {
          await importProductReplacementPreview(body);
          return;
        }

        if (body.type === 'generate_product_retouch_layer' || body.type === 'generate_product_retouch_preview') {
          await generateProductRetouchLayer(body);
          return;
        }

        if (body.type === 'rollback_product_retouch') {
          await rollbackProductRetouch(body.mode);
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
