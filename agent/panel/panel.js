const BRIDGE_SOCKET_URL = 'ws://127.0.0.1:17891/socket';

let mode = 'safe-auto';
let socket = null;
let reconnectTimer = null;
let log = null;
let connection = null;
let messageInput = null;

function addEvent(event) {
  if (!log) return;
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

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBridge();
  }, 1000);
}

function connectBridge() {
  if (typeof WebSocket === 'undefined') {
    connection.textContent = 'WebSocket unavailable';
    addEvent({ type: 'error', message: 'Photoshop UXP did not expose WebSocket in this panel.' });
    return;
  }

  socket = new WebSocket(BRIDGE_SOCKET_URL);

  socket.onopen = () => {
    connection.textContent = 'Connected';
  };

  socket.onclose = () => {
    connection.textContent = 'Reconnecting';
    scheduleReconnect();
  };

  socket.onerror = () => {
    connection.textContent = 'Connection error';
  };

  socket.onmessage = message => {
    try {
      addEvent(JSON.parse(message.data));
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
  log = document.querySelector('#log');
  connection = document.querySelector('#connection');
  messageInput = document.querySelector('#message');

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
  connectBridge();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
