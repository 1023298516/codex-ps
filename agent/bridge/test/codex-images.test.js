import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { listCodexImages, latestCodexImage, readCodexImageFile, waitForLatestCodexImage } from '../src/codex-images.js';

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

test('listCodexImages returns recent images for gallery display', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-ps-images-'));
  try {
    const threadDir = join(dir, 'thread');
    await mkdir(threadDir);
    const firstPath = join(dir, 'first.png');
    const secondPath = join(threadDir, 'second.jpg');
    await writeFile(firstPath, 'first', 'utf8');
    await new Promise(resolve => setTimeout(resolve, 5));
    await writeFile(secondPath, 'second', 'utf8');

    const images = await listCodexImages({ searchDir: dir, limit: 10 });
    assert.deepEqual(images.map(image => image.path), [secondPath, firstPath]);
    assert.equal(images[0].name, 'second.jpg');
    assert.equal(images[0].previewUrl, `/gallery-image?path=${encodeURIComponent(secondPath)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readCodexImageFile only serves generated image files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-ps-images-'));
  const outsideDir = await mkdtemp(join(tmpdir(), 'codex-ps-outside-'));
  try {
    const imagePath = join(dir, 'image.png');
    const textPath = join(dir, 'note.txt');
    const outsidePath = join(outsideDir, 'outside.png');
    await writeFile(imagePath, 'png bytes', 'utf8');
    await writeFile(textPath, 'not image', 'utf8');
    await writeFile(outsidePath, 'outside', 'utf8');

    const image = await readCodexImageFile({ searchDir: dir, filePath: imagePath });
    assert.equal(image.contentType, 'image/png');
    assert.equal(image.buffer.toString('utf8'), 'png bytes');
    await assert.rejects(() => readCodexImageFile({ searchDir: dir, filePath: textPath }), /Unsupported image file/);
    await assert.rejects(() => readCodexImageFile({ searchDir: dir, filePath: outsidePath }), /outside generated images/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  }
});
