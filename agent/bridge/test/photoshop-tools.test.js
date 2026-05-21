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

test('safe-auto creates a visible product target layer through Photoshop MCP', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.createProductTargetLayer();
  assert.equal(appServer.calls[0].server, 'photoshop');
  assert.equal(appServer.calls[0].tool, 'photoshop_execute_script');
  assert.match(appServer.calls[0].args.code, /圈选目标组/);
  assert.match(appServer.calls[0].args.code, /目标 01/);
});

test('safe-auto reads product target layer bounds through Photoshop MCP', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.readProductTargetLayer();
  assert.equal(appServer.calls[0].server, 'photoshop');
  assert.equal(appServer.calls[0].tool, 'photoshop_execute_script');
  assert.match(appServer.calls[0].args.code, /目标 01/);
  assert.match(appServer.calls[0].args.code, /bounds/);
});

test('safe-auto reads current Photoshop selection bounds through Photoshop MCP', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.readSelectionBounds();
  assert.equal(appServer.calls[0].server, 'photoshop');
  assert.equal(appServer.calls[0].tool, 'photoshop_execute_script');
  assert.match(appServer.calls[0].args.code, /doc\.selection\.bounds/);
  assert.match(appServer.calls[0].args.code, /没有检测到 Photoshop 选区/);
});

test('safe-auto exports the current canvas for product replacement preview generation', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.exportCanvasPng({ outputPath: '/tmp/detail-page.png' });
  assert.deepEqual(appServer.calls[0], {
    server: 'photoshop',
    tool: 'photoshop_export_canvas_png',
    args: { outputPath: '/tmp/detail-page.png' }
  });
});

test('safe-auto prepares the imported replacement result as a named result layer', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.prepareReplacementResultLayer({ layerName: '替换结果 01' });
  assert.equal(appServer.calls[0].server, 'photoshop');
  assert.equal(appServer.calls[0].tool, 'photoshop_execute_script');
  assert.match(appServer.calls[0].args.code, /替换结果组/);
  assert.match(appServer.calls[0].args.code, /替换结果 01/);
});

test('safe-auto creates and reads a visible local retouch target layer', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.createRetouchTargetLayer();
  await tools.readRetouchTargetLayer();

  assert.equal(appServer.calls[0].tool, 'photoshop_execute_script');
  assert.match(appServer.calls[0].args.code, /返修区域组/);
  assert.match(appServer.calls[0].args.code, /返修区域 01/);
  assert.equal(appServer.calls[1].tool, 'photoshop_execute_script');
  assert.match(appServer.calls[1].args.code, /返修区域 01/);
  assert.match(appServer.calls[1].args.code, /bounds/);
});

test('safe-auto prepares imported local retouch output as an independent retouch layer', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.prepareRetouchResultLayer({ layerName: '返修 01' });

  assert.equal(appServer.calls[0].server, 'photoshop');
  assert.equal(appServer.calls[0].tool, 'photoshop_execute_script');
  assert.match(appServer.calls[0].args.code, /局部返修组/);
  assert.match(appServer.calls[0].args.code, /返修 01/);
});

test('safe-auto hides the latest visible retouch layer for rollback', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.hideLatestRetouchLayer();

  assert.equal(appServer.calls[0].server, 'photoshop');
  assert.equal(appServer.calls[0].tool, 'photoshop_execute_script');
  assert.match(appServer.calls[0].args.code, /局部返修组/);
  assert.match(appServer.calls[0].args.code, /visible = false/);
});

test('safe-auto blocks destructive actions', async () => {
  const tools = createPhotoshopTools({ appServer: fakeAppServer(), mode: 'safe-auto' });
  await assert.rejects(() => tools.deleteLayer({ layerId: 7 }), /delete_layer blocked in B safe-auto mode/);
});

test('full-auto still requires protection for delete', async () => {
  const tools = createPhotoshopTools({ appServer: fakeAppServer(), mode: 'full-auto' });
  await assert.rejects(() => tools.deleteLayer({ layerId: 7 }), /requires a protection point/);
});
