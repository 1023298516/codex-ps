import http from 'node:http';
import { panelEvent, serializeSse } from './events.js';
import { normalizeMode } from './policy.js';

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

export function createBridgeServer({ appServer, store, host = '127.0.0.1' } = {}) {
  const sseClients = new Set();

  function broadcast(event) {
    for (const res of sseClients) res.write(serializeSse(event));
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
        const mode = normalizeMode(body.mode);
        await store?.update?.({ mode });
        broadcast(panelEvent('user_message', { text: body.message, mode }));
        await appServer.startTurn(body.message);
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (error) {
      broadcast(panelEvent('error', { message: error.message }));
      sendJson(res, 500, { ok: false, error: error.message });
    }
  });

  return {
    listen(port = 17891) {
      return new Promise(resolve => listener.listen(port, host, () => resolve(listener)));
    },
    close() {
      return new Promise(resolve => listener.close(resolve));
    },
    broadcast
  };
}
