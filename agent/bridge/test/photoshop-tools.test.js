import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoshopTools } from '../src/photoshop-tools.js';

function fakeAppServer() {
  const calls = [];
  return {
    calls,
    async callMcpTool(server, tool, args) {
      calls.push({ server, tool, args });
      return { content: [{ type: 'text', text: `${tool}: ok` }] };
    }
  };
}

test('safe-auto imports latest Codex image through Photoshop MCP', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.placeLatestCodexImage({ fitMode: 'fit' });
  assert.deepEqual(appServer.calls[0], {
    server: 'photoshop',
    tool: 'photoshop_place_latest_codex_image',
    args: { fitMode: 'fit', layerName: 'Codex Generated Image' }
  });
});

test('safe-auto places a specific image through Photoshop MCP', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.placeImage({ filePath: '/tmp/pig.png' });
  assert.deepEqual(appServer.calls[0], {
    server: 'photoshop',
    tool: 'photoshop_place_image',
    args: {
      filePath: '/tmp/pig.png',
      x: 0,
      y: 0
    }
  });
});

test('safe-auto opens a generated image as a Photoshop document', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.openImage({ filePath: '/tmp/pig.png' });
  assert.deepEqual(appServer.calls[0], {
    server: 'photoshop',
    tool: 'photoshop_open_image',
    args: {
      filePath: '/tmp/pig.png'
    }
  });
});

test('safe-auto fits the active layer to the document through Photoshop MCP', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.fitActiveLayerToDocument();
  assert.deepEqual(appServer.calls[0], {
    server: 'photoshop',
    tool: 'photoshop_fit_layer_to_document',
    args: { fillDocument: false }
  });
});

test('safe-auto blocks destructive actions', async () => {
  const tools = createPhotoshopTools({ appServer: fakeAppServer(), mode: 'safe-auto' });
  await assert.rejects(() => tools.deleteLayer({ layerId: 7 }), /delete_layer blocked in B safe-auto mode/);
});

test('full-auto still requires protection for delete', async () => {
  const tools = createPhotoshopTools({ appServer: fakeAppServer(), mode: 'full-auto' });
  await assert.rejects(() => tools.deleteLayer({ layerId: 7 }), /requires a protection point/);
});
