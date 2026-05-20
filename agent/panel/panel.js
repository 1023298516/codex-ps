const BRIDGE_SOCKET_URL = 'ws://127.0.0.1:17891/socket';
const BRIDGE_HTTP_URL = 'http://127.0.0.1:17891';
const MAX_TECHNICAL_EVENT_LENGTH = 520;
const MAX_TECHNICAL_EVENT_LINES = 7;
const TOOL_LABELS = {
  image_generation: {
    started: '正在生成图片...',
    completed: '图片已生成，正在准备导入。'
  },
  place_generated_codex_image: {
    started: '正在导入刚生成的图片...'
  },
  place_latest_codex_image: {
    started: '正在导入最新 Codex 图片...'
  },
  read_document: {
    started: '正在读取当前画布...'
  },
  read_layers: {
    started: '正在读取当前图层...'
  },
  create_product_target_layer: {
    started: '正在新建目标图层...'
  },
  read_product_target_layer: {
    started: '正在读取目标图层...'
  },
  export_canvas: {
    started: '正在导出详情页预览...'
  },
  product_replacement_preview: {
    started: '正在生成产品融合预览...'
  },
  import_product_replacement_preview: {
    started: '正在导入替换结果...'
  },
  create_retouch_target_layer: {
    started: '正在新建返修区域...'
  },
  read_retouch_target_layer: {
    started: '正在读取返修区域...'
  },
  product_retouch_preview: {
    started: '正在生成局部返修预览...'
  },
  import_product_retouch_preview: {
    started: '正在导入返修图层...'
  }
};

let mode = 'safe-auto';
let socket = null;
let reconnectTimer = null;
let panelRoot = null;
let log = null;
let connection = null;
let messageInput = null;
let activeAssistantEvent = null;
let galleryModal = null;
let galleryGrid = null;
let galleryEmpty = null;
let gallerySelectedCount = null;
let galleryTotalCount = null;
let galleryImportSelected = null;
let previewModal = null;
let previewImage = null;
let previewTitle = null;
let previewMeta = null;
let previewImport = null;
let galleryImages = [];
let selectedImagePaths = new Set();
let pendingImportPaths = [];
let productModal = null;
let productReferenceInput = null;
let productReferenceGrid = null;
let productReferenceEmpty = null;
let productReferenceCount = null;
let productPreviewImage = null;
let productPreviewStatus = null;
let productImportPreview = null;
let productRetouchPreviewImage = null;
let productRetouchPreviewStatus = null;
let productImportRetouch = null;
let productReferences = [];
let productPreviewPath = null;
let productRetouchPreviewPath = null;

function isTechnicalText(text) {
  return /imagePath|filePath|LayerKind|DocumentMode|Result:|\/Users\/|\{.*[:=].*\}/s.test(text);
}

function shortenLongLine(line) {
  if (line.length <= 110) return line;
  return `${line.slice(0, 92).trim()}...`;
}

function compactFilePaths(text) {
  return text.replace(/\/Users\/[^\s"']+/g, match => {
    const filename = match.split('/').pop();
    if (!filename) return match;
    if (/\.(png|jpe?g|webp|gif)$/i.test(filename)) return filename;
    return `.../${filename}`;
  });
}

function compactDisplayText(value) {
  let text = String(value || '');
  if (!isTechnicalText(text)) return text;

  text = compactFilePaths(text)
    .replace(/Result:\s*"?\(\{[\s\S]*/i, '结果：已完成')
    .replace(/Image placed successfully:/i, '已放入画布：');

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^imagePath:/i.test(line))
    .map(shortenLongLine);

  const clippedLines = lines.slice(0, MAX_TECHNICAL_EVENT_LINES);
  let compacted = clippedLines.join('\n');
  if (lines.length > MAX_TECHNICAL_EVENT_LINES || compacted.length > MAX_TECHNICAL_EVENT_LENGTH) {
    compacted = `${compacted.slice(0, MAX_TECHNICAL_EVENT_LENGTH).trim()}\n... 已隐藏较长技术细节`;
  }
  return compacted;
}

function toolEventText(event) {
  const label = TOOL_LABELS[event.tool]?.[event.status] || TOOL_LABELS[event.tool]?.started;
  if (label) return label;
  if (event.status === 'started') return `正在执行：${event.tool || '工具'}`;
  if (event.status === 'completed') return `已完成：${event.tool || '工具'}`;
  return event.tool || event.type || 'event';
}

