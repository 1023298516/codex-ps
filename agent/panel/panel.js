const BRIDGE_URL = 'http://127.0.0.1:17891';

let mode = 'safe-auto';

const log = document.querySelector('#log');
const connection = document.querySelector('#connection');
const composer = document.querySelector('#composer');
const messageInput = document.querySelector('#message');

function addEvent(event) {
  const node = document.createElement('div');
  node.className = `event ${event.type || 'status'}`;
  node.textContent = event.text || event.message || `${event.tool || event.type || 'event'}`;
  log.appendChild(node);
  log.scrollTop = log.scrollHeight;
}

async function post(path, body = {}) {
  const response = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error((await response.json()).error || 'Bridge request failed');
  return response.json();
}

function connectEvents() {
  const events = new EventSource(`${BRIDGE_URL}/events`);
  events.onopen = () => {
    connection.textContent = 'Connected';
  };
  events.onerror = () => {
    connection.textContent = 'Reconnecting';
  };
  for (const type of ['status', 'user_message', 'assistant_delta', 'tool_event', 'turn_completed', 'error', 'raw_event']) {
    events.addEventListener(type, message => addEvent(JSON.parse(message.data)));
  }
}

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('active', item === button));
    addEvent({ type: 'status', message: `Mode changed to ${mode}` });
  });
});

composer.addEventListener('submit', async event => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  messageInput.value = '';
  addEvent({ type: 'user', text: message });
  try {
    await post('/chat', { message, mode });
  } catch (error) {
    addEvent({ type: 'error', message: error.message });
  }
});

document.querySelector('#import-latest').addEventListener('click', () => post('/chat', {
  mode,
  message: '导入最新 Codex 图片到当前 Photoshop 画布，作为智能对象。'
}));

document.querySelector('#read-canvas').addEventListener('click', () => post('/chat', {
  mode,
  message: '读取当前 Photoshop 文档信息。'
}));

document.querySelector('#read-layers').addEventListener('click', () => post('/chat', {
  mode,
  message: '读取当前 Photoshop 图层信息。'
}));

connectEvents();
