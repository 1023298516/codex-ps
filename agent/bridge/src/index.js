import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { createStore } from './store.js';
import { createBridgeServer } from './server.js';
import { createJsonRpcClient } from './json-rpc-client.js';
import { createAppServerAdapter } from './app-server-adapter.js';
import { loadEnvFile } from './env.js';

const port = Number(process.env.CODEX_PS_BRIDGE_PORT || 17891);
const statePath = process.env.CODEX_PS_STATE_PATH || join(homedir(), '.codex-ps-agent', 'state.json');
const codexBin = process.env.CODEX_BIN || 'codex';

const store = createStore(statePath);
const state = await store.read();
const localEnv = await loadEnvFile(join(process.cwd(), '.env.local'));

const appServerProcess = spawn(codexBin, ['app-server', '--listen', 'stdio://'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ...localEnv }
});
appServerProcess.stderr.on('data', chunk => console.error(chunk.toString('utf8')));

const client = createJsonRpcClient({ input: appServerProcess.stdout, output: appServerProcess.stdin });
const appServer = createAppServerAdapter({ client, threadId: state.threadId });
const server = createBridgeServer({ appServer, store });

client.on('notification', notification => {
  void server.handleAppServerNotification(notification);
});

await server.listen(port);
console.log(`Codex PS bridge listening on http://127.0.0.1:${port}`);

process.on('SIGINT', async () => {
  await store.update({ threadId: appServer.threadId });
  appServerProcess.kill();
  await server.close();
  process.exit(0);
});
