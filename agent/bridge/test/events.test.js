import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppServerNotification, panelEvent } from '../src/events.js';

test('panelEvent returns a timestamped event envelope', () => {
  const event = panelEvent('status', { message: 'Connected' }, 1000);
  assert.deepEqual(event, { type: 'status', timestamp: 1000, message: 'Connected' });
});

test('normalizes turn text delta notifications', () => {
  const event = normalizeAppServerNotification({
    method: 'turn/output_text/delta',
    params: { delta: 'hello' }
  }, 2000);
  assert.deepEqual(event, { type: 'assistant_delta', timestamp: 2000, text: 'hello' });
});

test('normalizes app-server agent message deltas', () => {
  const event = normalizeAppServerNotification({
    method: 'item/agentMessage/delta',
    params: { delta: 'PS 面板链路测试成功' }
  }, 2500);
  assert.deepEqual(event, { type: 'assistant_delta', timestamp: 2500, text: 'PS 面板链路测试成功' });
});

test('normalizes tool call notifications', () => {
  const event = normalizeAppServerNotification({
    method: 'mcpServer/tool/call',
    params: { server: 'photoshop', tool: 'photoshop_place_latest_codex_image' }
  }, 3000);
  assert.deepEqual(event, {
    type: 'tool_event',
    timestamp: 3000,
    server: 'photoshop',
    tool: 'photoshop_place_latest_codex_image',
    status: 'started'
  });
});

test('normalizes turn completion', () => {
  const event = normalizeAppServerNotification({ method: 'turn/completed', params: {} }, 4000);
  assert.equal(event.type, 'turn_completed');
});

test('unknown notifications are preserved for debugging', () => {
  const event = normalizeAppServerNotification({ method: 'custom/event', params: { value: 1 } }, 5000);
  assert.equal(event.type, 'raw_event');
  assert.equal(event.method, 'custom/event');
  assert.deepEqual(event.params, { value: 1 });
});
