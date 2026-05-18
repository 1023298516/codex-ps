import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = '/Users/susu/Documents/Codex/2026-05-15/codex-ps';
const packageDir = `${root}/photoshop-mcp-local`;
const nodeBin = '/Users/susu/.local/bin/node';
const tmpDir = `${root}/tmp/photoshop-mcp-smoke`;

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseText(result) {
  const content = result?.content ?? result?.result?.content ?? [];
  return content.map((item) => item.text ?? '').join('\n');
}

class McpClient {
  constructor() {
    this.child = null;
    this.nextId = 1;
    this.buffer = '';
    this.pending = new Map();
    this.stderr = '';
  }

  async start() {
    this.child = spawn(nodeBin, ['dist/index.js'], {
      cwd: packageDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, timeout } = this.pending.get(msg.id);
          clearTimeout(timeout);
          this.pending.delete(msg.id);
          resolve(msg);
        }
      }
    });

    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk.toString();
    });

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'photoshop-mcp-smoke-test', version: '0.1.0' },
    });
    this.notify('notifications/initialized', {});
  }

  request(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout:${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  call(name, args = {}, timeoutMs = 30000) {
    return this.request('tools/call', { name, arguments: args }, timeoutMs);
  }

  stop() {
    if (this.child && !this.child.killed) this.child.kill('SIGTERM');
  }
}

async function withClient(fn) {
  const client = new McpClient();
  await client.start();
  try {
    return await fn(client);
  } finally {
    client.stop();
    await delay(150);
  }
}

async function runTool(name, args = {}, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const expectError = options.expectError ?? false;
  const started = Date.now();
  try {
    const msg = await withClient((client) => client.call(name, args, timeoutMs));
    const result = msg.result;
    const isError = Boolean(result?.isError);
    const ok = expectError ? isError : !isError;
    return {
      name,
      ok,
      status: ok ? 'PASS' : 'FAIL',
      ms: Date.now() - started,
      text: parseText(result),
      raw: result,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 'TIMEOUT',
      ms: Date.now() - started,
      text: error.message,
    };
  }
}

async function runInSession(steps) {
  const results = [];
  const client = new McpClient();
  await client.start();
  try {
    for (const step of steps) {
      const started = Date.now();
      try {
        const msg = await client.call(step.name, step.args ?? {}, step.timeoutMs ?? 30000);
        const result = msg.result;
        const isError = Boolean(result?.isError);
        const expectError = Boolean(step.expectError);
        results.push({
          name: step.name,
          ok: expectError ? isError : !isError,
          status: expectError ? (isError ? 'PASS' : 'FAIL') : isError ? 'FAIL' : 'PASS',
          ms: Date.now() - started,
          text: parseText(result),
        });
      } catch (error) {
        results.push({
          name: step.name,
          ok: false,
          status: 'TIMEOUT',
          ms: Date.now() - started,
          text: error.message,
        });
        break;
      }
    }
  } finally {
    client.stop();
    await delay(150);
  }
  return results;
}

async function main() {
  await mkdir(tmpDir, { recursive: true });
  const imagePath = join(tmpDir, 'place-test.png');
  await writeFile(imagePath, Buffer.from(pngBase64, 'base64'));

  const allResults = [];

  allResults.push(await runTool('photoshop_ping'));
  allResults.push(await runTool('photoshop_get_version'));

  allResults.push(
    ...(await runInSession([
      { name: 'photoshop_create_document', args: { width: 640, height: 480, resolution: 72, colorMode: 'RGB' } },
      { name: 'photoshop_get_document_info', timeoutMs: 35000 },
      { name: 'photoshop_create_layer', args: { name: 'Smoke Fill' } },
      { name: 'photoshop_fill_layer', args: { red: 24, green: 120, blue: 210 } },
      { name: 'photoshop_get_layers' },
      { name: 'photoshop_create_text_layer', args: { text: 'Smoke Test', x: 160, y: 160, fontSize: 36 } },
      { name: 'photoshop_set_text_font', args: { fontName: 'Helvetica', fontSize: 40 } },
      { name: 'photoshop_set_text_color', args: { red: 255, green: 255, blue: 255 } },
      { name: 'photoshop_set_text_alignment', args: { alignment: 'CENTER' } },
      { name: 'photoshop_update_text_content', args: { text: 'MCP OK' } },
      { name: 'photoshop_rename_layer', args: { name: 'Smoke Text' } },
      { name: 'photoshop_duplicate_layer', args: { newName: 'Smoke Text Copy' } },
      { name: 'photoshop_set_layer_opacity', args: { opacity: 80 } },
      { name: 'photoshop_set_layer_blend_mode', args: { blendMode: 'NORMAL' } },
      { name: 'photoshop_set_layer_visibility', args: { visible: false } },
      { name: 'photoshop_set_layer_visibility', args: { visible: true } },
      { name: 'photoshop_set_layer_locked', args: { locked: true } },
      { name: 'photoshop_set_layer_locked', args: { locked: false } },
      { name: 'photoshop_move_layer', args: { deltaX: 10, deltaY: 10 } },
      { name: 'photoshop_scale_layer', args: { scalePercent: 90, centerAnchor: true } },
      { name: 'photoshop_rotate_layer', args: { degrees: 5 } },
      { name: 'photoshop_rasterize_layer' },
      { name: 'photoshop_apply_gaussian_blur', args: { radius: 1.5 } },
      { name: 'photoshop_apply_sharpen', args: { amount: 80, radius: 1.0, threshold: 0 } },
      { name: 'photoshop_apply_noise', args: { amount: 2, distribution: 'UNIFORM', monochromatic: true } },
      { name: 'photoshop_apply_motion_blur', args: { angle: 30, radius: 3 } },
      { name: 'photoshop_adjust_brightness_contrast', args: { brightness: 5, contrast: 5 } },
      { name: 'photoshop_adjust_hue_saturation', args: { hue: 5, saturation: 5, lightness: 0 } },
      { name: 'photoshop_auto_levels' },
      { name: 'photoshop_auto_contrast' },
      { name: 'photoshop_desaturate' },
      { name: 'photoshop_invert' },
      { name: 'photoshop_select_rectangle', args: { left: 30, top: 30, right: 300, bottom: 250 } },
      { name: 'photoshop_invert_selection' },
      { name: 'photoshop_create_layer_mask' },
      { name: 'photoshop_delete_layer_mask' },
      { name: 'photoshop_select_all' },
      { name: 'photoshop_deselect' },
      { name: 'photoshop_select_rectangle', args: { left: 50, top: 50, right: 260, bottom: 260 } },
      { name: 'photoshop_create_layer_mask' },
      { name: 'photoshop_apply_layer_mask' },
      { name: 'photoshop_deselect' },
      { name: 'photoshop_place_image', args: { filePath: imagePath, x: 20, y: 20 } },
      { name: 'photoshop_fit_layer_to_document', args: { fillDocument: false } },
      { name: 'photoshop_move_layer_to_top' },
      { name: 'photoshop_move_layer_down' },
      { name: 'photoshop_move_layer_up' },
      { name: 'photoshop_move_layer_to_bottom' },
      { name: 'photoshop_move_layer_to_position', args: { targetLayerName: 'Smoke Fill', position: 'ABOVE' } },
      { name: 'photoshop_get_history' },
      { name: 'photoshop_create_layer', args: { name: 'Undo Probe' } },
      { name: 'photoshop_undo', args: { steps: 1 } },
      { name: 'photoshop_redo', args: { steps: 1 } },
      { name: 'photoshop_save_document', args: { path: join(tmpDir, 'smoke-test.png'), format: 'PNG' } },
      { name: 'photoshop_save_document', args: { path: join(tmpDir, 'smoke-test.jpg'), format: 'JPEG', quality: 8 } },
      { name: 'photoshop_save_document', args: { path: join(tmpDir, 'smoke-test.psd'), format: 'PSD' } },
      { name: 'photoshop_close_document', args: { save: false } },
    ]))
  );

  allResults.push(
    ...(await runInSession([
      { name: 'photoshop_create_document', args: { width: 320, height: 240, resolution: 72, colorMode: 'RGB' } },
      { name: 'photoshop_create_layer', args: { name: 'Merge A' } },
      { name: 'photoshop_fill_layer', args: { red: 200, green: 20, blue: 20 } },
      { name: 'photoshop_create_layer', args: { name: 'Merge B' } },
      { name: 'photoshop_fill_layer', args: { red: 20, green: 200, blue: 20 } },
      { name: 'photoshop_merge_visible_layers' },
      { name: 'photoshop_flatten_image' },
      { name: 'photoshop_close_document', args: { save: false } },
    ]))
  );

  allResults.push(
    ...(await runInSession([
      { name: 'photoshop_open_image', args: { filePath: imagePath } },
      { name: 'photoshop_resize_image', args: { width: 128, height: 128 } },
      { name: 'photoshop_crop_document', args: { left: 0, top: 0, right: 64, bottom: 64 } },
      { name: 'photoshop_close_document', args: { save: false } },
    ]))
  );

  allResults.push(
    await runTool('photoshop_play_action', { actionName: '__missing_action__', actionSetName: '__missing_set__' }, { expectError: true })
  );
  allResults.push(
    await runTool('photoshop_execute_script', {
      code: "return 'script-ok';",
    })
  );
  allResults.push(
    await runTool('photoshop_delete_layer', {}, { expectError: true })
  );

  const summary = {
    pass: allResults.filter((r) => r.status === 'PASS').length,
    fail: allResults.filter((r) => r.status === 'FAIL').length,
    timeout: allResults.filter((r) => r.status === 'TIMEOUT').length,
    total: allResults.length,
  };

  console.log(JSON.stringify({ summary, results: allResults }, null, 2));
  if (summary.fail || summary.timeout) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