function eventDisplayText(event) {
  if (event.type === 'tool_event') return toolEventText(event);
  return compactDisplayText(event.text || event.message || `${event.tool || event.type || 'event'}`);
}

function addEvent(event) {
  if (!log) return;
  if (event.type === 'raw_event') return;
  if (event.type === 'user_message') return;

  if (event.type === 'assistant_delta') {
    if (!activeAssistantEvent) {
      activeAssistantEvent = document.createElement('div');
      activeAssistantEvent.className = 'event assistant';
      activeAssistantEvent.textContent = '';
      activeAssistantEvent.dataset.rawText = '';
      log.appendChild(activeAssistantEvent);
    }
    activeAssistantEvent.dataset.rawText += event.text || '';
    activeAssistantEvent.textContent = compactDisplayText(activeAssistantEvent.dataset.rawText);
    log.scrollTop = log.scrollHeight;
    return;
  }

  if (event.type === 'turn_completed') {
    activeAssistantEvent = null;
    return;
  }

  if (event.type === 'error' || event.type === 'user') {
    activeAssistantEvent = null;
  }

  const node = document.createElement('div');
  node.className = `event ${event.type || 'status'}`;
  node.textContent = eventDisplayText(event);
  log.appendChild(node);
  log.scrollTop = log.scrollHeight;
}

function sendCommand(body) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error('Bridge is not connected');
  }
  socket.send(JSON.stringify(body));
}

