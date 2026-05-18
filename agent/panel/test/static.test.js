import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';

test('panel manifest declares a Photoshop panel', async () => {
  const manifest = JSON.parse(await readFile('agent/panel/manifest.json', 'utf8'));
  assert.equal(manifest.id, 'com.codex.ps.agent.uxp');
  assert.equal(manifest.manifestVersion, 4);
  assert.equal(manifest.host[0].app, 'PS');
  assert.equal(manifest.entrypoints[0].type, 'panel');
  assert.equal(manifest.entrypoints[0].id, 'codexps');
  assert.ok(manifest.entrypoints[0].icons.length > 0);
  assert.ok(manifest.icons.length > 0);
  assert.equal(manifest.requiredPermissions, undefined);
});

test('panel copy does not mention template slot mapping', async () => {
  const html = await readFile('agent/panel/index.html', 'utf8');
  const js = await readFile('agent/panel/panel.js', 'utf8');
  assert.doesNotMatch(`${html}\n${js}`, /模板|插槽|IMG_MAIN|LOGO/);
});

test('panel uses WebSocket transport for UXP local bridge access', async () => {
  const html = await readFile('agent/panel/index.html', 'utf8');
  const js = await readFile('agent/panel/panel.js', 'utf8');
  assert.match(js, /ws:\/\/127\.0\.0\.1:17891\/socket/);
  assert.match(js, /http:\/\/127\.0\.0\.1:17891/);
  assert.doesNotMatch(`${html}\n${js}`, /EventSource/);
});

test('panel coalesces streaming assistant text into one event', async () => {
  const js = await readFile('agent/panel/panel.js', 'utf8');
  assert.match(js, /event\.type === 'assistant_delta'/);
  assert.match(js, /activeAssistantEvent\.dataset\.rawText \+= event\.text/);
  assert.match(js, /activeAssistantEvent\.textContent = compactDisplayText/);
});

test('panel hides raw app-server transport events', async () => {
  const js = await readFile('agent/panel/panel.js', 'utf8');
  assert.match(js, /event\.type === 'raw_event'/);
});

test('panel hides echoed bridge user messages', async () => {
  const js = await readFile('agent/panel/panel.js', 'utf8');
  assert.match(js, /event\.type === 'user_message'/);
});

test('panel exposes a gallery modal for generated images', async () => {
  const html = await readFile('agent/panel/index.html', 'utf8');
  assert.match(html, /id="gallery-open"/);
  assert.match(html, /id="gallery-modal"/);
  assert.match(html, /id="gallery-grid"/);
  assert.match(html, /id="gallery-import-selected"/);
  assert.match(html, /id="preview-modal"/);
  assert.match(html, /id="preview-import"/);
});

test('panel can request gallery images and import multiple selections', async () => {
  const js = await readFile('agent/panel/panel.js', 'utf8');
  assert.match(js, /type: 'list_gallery'/);
  assert.match(js, /event\.type === 'gallery_images'/);
  assert.match(js, /type: 'import_images'/);
  assert.match(js, /selectedImagePaths/);
  assert.match(js, /openImportPreview/);
  assert.match(js, /confirmImportPreview/);
});

test('panel compacts verbose technical output before rendering logs', async () => {
  const js = await readFile('agent/panel/panel.js', 'utf8');
  assert.match(js, /compactDisplayText/);
  assert.match(js, /MAX_TECHNICAL_EVENT_LENGTH/);
  assert.match(js, /TOOL_LABELS/);
  assert.match(js, /已隐藏较长技术细节/);
});

test('panel manifest icon files exist for UXP loading', async () => {
  const manifest = JSON.parse(await readFile('agent/panel/manifest.json', 'utf8'));
  const iconPaths = [
    ...manifest.entrypoints.flatMap(entry => entry.icons?.map(icon => icon.path) || []),
    ...manifest.icons.map(icon => icon.path)
  ];
  await Promise.all(iconPaths.map(path => access(`agent/panel/${path}`)));
});
