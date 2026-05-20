import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildProductIdentificationInput,
  buildProductReplacementInput,
  buildProductRetouchInput,
  deleteProductReference,
  listProductReferences,
  parseProductIdentificationTargets,
  readProductReferenceFile,
  saveProductReference
} from '../src/product-replacement.js';

test('saves uploaded product reference images for later preview generation', async () => {
  const referenceDir = await mkdtemp(join(tmpdir(), 'codex-ps-product-refs-'));
  try {
    const saved = await saveProductReference({
      referenceDir,
      name: 'Front Bottle.PNG',
      mimeType: 'image/png',
      data: Buffer.from('fake png').toString('base64')
    });

    assert.equal(saved.name, 'Front Bottle.png');
    assert.equal(saved.mimeType, 'image/png');
    assert.equal(saved.previewUrl, `/product-reference?path=${encodeURIComponent(saved.path)}`);
    assert.equal(await readFile(saved.path, 'utf8'), 'fake png');
  } finally {
    await rm(referenceDir, { recursive: true, force: true });
  }
});

test('rejects non-image product references', async () => {
  const referenceDir = await mkdtemp(join(tmpdir(), 'codex-ps-product-refs-'));
  try {
    await assert.rejects(() => saveProductReference({
      referenceDir,
      name: 'notes.txt',
      mimeType: 'text/plain',
      data: Buffer.from('not image').toString('base64')
    }), /只支持上传图片/);
  } finally {
    await rm(referenceDir, { recursive: true, force: true });
  }
});

test('lists product references newest first and serves only files inside the reference directory', async () => {
  const referenceDir = await mkdtemp(join(tmpdir(), 'codex-ps-product-refs-'));
  try {
    const first = await saveProductReference({
      referenceDir,
      name: 'front.png',
      mimeType: 'image/png',
      data: Buffer.from('front').toString('base64')
    });
    const second = await saveProductReference({
      referenceDir,
      name: 'side.jpg',
      mimeType: 'image/jpeg',
      data: Buffer.from('side').toString('base64')
    });

    const references = await listProductReferences({ referenceDir });
    assert.equal(references.length, 2);
    assert.equal(references[0].path, second.path);
    assert.equal(references[1].path, first.path);

    const served = await readProductReferenceFile({ referenceDir, filePath: second.path });
    assert.equal(served.contentType, 'image/jpeg');
    assert.equal(served.buffer.toString('utf8'), 'side');

    await assert.rejects(() => readProductReferenceFile({
      referenceDir,
      filePath: join(referenceDir, '..', 'outside.png')
    }), /参考图目录之外/);
  } finally {
    await rm(referenceDir, { recursive: true, force: true });
  }
});

test('deletes one uploaded product reference inside the reference directory', async () => {
  const referenceDir = await mkdtemp(join(tmpdir(), 'codex-ps-product-refs-'));
  try {
    const saved = await saveProductReference({
      referenceDir,
      name: 'front.png',
      mimeType: 'image/png',
      data: Buffer.from('front').toString('base64')
    });

    const result = await deleteProductReference({ referenceDir, filePath: saved.path });

    assert.equal(result.deleted, true);
    assert.equal(result.path, saved.path);
    assert.equal((await listProductReferences({ referenceDir })).length, 0);
    await assert.rejects(() => readFile(saved.path, 'utf8'));
    await assert.rejects(() => deleteProductReference({
      referenceDir,
      filePath: join(referenceDir, '..', 'outside.png')
    }), /参考图目录之外/);
  } finally {
    await rm(referenceDir, { recursive: true, force: true });
  }
});

test('builds Codex image-generation input with anti-hallucination and style-fusion constraints', () => {
  const input = buildProductReplacementInput({
    canvasPath: '/tmp/detail-page.png',
    target: { bounds: { left: 10, top: 20, right: 210, bottom: 420 } },
    references: [
      { path: '/tmp/front.png', name: 'front.png', role: 'main' },
      { path: '/tmp/side.png', name: 'side.png' }
    ]
  });

  assert.equal(input[0].type, 'text');
  assert.match(input[0].text, /双向结合/);
  assert.match(input[0].text, /单一替换/);
  assert.match(input[0].text, /只替换 1 个主要产品目标/);
  assert.match(input[0].text, /产品保真/);
  assert.match(input[0].text, /画面融合/);
  assert.match(input[0].text, /主产品图：front\.png/);
  assert.match(input[0].text, /多方位参考图/);
  assert.match(input[0].text, /不要改形、改色、改材质、改 LOGO/);
  assert.match(input[0].text, /10, 20, 210, 420/);
  assert.deepEqual(input.slice(1), [
    { type: 'localImage', path: '/tmp/detail-page.png' },
    { type: 'localImage', path: '/tmp/front.png' },
    { type: 'localImage', path: '/tmp/side.png' }
  ]);
});

