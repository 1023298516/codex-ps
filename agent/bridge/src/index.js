import { join } from 'node:path';
import { homedir } from 'node:os';
import { createStore } from './store.js';
import { createBridgeServer } from './server.js';

const port = Number(process.env.CODEX_PS_BRIDGE_PORT || 17891);
const statePath = process.env.CODEX_PS_STATE_PATH || join(homedir(), '.codex-ps-agent', 'state.json');
const store = createStore(statePath);

const appServer = {
  async startTurn(message) {
    return { mock: true, message };
  }
};

const server = createBridgeServer({ appServer, store });
await server.listen(port);
console.log(`Codex PS bridge listening on http://127.0.0.1:${port}`);
