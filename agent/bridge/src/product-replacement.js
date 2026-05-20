import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

export const DEFAULT_PRODUCT_REFERENCE_DIR = join(homedir(), '.codex-ps-agent', 'product-references');

const CONTENT_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif']
]);

const EXTENSIONS_BY_MIME = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

function assertSupportedMimeType(mimeType) {
  if (!EXTENSIONS_BY_MIME.has(String(mimeType || '').toLowerCase())) {
    throw new Error('只支持上传图片格式：PNG、JPG、WEBP 或 GIF。');
  }
}

function normalizeMimeType(mimeType) {
  const lower = String(mimeType || '').toLowerCase();
  return lower === 'image/jpg' ? 'image/jpeg' : lower;
}

function safeDisplayName(name, mimeType) {
  const extension = EXTENSIONS_BY_MIME.get(normalizeMimeType(mimeType));
  const rawBase = basename(String(name || 'product-reference'), extname(String(name || '')));
  const safeBase = rawBase.replace(/[^\w\u4e00-\u9fa5 .-]+/g, '_').replace(/\s+/g, ' ').trim() || 'product-reference';
  return `${safeBase}${extension}`;
}

function decodeImageData(data) {
  const value = String(data || '');
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  return Buffer.from(base64, 'base64');
}

function assertInsideReferenceDir(referenceDir, filePath) {
  const root = resolve(referenceDir);
  const target = resolve(filePath || '');
  const pathFromRoot = relative(root, target);
  if (pathFromRoot.startsWith('..') || pathFromRoot === '..' || pathFromRoot.includes(`..${sep}`)) {
    throw new Error('请求的参考图在参考图目录之外。');
  }
  return target;
}

function contentTypeForPath(filePath) {
  return CONTENT_TYPES.get(extname(filePath).toLowerCase());
}

