import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../src/store.js';

test('store defaults to safe-auto mode and empty log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-ps-store-'));
  try {
    const store = createStore(join(dir, 'state.json'));
    assert.equal((await store.read()).mode, 'safe-auto');
    assert.deepEqual((await store.read()).operationLog, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('store persists mode, thread id, and recent operation log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-ps-store-'));
  try {
    const store = createStore(join(dir, 'state.json'));
    await store.update({ mode: 'full-auto', threadId: 'thread-1' });
    await store.appendOperation({ type: 'tool_event', tool: 'photoshop_place_latest_codex_image' });
    const nextStore = createStore(join(dir, 'state.json'));
    const state = await nextStore.read();
    assert.equal(state.mode, 'full-auto');
    assert.equal(state.threadId, 'thread-1');
    assert.equal(state.operationLog.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
