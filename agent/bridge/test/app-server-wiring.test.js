import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServerAdapter } from '../src/app-server-adapter.js';

test('app-server adapter can be constructed with an existing thread id', () => {
  const adapter = createAppServerAdapter({
    threadId: 'thread-existing',
    client: { request: async () => ({}) }
  });
  assert.equal(adapter.threadId, 'thread-existing');
});
