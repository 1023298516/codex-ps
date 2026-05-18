import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { latestCodexImage, waitForLatestCodexImage } from '../src/codex-images.js';

test('latestCodexImage finds the newest image after a timestamp', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-ps-images-'));
  try {
    const oldPath = join(dir, 'old.png');
    const newDir = join(dir, 'thread');
    const newPath = join(newDir, 'new.png');
    await writeFile(oldPath, 'old', 'utf8');
    const afterMs = Date.now();
    await new Promise(resolve => setTimeout(resolve, 5));
    await mkdir(newDir);
    await writeFile(newPath, 'new', 'utf8');

    const image = await latestCodexImage({ searchDir: dir, afterMs });
    assert.equal(image.path, newPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('waitForLatestCodexImage returns null when no new image appears', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-ps-images-'));
  try {
    const image = await waitForLatestCodexImage({
      searchDir: dir,
      afterMs: Date.now(),
      timeoutMs: 5,
      intervalMs: 1
    });
    assert.equal(image, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
