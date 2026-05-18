export function panelEvent(type, payload = {}, timestamp = Date.now()) {
  return { type, timestamp, ...payload };
}

export function normalizeAppServerNotification(message, timestamp = Date.now()) {
  const method = message?.method || '';
  const params = message?.params || {};

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

  if (method === 'turn/completed') {
    return panelEvent('turn_completed', { result: params }, timestamp);
  }

  if (method === 'error') {
    return panelEvent('error', { message: params.message || 'Codex app-server error', details: params }, timestamp);
  }

  return panelEvent('raw_event', { method, params }, timestamp);
}

export function serializeSse(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
