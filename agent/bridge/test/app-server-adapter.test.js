import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServerAdapter } from '../src/app-server-adapter.js';

function fakeClient() {
  const calls = [];
  return {
    calls,
    async request(method, params) {
      calls.push({ method, params });
      if (method === 'initialize') return { serverInfo: { name: 'codex-app-server' } };
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      if (method === 'mcpServer/tool/call') return { content: [{ type: 'text', text: 'ok' }] };
      return {};
    }
  };
}

test('ensureThread starts a new Photoshop thread when no thread id exists', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client, cwd: '/tmp/codex-ps' });
  assert.equal(await adapter.ensureThread(), 'thread-1');
  assert.deepEqual(client.calls[0], {
    method: 'initialize',
    params: {
      clientInfo: { name: 'codex-ps-agent', version: '0.1.0' },
      capabilities: { experimentalApi: true }
    }
  });
  assert.deepEqual(client.calls[1], {
    method: 'thread/start',
    params: { cwd: '/tmp/codex-ps', threadSource: 'user' }
  });
});

test('startTurn sends app-server text input items and thread id', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client });
  await adapter.startTurn('hello');
  assert.deepEqual(client.calls[2], {
    method: 'turn/start',
    params: { threadId: 'thread-1', input: [{ type: 'text', text: 'hello' }] }
  });
});

test('callMcpTool forwards server, tool, and arguments', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client });
  const result = await adapter.callMcpTool('photoshop', 'photoshop_place_latest_codex_image', { fitMode: 'fit' });
  assert.deepEqual(result, { content: [{ type: 'text', text: 'ok' }] });
  assert.equal(client.calls[1].method, 'mcpServer/tool/call');
});
