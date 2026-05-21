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

test('startTurn recovers when a persisted thread is missing', async () => {
  const calls = [];
  let failedOnce = false;
  const client = {
    calls,
    async request(method, params) {
      calls.push({ method, params });
      if (method === 'initialize') return { serverInfo: { name: 'codex-app-server' } };
      if (method === 'thread/start') return { thread: { id: 'thread-new' } };
      if (method === 'turn/start' && params.threadId === 'thread-old' && !failedOnce) {
        failedOnce = true;
        throw new Error('thread not found: thread-old');
      }
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      return {};
    }
  };

  const adapter = createAppServerAdapter({ client, threadId: 'thread-old' });
  await adapter.startTurn('hello');

  assert.equal(adapter.threadId, 'thread-new');
  assert.deepEqual(client.calls.map(call => call.method), [
    'initialize',
    'turn/start',
    'thread/start',
    'turn/start'
  ]);
  assert.equal(client.calls[1].params.threadId, 'thread-old');
  assert.equal(client.calls[3].params.threadId, 'thread-new');
});

test('callMcpTool forwards server, tool, and arguments', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client });
  const result = await adapter.callMcpTool('photoshop', 'photoshop_place_latest_codex_image', { fitMode: 'fit' });
  assert.deepEqual(result, { content: [{ type: 'text', text: 'ok' }] });
  assert.deepEqual(client.calls[2], {
    method: 'mcpServer/tool/call',
    params: {
      server: 'photoshop',
      threadId: 'thread-1',
      tool: 'photoshop_place_latest_codex_image',
      arguments: { fitMode: 'fit' }
    }
  });
});

test('callMcpTool recovers when a persisted thread is missing', async () => {
  const calls = [];
  let failedOnce = false;
  const client = {
    calls,
    async request(method, params) {
      calls.push({ method, params });
      if (method === 'initialize') return { serverInfo: { name: 'codex-app-server' } };
      if (method === 'thread/start') return { thread: { id: 'thread-new' } };
      if (method === 'mcpServer/tool/call' && params.threadId === 'thread-old' && !failedOnce) {
        failedOnce = true;
        throw new Error('thread not found: thread-old');
      }
      if (method === 'mcpServer/tool/call') return { content: [{ type: 'text', text: 'ok' }] };
      return {};
    }
  };

  const adapter = createAppServerAdapter({ client, threadId: 'thread-old' });
  await adapter.callMcpTool('photoshop', 'photoshop_get_document_info', {});

  assert.equal(adapter.threadId, 'thread-new');
  assert.deepEqual(client.calls.map(call => call.method), [
    'initialize',
    'mcpServer/tool/call',
    'thread/start',
    'mcpServer/tool/call'
  ]);
  assert.equal(client.calls[1].params.threadId, 'thread-old');
  assert.equal(client.calls[3].params.threadId, 'thread-new');
});
