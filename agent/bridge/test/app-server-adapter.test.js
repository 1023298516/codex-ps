import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServerAdapter } from '../src/app-server-adapter.js';

function fakeClient() {
  const calls = [];
  return {
    calls,
    async request(method, params) {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      if (method === 'mcpServer/tool/call') return { content: [{ type: 'text', text: 'ok' }] };
      return {};
    }
  };
}

test('ensureThread starts a new Photoshop thread when no thread id exists', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client });
  assert.equal(await adapter.ensureThread(), 'thread-1');
  assert.equal(client.calls[0].method, 'thread/start');
});

test('startTurn sends message and thread id', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client });
  await adapter.ensureThread();
  await adapter.startTurn('hello');
  assert.deepEqual(client.calls[1], {
    method: 'turn/start',
    params: { threadId: 'thread-1', input: 'hello' }
  });
});

test('callMcpTool forwards server, tool, and arguments', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client });
  const result = await adapter.callMcpTool('photoshop', 'photoshop_place_latest_codex_image', { fitMode: 'fit' });
  assert.deepEqual(result, { content: [{ type: 'text', text: 'ok' }] });
  assert.equal(client.calls[0].method, 'mcpServer/tool/call');
});