test('builds Codex product replacement input for multi-orientation circled targets', () => {
  const input = buildProductReplacementInput({
    canvasPath: '/tmp/detail-page.png',
    target: {
      bounds: { left: 10, top: 20, right: 210, bottom: 420 },
      targets: [
        { layerName: '目标 01', bounds: { left: 10, top: 20, right: 210, bottom: 420 } },
        { layerName: '目标 02', bounds: { left: 260, top: 30, right: 520, bottom: 430 } }
      ]
    },
    replacementMode: 'multi',
    references: [
      { path: '/tmp/front.png', name: 'front.png', role: 'main' },
      { path: '/tmp/side.png', name: 'side.png' },
      { path: '/tmp/top.png', name: 'top.png' }
    ]
  });

  assert.equal(input[0].type, 'text');
  assert.match(input[0].text, /多方位替换/);
  assert.match(input[0].text, /圈出的目标/);
  assert.match(input[0].text, /目标图层/);
  assert.match(input[0].text, /共 2 个目标/);
  assert.match(input[0].text, /目标 01：10, 20, 210, 420/);
  assert.match(input[0].text, /目标 02：260, 30, 520, 430/);
  assert.match(input[0].text, /必须替换所有目标/);
  assert.match(input[0].text, /逐个替换/);
  assert.match(input[0].text, /方位、角度、透视/);
  assert.match(input[0].text, /正面[\s\S]*侧面[\s\S]*俯视/);
  assert.doesNotMatch(input[0].text, /目标数量/);
  assert.deepEqual(input.slice(1), [
    { type: 'localImage', path: '/tmp/detail-page.png' },
    { type: 'localImage', path: '/tmp/front.png' },
    { type: 'localImage', path: '/tmp/side.png' },
    { type: 'localImage', path: '/tmp/top.png' }
  ]);
});

test('builds Codex target identification input for current Photoshop detail page', () => {
  const input = buildProductIdentificationInput({
    canvasPath: '/tmp/detail-page.png'
  });

  assert.equal(input[0].type, 'text');
  assert.match(input[0].text, /识别当前 Photoshop 详情页里的产品/);
  assert.match(input[0].text, /候选目标/);
  assert.match(input[0].text, /人工确认/);
  assert.match(input[0].text, /JSON/);
  assert.match(input[0].text, /像素坐标/);
  assert.deepEqual(input.slice(1), [
    { type: 'localImage', path: '/tmp/detail-page.png' }
  ]);
});

test('builds strict JSON target identification retry input', () => {
  const input = buildProductIdentificationInput({
    canvasPath: '/tmp/detail-page.png',
    strictJsonOnly: true
  });

  assert.match(input[0].text, /只输出严格 JSON/);
  assert.match(input[0].text, /自动圈出/);
  assert.doesNotMatch(input[0].text, /手动/);
  assert.deepEqual(input.slice(1), [
    { type: 'localImage', path: '/tmp/detail-page.png' }
  ]);
});

test('parses product identification JSON targets from Codex output', () => {
  const targets = parseProductIdentificationTargets(`
识别结果：
\`\`\`json
{
  "targets": [
    { "name": "上方鞋子", "left": 80, "top": 330, "right": 520, "bottom": 620, "reason": "上方穿着图里的两只鞋" },
    { "name": "下方鞋子", "bounds": { "left": 55, "top": 660, "right": 550, "bottom": 1320 }, "reason": "下方静物图里的两只鞋" }
  ]
}
\`\`\`
  `);

  assert.deepEqual(targets, [{
    name: '目标 01',
    bounds: { left: 80, top: 330, right: 520, bottom: 620 },
    reason: '上方穿着图里的两只鞋'
  }, {
    name: '目标 02',
    bounds: { left: 55, top: 660, right: 550, bottom: 1320 },
    reason: '下方静物图里的两只鞋'
  }]);
});

test('builds Codex local retouch input for direct new-layer generation from Photoshop selection', () => {
  const input = buildProductRetouchInput({
    canvasPath: '/tmp/detail-page-current.png',
    target: { bounds: { left: 30, top: 40, right: 180, bottom: 260 } },
    references: [
      { path: '/tmp/front.png', name: 'front.png' }
    ]
  });

  assert.equal(input[0].type, 'text');
  assert.match(input[0].text, /局部返修/);
  assert.match(input[0].text, /Photoshop 当前选区/);
  assert.match(input[0].text, /只处理返修区域/);
  assert.match(input[0].text, /直接导入为新建返修图层/);
  assert.match(input[0].text, /不要覆盖原详情图/);
  assert.doesNotMatch(input[0].text, /预览/);
  assert.match(input[0].text, /30, 40, 180, 260/);
  assert.deepEqual(input.slice(1), [
    { type: 'localImage', path: '/tmp/detail-page-current.png' },
    { type: 'localImage', path: '/tmp/front.png' }
  ]);
});
