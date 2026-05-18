const BRIDGE_SOCKET_URL = 'ws://127.0.0.1:17891/socket';
const BRIDGE_HTTP_URL = 'http://127.0.0.1:17891';

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

function addEvent(event) {
  if (!log) return;
  if (event.type === 'raw_event') return;
  if (event.type === 'user_message') return;

  if (event.type === 'assistant_delta') {
    if (!activeAssistantEvent) {
      activeAssistantEvent = document.createElement('div');
      activeAssistantEvent.className = 'event assistant';
      activeAssistantEvent.textContent = '';
      log.appendChild(activeAssistantEvent);
    }
    activeAssistantEvent.textContent += event.text || '';
    log.scrollTop = log.scrollHeight;
    return;
  }

  if (event.type === 'turn_completed' || event.type === 'error' || event.type === 'user') {
    activeAssistantEvent = null;
  }

  const node = document.createElement('div');
  node.className = `event ${event.type || 'status'}`;
  node.textContent = event.text || event.message || `${event.tool || event.type || 'event'}`;
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
  connectBridge();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
