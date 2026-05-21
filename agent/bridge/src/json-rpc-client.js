import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export function createJsonRpcClient({ input, output, onNotification } = {}) {
  let nextId = 1;
  const pending = new Map();
  const events = new EventEmitter();

  const rl = createInterface({ input });
  rl.on('line', line => {
    if (!line.trim()) return;
    const message = JSON.parse(line);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || 'JSON-RPC error'));
      else resolve(message.result);
      return;
    }
    if (message.method) {
      const notification = { method: message.method, params: message.params || {} };
      events.emit('notification', notification);
      onNotification?.(notification);
    }
  });

  function request(method, params = {}) {
    const id = nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    output.write(`${JSON.stringify(payload)}\n`);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }

  return { request, on: events.on.bind(events), close: () => rl.close() };
}

export function spawnCodexProxy({ codexBin = 'codex', args = ['app-server', 'proxy'] } = {}) {
  const child = spawn(codexBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  return {
    child,
    client: createJsonRpcClient({ input: child.stdout, output: child.stdin })
  };
}