function sendChat(message) {
  try {
    sendCommand({ type: 'chat', message, mode });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function setConnectionState(state) {
  if (!connection) return;
  connection.textContent = state;
  if (!panelRoot) return;
  panelRoot.classList.toggle('is-connected', state === 'Connected');
  panelRoot.classList.toggle('is-error', state === 'Connection error' || state === 'WebSocket unavailable');
}

function requestGallery() {
  try {
    sendCommand({ type: 'list_gallery' });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function importImages(paths) {
  if (!paths.length) {
    addEvent({ type: 'error', message: '请先在图库里选择图片。' });
    return;
  }

  try {
    sendCommand({ type: 'import_images', paths, mode });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function findGalleryImage(path) {
  return galleryImages.find(image => image.path === path);
}

function galleryImageUrl(image) {
  if (!image.previewUrl) return '';
  if (/^https?:\/\//.test(image.previewUrl)) return image.previewUrl;
  return `${BRIDGE_HTTP_URL}${image.previewUrl}`;
}

function productReferenceUrl(reference) {
  if (!reference.previewUrl) return '';
  if (/^https?:\/\//.test(reference.previewUrl)) return reference.previewUrl;
  return `${BRIDGE_HTTP_URL}${reference.previewUrl}`;
}

function requestProductReferences() {
  try {
    sendCommand({ type: 'list_product_references' });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function updateGallerySelection() {
  const count = selectedImagePaths.size;
  if (gallerySelectedCount) gallerySelectedCount.textContent = `已选择 ${count} 张`;
  if (galleryTotalCount) galleryTotalCount.textContent = ` · 共 ${galleryImages.length} 张`;
  if (galleryImportSelected) {
    galleryImportSelected.textContent = count > 0 ? `导入选中 ${count} 张` : '导入选中';
    galleryImportSelected.toggleAttribute('disabled', count === 0);
  }

  if (!galleryGrid) return;
  galleryGrid.querySelectorAll('[data-image-path]').forEach(card => {
    card.classList.toggle('selected', selectedImagePaths.has(card.dataset.imagePath));
  });
}

function toggleGalleryImage(path) {
  if (selectedImagePaths.has(path)) {
    selectedImagePaths.delete(path);
  } else {
    selectedImagePaths.add(path);
  }
  updateGallerySelection();
}

function openImportPreview(paths) {
  const nextPaths = paths.filter(Boolean);
  if (!nextPaths.length) {
    addEvent({ type: 'error', message: '请先在图库里选择图片。' });
    return;
  }

  pendingImportPaths = nextPaths;
  const firstImage = findGalleryImage(nextPaths[0]);
  if (previewImage) {
    previewImage.src = firstImage ? galleryImageUrl(firstImage) : '';
  }
  if (previewTitle) {
    previewTitle.textContent = nextPaths.length > 1 ? `预览 ${nextPaths.length} 张图片` : '预览图片';
  }
  if (previewMeta) {
    previewMeta.textContent = nextPaths.length > 1
      ? '确认后会依次导入当前 Photoshop 画布'
      : '确认后导入当前 Photoshop 画布';
  }
  if (previewImport) {
    previewImport.textContent = nextPaths.length > 1 ? `导入 ${nextPaths.length} 张` : '导入画布';
  }
  if (previewModal) {
    previewModal.classList.remove('hidden');
    previewModal.setAttribute('aria-hidden', 'false');
  }
}

function closeImportPreview() {
  pendingImportPaths = [];
  if (!previewModal) return;
  previewModal.classList.add('hidden');
  previewModal.setAttribute('aria-hidden', 'true');
}

function confirmImportPreview() {
  const paths = [...pendingImportPaths];
  closeImportPreview();
  importImages(paths);
}

function renderGallery(images) {
  galleryImages = images || [];
  if (!galleryGrid || !galleryEmpty) return;
  galleryGrid.textContent = '';
  galleryEmpty.classList.toggle('hidden', galleryImages.length > 0);
  galleryGrid.classList.toggle('hidden', galleryImages.length === 0);

  for (const image of galleryImages) {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.role = 'button';
    card.tabIndex = 0;
    card.dataset.imagePath = image.path;
    card.addEventListener('click', () => toggleGalleryImage(image.path));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleGalleryImage(image.path);
      }
    });

    const preview = document.createElement('img');
    preview.className = 'gallery-thumb';
    preview.src = galleryImageUrl(image);
    preview.alt = image.name || 'Codex image';
    card.appendChild(preview);

    const meta = document.createElement('div');
    meta.className = 'gallery-card-meta';

    const name = document.createElement('span');
    name.textContent = image.name || 'Codex image';
    meta.appendChild(name);

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'gallery-import-one';
    importButton.textContent = '预览';
    importButton.addEventListener('click', event => {
      event.stopPropagation();
      openImportPreview([image.path]);
    });
    meta.appendChild(importButton);

    card.appendChild(meta);
    galleryGrid.appendChild(card);
  }

  selectedImagePaths = new Set([...selectedImagePaths].filter(path => galleryImages.some(image => image.path === path)));
  updateGallerySelection();
}

function openGallery() {
  if (!galleryModal) return;
  galleryModal.classList.remove('hidden');
  galleryModal.setAttribute('aria-hidden', 'false');
  requestGallery();
}

function closeGallery() {
  if (!galleryModal) return;
  closeImportPreview();
  galleryModal.classList.add('hidden');
  galleryModal.setAttribute('aria-hidden', 'true');
}

function renderProductReferences(references) {
  productReferences = references || [];
  if (productReferenceCount) productReferenceCount.textContent = `已上传 ${productReferences.length} 张参考图`;
  if (!productReferenceGrid || !productReferenceEmpty) return;

  productReferenceGrid.textContent = '';
  productReferenceEmpty.classList.toggle('hidden', productReferences.length > 0);
  productReferenceGrid.classList.toggle('hidden', productReferences.length === 0);

  for (const reference of productReferences) {
    const card = document.createElement('div');
    card.className = 'product-reference-card';

    const image = document.createElement('img');
    image.src = productReferenceUrl(reference);
    image.alt = reference.name || '产品参考图';
    card.appendChild(image);

    const name = document.createElement('span');
    name.textContent = reference.name || '产品参考图';
    card.appendChild(name);

    productReferenceGrid.appendChild(card);
  }
}

function openProductReplacement() {
  if (!productModal) return;
  productModal.classList.remove('hidden');
  productModal.setAttribute('aria-hidden', 'false');
  requestProductReferences();
}

function closeProductReplacement() {
  if (!productModal) return;
  productModal.classList.add('hidden');
  productModal.setAttribute('aria-hidden', 'true');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

async function uploadProductReferenceFiles(files) {
  const imageFiles = [...files].filter(file => /^image\//.test(file.type || ''));
  if (!imageFiles.length) {
    addEvent({ type: 'error', message: '请选择产品图片。' });
    return;
  }

  for (const file of imageFiles) {
    const dataUrl = await readFileAsDataUrl(file);
    sendCommand({
      type: 'upload_product_reference',
      name: file.name,
      mimeType: file.type || 'image/png',
      data: dataUrl
    });
  }
}

function setProductPreview(image) {
  productPreviewPath = image?.path || null;
  if (productPreviewImage) productPreviewImage.src = image ? galleryImageUrl(image) : '';
  if (productPreviewStatus) productPreviewStatus.textContent = image ? '已生成' : '未生成';
  if (productImportPreview) {
    productImportPreview.toggleAttribute('disabled', !productPreviewPath);
    productImportPreview.classList.toggle('button-primary', Boolean(productPreviewPath));
    productImportPreview.classList.toggle('button-secondary', !productPreviewPath);
  }
}

function setProductRetouchPreview(image) {
  productRetouchPreviewPath = image?.path || null;
  if (productRetouchPreviewImage) productRetouchPreviewImage.src = image ? galleryImageUrl(image) : '';
  if (productRetouchPreviewStatus) productRetouchPreviewStatus.textContent = image ? '已生成' : '未生成';
  if (productImportRetouch) {
    productImportRetouch.toggleAttribute('disabled', !productRetouchPreviewPath);
    productImportRetouch.classList.toggle('button-primary', Boolean(productRetouchPreviewPath));
    productImportRetouch.classList.toggle('button-secondary', !productRetouchPreviewPath);
  }
}

function createProductTarget() {
  try {
    sendCommand({ type: 'create_product_target', mode });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function readProductTarget() {
  try {
    sendCommand({ type: 'read_product_target', mode });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function createRetouchTarget() {
  try {
    sendCommand({ type: 'create_retouch_target', mode });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function generateProductPreview() {
  if (!productReferences.length) {
    addEvent({ type: 'error', message: '请先上传产品参考图。' });
    return;
  }
  setProductPreview(null);
  try {
    sendCommand({
      type: 'generate_product_replacement_preview',
      mode,
      referencePaths: productReferences.map(reference => reference.path)
    });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function importProductPreview() {
  if (!productPreviewPath) {
    addEvent({ type: 'error', message: '请先生成融合预览。' });
    return;
  }
  try {
    sendCommand({
      type: 'import_product_replacement_preview',
      mode,
      path: productPreviewPath
    });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function generateProductRetouchPreview() {
  setProductRetouchPreview(null);
  try {
    sendCommand({
      type: 'generate_product_retouch_preview',
      mode,
      referencePaths: productReferences.map(reference => reference.path)
    });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function importProductRetouchPreview() {
  if (!productRetouchPreviewPath) {
    addEvent({ type: 'error', message: '请先生成局部返修预览。' });
    return;
  }
  try {
    sendCommand({
      type: 'import_product_retouch_preview',
      mode,
      path: productRetouchPreviewPath
    });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBridge();
  }, 1000);
}

function connectBridge() {
  if (typeof WebSocket === 'undefined') {
    setConnectionState('WebSocket unavailable');
    addEvent({ type: 'error', message: 'Photoshop UXP did not expose WebSocket in this panel.' });
    return;
  }

  socket = new WebSocket(BRIDGE_SOCKET_URL);

  socket.onopen = () => {
    setConnectionState('Connected');
  };

  socket.onclose = () => {
    setConnectionState('Reconnecting');
    scheduleReconnect();
  };

  socket.onerror = () => {
    setConnectionState('Connection error');
  };

  socket.onmessage = message => {
    try {
      const event = JSON.parse(message.data);
      if (event.type === 'gallery_images') {
        renderGallery(event.images);
        return;
      }
      if (event.type === 'product_references') {
        renderProductReferences(event.references);
        return;
      }
      if (event.type === 'product_replacement_preview') {
        setProductPreview(event.image);
        addEvent({ type: 'assistant_delta', text: '融合预览已生成，确认后可导入画布。' });
        return;
      }
      if (event.type === 'product_retouch_preview') {
        setProductRetouchPreview(event.image);
        addEvent({ type: 'assistant_delta', text: '局部返修预览已生成，确认后会导入为新返修图层。' });
        return;
      }
      addEvent(event);
    } catch (error) {
      addEvent({ type: 'error', message: error.message });
    }
  };
}

function submitMessage() {
  const message = messageInput.value.trim();
  if (!message) return;
  messageInput.value = '';
  addEvent({ type: 'user', text: message });
  sendChat(message);
}

function init() {
  panelRoot = document.querySelector('.panel');
  log = document.querySelector('#log');
  connection = document.querySelector('#connection');
  messageInput = document.querySelector('#message');
  galleryModal = document.querySelector('#gallery-modal');
  galleryGrid = document.querySelector('#gallery-grid');
  galleryEmpty = document.querySelector('#gallery-empty');
  gallerySelectedCount = document.querySelector('#gallery-selected-count');
  galleryTotalCount = document.querySelector('#gallery-total-count');
  galleryImportSelected = document.querySelector('#gallery-import-selected');
  previewModal = document.querySelector('#preview-modal');
  previewImage = document.querySelector('#preview-image');
  previewTitle = document.querySelector('#preview-title');
  previewMeta = document.querySelector('#preview-meta');
  previewImport = document.querySelector('#preview-import');
  productModal = document.querySelector('#product-modal');
  productReferenceInput = document.querySelector('#product-reference-input');
  productReferenceGrid = document.querySelector('#product-reference-grid');
  productReferenceEmpty = document.querySelector('#product-reference-empty');
  productReferenceCount = document.querySelector('#product-reference-count');
  productPreviewImage = document.querySelector('#product-preview-image');
  productPreviewStatus = document.querySelector('#product-preview-status');
  productImportPreview = document.querySelector('#product-import-preview');
  productRetouchPreviewImage = document.querySelector('#product-retouch-preview-image');
  productRetouchPreviewStatus = document.querySelector('#product-retouch-preview-status');
  productImportRetouch = document.querySelector('#product-import-retouch');

  document.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => {
      mode = button.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('active', item === button));
      addEvent({ type: 'status', message: `Mode changed to ${mode}` });
    });
  });

  document.querySelector('#send').addEventListener('click', submitMessage);

  messageInput.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submitMessage();
    }
  });

  document.querySelector('#interrupt').addEventListener('click', () => {
    try {
      sendCommand({ type: 'interrupt' });
    } catch (error) {
      addEvent({ type: 'error', message: error.message });
    }
  });

  document.querySelector('#gallery-open').addEventListener('click', openGallery);

  document.querySelector('#product-replace-open').addEventListener('click', openProductReplacement);

  document.querySelector('#product-close').addEventListener('click', closeProductReplacement);

  document.querySelector('#product-create-target').addEventListener('click', createProductTarget);

  document.querySelector('#product-read-target').addEventListener('click', readProductTarget);

  document.querySelector('#product-upload-trigger').addEventListener('click', () => productReferenceInput.click());

  productReferenceInput.addEventListener('change', event => {
    uploadProductReferenceFiles(event.target.files || []).catch(error => addEvent({ type: 'error', message: error.message }));
    event.target.value = '';
  });

  document.querySelector('#product-generate-preview').addEventListener('click', generateProductPreview);

  productImportPreview.addEventListener('click', importProductPreview);

  document.querySelector('#product-create-retouch').addEventListener('click', createRetouchTarget);

  document.querySelector('#product-generate-retouch').addEventListener('click', generateProductRetouchPreview);

  productImportRetouch.addEventListener('click', importProductRetouchPreview);

  document.querySelector('#gallery-close').addEventListener('click', closeGallery);

  document.querySelector('#gallery-refresh').addEventListener('click', requestGallery);

  document.querySelector('#gallery-clear-selection').addEventListener('click', () => {
    selectedImagePaths.clear();
    updateGallerySelection();
  });

  galleryImportSelected.addEventListener('click', () => {
    openImportPreview([...selectedImagePaths]);
  });

  document.querySelector('#preview-close').addEventListener('click', closeImportPreview);

  document.querySelector('#preview-cancel').addEventListener('click', closeImportPreview);

  previewImport.addEventListener('click', confirmImportPreview);

  document.querySelector('#import-latest').addEventListener('click', () => {
    sendChat('导入最新 Codex 图片到当前 Photoshop 画布，作为智能对象。');
  });

  document.querySelector('#read-canvas').addEventListener('click', () => {
    sendChat('读取当前 Photoshop 文档信息。');
  });

  document.querySelector('#read-layers').addEventListener('click', () => {
    sendChat('读取当前 Photoshop 图层信息。');
  });

  addEvent({ type: 'status', message: 'Panel UI initialized' });
  updateGallerySelection();
  renderProductReferences([]);
  setProductPreview(null);
  setProductRetouchPreview(null);
  connectBridge();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
