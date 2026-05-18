import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('panel manifest declares a Photoshop panel', async () => {
  const manifest = JSON.parse(await readFile('agent/panel/manifest.json', 'utf8'));
  assert.equal(manifest.host[0].app, 'PS');
  assert.equal(manifest.entrypoints[0].type, 'panel');
});

test('panel copy does not mention template slot mapping', async () => {
  const html = await readFile('agent/panel/index.html', 'utf8');
  const js = await readFile('agent/panel/panel.js', 'utf8');
  assert.doesNotMatch(`${html}\n${js}`, /模板|插槽|IMG_MAIN|LOGO/);
});
