import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CODEX_IMAGE_DIR = join(homedir(), '.codex', 'generated_images');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff']);

function imageExt(filePath) {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot) : '';
}

async function collectImages(dir, options = {}, depth = 0) {
  const maxDepth = options.maxDepth ?? 4;
  if (depth > maxDepth) return [];

  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const images = [];
  for (const dirent of dirents) {
    const fullPath = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      images.push(...(await collectImages(fullPath, options, depth + 1)));
      continue;
    }

    if (!dirent.isFile() || !IMAGE_EXTENSIONS.has(imageExt(fullPath))) continue;
    try {
      const info = await stat(fullPath);
      images.push({
        path: fullPath,
        size: info.size,
        mtimeMs: info.mtimeMs,
        modified: info.mtime.toISOString()
      });
    } catch {
      // Ignore files that disappear while scanning.
    }
  }
  return images;
}

export async function latestCodexImage({ searchDir = DEFAULT_CODEX_IMAGE_DIR, afterMs = 0 } = {}) {
  const images = await collectImages(searchDir);
  return images
    .filter(image => image.mtimeMs >= afterMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0] || null;
}

export async function waitForLatestCodexImage({
  searchDir = DEFAULT_CODEX_IMAGE_DIR,
  afterMs = 0,
  timeoutMs = 15000,
  intervalMs = 500
} = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const image = await latestCodexImage({ searchDir, afterMs });
    if (image) return image;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return null;
}
