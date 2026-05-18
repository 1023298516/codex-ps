import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createJsonRpcClient } from '../src/json-rpc-client.js';

test('JSON-RPC client writes requests and resolves responses', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const client = createJsonRpcClient({ input, output });

  const responsePromise = client.request('thread/start', { title: 'Codex PS' });
  const sent = JSON.parse(output.read().toString('utf8'));
  assert.equal(sent.jsonrpc, '2.0');
  assert.equal(sent.method, 'thread/start');
  assert.deepEqual(sent.params, { title: 'Codex PS' });

  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { thread: { id: 't1' } } })}\n`);
  assert.deepEqual(await responsePromise, { thread: { id: 't1' } });
});

test('JSON-RPC client emits notifications', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const notifications = [];
  createJsonRpcClient({ input, output, onNotification: event => notifications.push(event) });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { ok: true } })}\n`);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(notifications, [{ method: 'turn/completed', params: { ok: true } }]);
});