export async function saveProductReference({
  referenceDir = DEFAULT_PRODUCT_REFERENCE_DIR,
  name,
  mimeType,
  data
} = {}) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  assertSupportedMimeType(normalizedMimeType);
  await mkdir(referenceDir, { recursive: true });

  const displayName = safeDisplayName(name, normalizedMimeType);
  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${displayName}`;
  const filePath = join(referenceDir, fileName);
  const buffer = decodeImageData(data);
  await writeFile(filePath, buffer);

  return {
    path: filePath,
    name: displayName,
    mimeType: normalizedMimeType,
    size: buffer.length,
    previewUrl: `/product-reference?path=${encodeURIComponent(filePath)}`
  };
}

export async function listProductReferences({
  referenceDir = DEFAULT_PRODUCT_REFERENCE_DIR,
  limit = 20
} = {}) {
  let dirents;
  try {
    dirents = await readdir(referenceDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const references = [];
  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    const filePath = join(referenceDir, dirent.name);
    const contentType = contentTypeForPath(filePath);
    if (!contentType) continue;
    const info = await stat(filePath);
    const name = dirent.name.replace(/^\d+-[a-f0-9]+-/i, '');
    references.push({
      path: filePath,
      name,
      mimeType: contentType,
      size: info.size,
      mtimeMs: info.mtimeMs,
      modified: info.mtime.toISOString(),
      previewUrl: `/product-reference?path=${encodeURIComponent(filePath)}`
    });
  }

  return references
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
}

export async function readProductReferenceFile({
  referenceDir = DEFAULT_PRODUCT_REFERENCE_DIR,
  filePath
} = {}) {
  const safePath = assertInsideReferenceDir(referenceDir, filePath);
  const contentType = contentTypeForPath(safePath);
  if (!contentType) throw new Error('不支持的参考图格式。');
  return {
    contentType,
    buffer: await readFile(safePath)
  };
}

function targetText(target) {
  const bounds = target?.bounds;
  if (!bounds) return '当前未读取到目标边界，请优先使用 Photoshop 里的“目标 01”圈出图层作为替换区域。';
  return `目标区域边界为：${bounds.left}, ${bounds.top}, ${bounds.right}, ${bounds.bottom}。`;
}

function referenceName(reference) {
  return reference?.name || basename(reference?.path || 'product-reference');
}

function productReferenceText(references = []) {
  const mainReference = references.find(reference => reference.role === 'main') || references[0];
  const supportReferences = references.filter(reference => reference !== mainReference);
  return {
    mainText: mainReference
      ? `主产品图：${referenceName(mainReference)}。这张图是产品真实性的最高优先级依据。`
      : '主产品图：未指定。请先在面板里设定一张主产品图。',
    supportText: supportReferences.length
      ? supportReferences.map((reference, index) => `${index + 1}. ${referenceName(reference)}`).join('\n')
      : '暂无多方位参考图。'
  };
}

export function buildProductIdentificationInput({
  canvasPath
} = {}) {
  const prompt = [
    '请识别当前 Photoshop 详情页里的产品。',
    '',
    '目标：找出需要被替换的旧产品候选目标，帮助用户人工确认。请重点寻找主商品、包装、瓶身、盒子、模特手持产品或详情页中心商品。',
    '输出候选目标时，请用简短中文说明：候选目标编号、在画面中的大致方位、为什么认为它是产品、可能遗漏的区域。',
    '注意：这一步只是候选目标识别，最后必须由人工确认。不要直接替换产品。',
    '',
    '输出要求：只输出识别建议和人工确认提醒。'
  ].join('\n');

  return [
    { type: 'text', text: prompt },
    ...(canvasPath ? [{ type: 'localImage', path: canvasPath }] : [])
  ];
}

export function buildProductReplacementInput({
  canvasPath,
  target,
  references = []
} = {}) {
  const { mainText, supportText } = productReferenceText(references);
  const prompt = [
    '请使用 Codex 内置图片生成能力，生成一张 Photoshop 详情页产品替换融合预览图。',
    '',
    '核心原则：双向结合。产品保真，画面融合，二者都不能牺牲。',
    mainText,
    '多方位产品图是产品身份锚点，用来防止幻觉。请严格参考产品外形、结构比例、材质、颜色、反光、文字和 LOGO，不要改形、改色、改材质、改 LOGO，也不要凭空添加不存在的细节。',
    '当前 Photoshop 画布是详情页风格依据。请让替换产品融入原详情页的风格和样式，匹配光影、透视、色调、阴影、清晰度、噪点和边缘过渡，不能像外部图片直接贴上去。',
    targetText(target),
    '',
    '多方位参考图：',
    supportText,
    '',
    '输出要求：只生成一张最终融合预览图，不要写说明文字。'
  ].join('\n');

  return [
    { type: 'text', text: prompt },
    ...(canvasPath ? [{ type: 'localImage', path: canvasPath }] : []),
    ...references.map(reference => ({ type: 'localImage', path: reference.path }))
  ];
}

export function buildProductRetouchInput({
  canvasPath,
  target,
  references = []
} = {}) {
  const { mainText, supportText } = productReferenceText(references);
  const prompt = [
    '请使用 Codex 内置图片生成能力，生成一张 Photoshop 局部返修预览图。',
    '',
    '核心原则：只处理返修区域，区域外保持当前画布一致。返修结果后续会作为新建返修图层导入 Photoshop，用于随时隐藏、删除或回退。',
    '不要覆盖原详情图，不要覆盖已有替换结果层，不要重绘整张详情页。只修复人工圈出的不满意部位，例如边缘、阴影、反光、透视、质感、色差或局部遮挡。',
    mainText,
    '如果返修区域涉及产品本体，请继续以产品参考图为产品身份锚点，保持外形、结构比例、材质、颜色、文字和 LOGO，不要凭空改产品。',
    '同时要贴合当前详情页的风格、光影、透视、清晰度、噪点和边缘过渡。',
    targetText(target).replace('目标区域', '返修区域'),
    '',
    '多方位参考图：',
    supportText,
    '',
    '输出要求：只生成一张局部返修预览图，不要写说明文字。'
  ].join('\n');

  return [
    { type: 'text', text: prompt },
    ...(canvasPath ? [{ type: 'localImage', path: canvasPath }] : []),
    ...references.map(reference => ({ type: 'localImage', path: reference.path }))
  ];
}
