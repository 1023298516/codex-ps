import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEnvFile } from '../src/env.js';

test('loadEnvFile reads simple local environment files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-ps-env-'));
  try {
    const file = join(dir, '.env.local');
    await writeFile(file, 'OPENAI_API_KEY=sk-test\nLOG_LEVEL=\"1\"\n# ignored\nEMPTY=\n', 'utf8');
    assert.deepEqual(await loadEnvFile(file), {
      OPENAI_API_KEY: 'sk-test',
      LOG_LEVEL: '1',
      EMPTY: ''
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadEnvFile returns empty object when the file is missing', async () => {
  assert.deepEqual(await loadEnvFile('/tmp/codex-ps-missing-env-file'), {});
});
