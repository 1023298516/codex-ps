export function panelEvent(type, payload = {}, timestamp = Date.now()) {
  return { type, timestamp, ...payload };
}

function imagePathForItem(item = {}) {
  return item.savedPath || item.outputPath || item.path || item.result?.savedPath || null;
}

function stripGeneratedImagePayloads(value) {
  if (Array.isArray(value)) return value.map(stripGeneratedImagePayloads);
  if (!value || typeof value !== 'object') return value;

  const copy = {};
  for (const [key, itemValue] of Object.entries(value)) {
    if (key === 'result' && value.type === 'imageGeneration') continue;
    copy[key] = stripGeneratedImagePayloads(itemValue);
  }
  return copy;
}

export function normalizeAppServerNotification(message, timestamp = Date.now()) {
  const method = message?.method || '';
  const params = message?.params || {};
  const item = params.item || {};

  if (
    method === 'turn/output_text/delta' ||
    method === 'turn/output_text_delta' ||
    method === 'item/agentMessage/delta'
  ) {
    return panelEvent('assistant_delta', { text: params.delta || params.text || '' }, timestamp);
  }

  if (method === 'mcpServer/tool/call') {
    return panelEvent('tool_event', {
      server: params.server || params.serverName || 'unknown',
      tool: params.tool || params.toolName || 'unknown',
      status: 'started'
    }, timestamp);
  }

  if ((method === 'item/started' || method === 'item/completed') && item.type === 'imageGeneration') {
    return panelEvent('tool_event', {
      server: 'codex',
      tool: 'image_generation',
      status: method === 'item/completed' ? 'completed' : 'started',
      imagePath: imagePathForItem(item)
    }, timestamp);
  }

  if (method === 'turn/completed') {
    return panelEvent('turn_completed', { result: stripGeneratedImagePayloads(params) }, timestamp);
  }

  if (method === 'error') {
    return panelEvent('error', { message: params.message || 'Codex app-server error', details: params }, timestamp);
  }

  return panelEvent('raw_event', { method, params: stripGeneratedImagePayloads(params) }, timestamp);
}

export function serializeSse(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
