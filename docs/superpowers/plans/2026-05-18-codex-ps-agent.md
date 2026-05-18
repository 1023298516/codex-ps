# Codex PS Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Codex-in-Photoshop agent loop: a side-docked chat panel talks to a local bridge, the bridge talks to Codex app-server and Photoshop MCP, and B safe-auto mode is enforced by default.

**Architecture:** Add a small root Node project for bridge tests and scripts, keep the patched `photoshop-mcp-local` package intact, and add a plain UXP panel under `agent/panel`. The local bridge exposes HTTP/SSE endpoints to the panel, normalizes app-server events, and gates Photoshop tool calls through a mode policy before forwarding them.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, plain HTTP/SSE bridge, Codex app-server JSON-RPC over `codex app-server proxy`, Photoshop UXP static HTML/CSS/JS, existing patched Photoshop MCP server.

---

## File Structure

- Create: `package.json`
  - Root scripts for tests, bridge dev server, and static checks.
- Create: `agent/bridge/src/policy.js`
  - Mode-policy engine for B/C Photoshop action permissions.
- Create: `agent/bridge/src/events.js`
  - Normalizes app-server and bridge events into panel events.
- Create: `agent/bridge/src/store.js`
  - Tiny JSON file store for mode, thread id, connection state, and recent operation log.
- Create: `agent/bridge/src/json-rpc-client.js`
  - Generic newline-delimited JSON-RPC client for `codex app-server proxy`.
- Create: `agent/bridge/src/app-server-adapter.js`
  - Codex app-server workflow wrapper: start thread, start turn, interrupt turn, call MCP tool.
- Create: `agent/bridge/src/photoshop-tools.js`
  - Photoshop MCP tool adapter with policy enforcement.
- Create: `agent/bridge/src/server.js`
  - Local HTTP/SSE bridge for panel-to-agent communication.
- Create: `agent/bridge/src/index.js`
  - CLI entrypoint for starting the bridge.
- Create: `agent/bridge/test/*.test.js`
  - Unit tests for policy, event normalization, store, JSON-RPC, app-server adapter, Photoshop tool adapter, and HTTP server.
- Create: `agent/panel/manifest.json`
  - Photoshop UXP plugin manifest.
- Create: `agent/panel/index.html`
  - Panel markup.
- Create: `agent/panel/styles.css`
  - Compact dark UI matching the approved visual direction.
- Create: `agent/panel/panel.js`
  - Panel client logic: state, chat submit, SSE events, quick actions, mode toggle.
- Create: `agent/panel/test/static.test.js`
  - Static checks for required files and absence of template-slot language.
- Create: `agent/scripts/start-dev.mjs`
  - Starts the bridge for local testing.
- Create: `agent/README.md`
  - Local runbook for the bridge and UXP panel.

---

### Task 1: Root Project Scaffold

**Files:**
- Create: `package.json`
- Create: `agent/README.md`

- [ ] **Step 1: Create the root package file**

Create `package.json` with:

```json
{
  "name": "codex-ps",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"agent/**/*.test.js\"",
    "test:bridge": "node --test \"agent/bridge/test/*.test.js\"",
    "test:panel": "node --test \"agent/panel/test/*.test.js\"",
    "dev:bridge": "node agent/bridge/src/index.js",
    "dev:agent": "node agent/scripts/start-dev.mjs",
    "check": "npm run test"
  },
  "engines": {
    "node": ">=24"
  }
}
```

- [ ] **Step 2: Create the agent README**

Create `agent/README.md` with:

```markdown
# Codex PS Agent

This folder contains the Photoshop-side Codex agent MVP.

## Parts

- `bridge/`: local Node bridge between the Photoshop panel, Codex app-server, and Photoshop MCP.
- `panel/`: Photoshop UXP panel UI.
- `scripts/`: local development helpers.

## Local Development

Run tests:

```bash
npm test
```

Start the bridge:

```bash
npm run dev:bridge
```

The bridge listens on `http://127.0.0.1:17891` by default.

## Safety Model

The default mode is `safe-auto`. It may create new smart-object layers and transform the newly created or currently selected layer. Destructive actions such as delete, merge, flatten, overwrite, and applying masks to existing layers are blocked unless `full-auto` is explicitly enabled and protection succeeds.
```

- [ ] **Step 3: Verify Node and npm are available**

Run:

```bash
node --version
npm --version
```

Expected: Node prints `v24.14.0` or newer, and npm prints `11.9.0` or newer.

- [ ] **Step 4: Commit scaffold**

Run:

```bash
git add package.json agent/README.md
git commit -m "chore: scaffold codex ps agent project"
```

---

### Task 2: Mode Policy Engine

**Files:**
- Create: `agent/bridge/src/policy.js`
- Create: `agent/bridge/test/policy.test.js`

- [ ] **Step 1: Write the failing policy tests**

Create `agent/bridge/test/policy.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canRunAction, normalizeMode, requireAllowedAction } from '../src/policy.js';

test('normalizeMode defaults to safe-auto', () => {
  assert.equal(normalizeMode(), 'safe-auto');
  assert.equal(normalizeMode('B'), 'safe-auto');
  assert.equal(normalizeMode('safe-auto'), 'safe-auto');
  assert.equal(normalizeMode('C'), 'full-auto');
  assert.equal(normalizeMode('full-auto'), 'full-auto');
});

test('safe-auto allows reads and safe layer creation/transforms', () => {
  assert.equal(canRunAction('safe-auto', 'read_document').allowed, true);
  assert.equal(canRunAction('safe-auto', 'create_new_layer').allowed, true);
  assert.equal(canRunAction('safe-auto', 'transform_new_or_selected_layer').allowed, true);
});

test('safe-auto blocks destructive operations', () => {
  for (const action of ['delete_layer', 'merge_layers', 'flatten_document', 'apply_mask', 'overwrite_file', 'modify_arbitrary_layer']) {
    const result = canRunAction('safe-auto', action);
    assert.equal(result.allowed, false, action);
    assert.match(result.reason, /blocked in B safe-auto mode/);
  }
});

test('full-auto allows destructive operations only when protection succeeded', () => {
  assert.equal(canRunAction('full-auto', 'delete_layer').allowed, false);
  assert.equal(canRunAction('full-auto', 'delete_layer', { protectionReady: true }).allowed, true);
  assert.equal(canRunAction('full-auto', 'modify_arbitrary_layer').allowed, true);
});

test('requireAllowedAction throws a readable blocked-operation error', () => {
  assert.throws(
    () => requireAllowedAction('safe-auto', 'delete_layer'),
    /delete_layer blocked in B safe-auto mode/
  );
});
```

- [ ] **Step 2: Run the policy test to verify it fails**

Run:

```bash
npm run test:bridge -- agent/bridge/test/policy.test.js
```

Expected: fails because `agent/bridge/src/policy.js` does not exist.

- [ ] **Step 3: Implement the policy engine**

Create `agent/bridge/src/policy.js` with:

```js
const SAFE_AUTO_ALLOWED = new Set([
  'read_document',
  'read_layers',
  'read_selection',
  'list_recent_codex_images',
  'create_new_layer',
  'place_latest_codex_image',
  'rename_new_layer',
  'transform_new_or_selected_layer',
  'selection_to_new_layer_result'
]);

const FULL_AUTO_PROTECTED = new Set([
  'delete_layer',
  'merge_layers',
  'flatten_document',
  'apply_mask',
  'overwrite_file'
]);

const FULL_AUTO_ALLOWED = new Set([
  ...SAFE_AUTO_ALLOWED,
  'modify_arbitrary_layer',
  ...FULL_AUTO_PROTECTED
]);

export function normalizeMode(mode = 'safe-auto') {
  if (mode === 'B' || mode === 'safe-auto') return 'safe-auto';
  if (mode === 'C' || mode === 'full-auto') return 'full-auto';
  return 'safe-auto';
}

export function canRunAction(mode, action, context = {}) {
  const normalizedMode = normalizeMode(mode);

  if (normalizedMode === 'safe-auto') {
    if (SAFE_AUTO_ALLOWED.has(action)) return { allowed: true, mode: normalizedMode };
    return {
      allowed: false,
      mode: normalizedMode,
      reason: `${action} blocked in B safe-auto mode`
    };
  }

  if (!FULL_AUTO_ALLOWED.has(action)) {
    return {
      allowed: false,
      mode: normalizedMode,
      reason: `${action} is not registered as an allowed Photoshop action`
    };
  }

  if (FULL_AUTO_PROTECTED.has(action) && context.protectionReady !== true) {
    return {
      allowed: false,
      mode: normalizedMode,
      reason: `${action} requires a protection point in C full-auto mode`
    };
  }

  return { allowed: true, mode: normalizedMode };
}

export function requireAllowedAction(mode, action, context = {}) {
  const result = canRunAction(mode, action, context);
  if (!result.allowed) {
    const error = new Error(result.reason);
    error.code = 'ACTION_BLOCKED';
    error.action = action;
    error.mode = result.mode;
    throw error;
  }
  return result;
}
```

- [ ] **Step 4: Run the policy tests**

Run:

```bash
npm run test:bridge -- agent/bridge/test/policy.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit policy engine**

Run:

```bash
git add agent/bridge/src/policy.js agent/bridge/test/policy.test.js
git commit -m "feat: add photoshop mode policy"
```

---

### Task 3: Panel Event Normalization

**Files:**
- Create: `agent/bridge/src/events.js`
- Create: `agent/bridge/test/events.test.js`

- [ ] **Step 1: Write event normalizer tests**

Create `agent/bridge/test/events.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppServerNotification, panelEvent } from '../src/events.js';

test('panelEvent returns a timestamped event envelope', () => {
  const event = panelEvent('status', { message: 'Connected' }, 1000);
  assert.deepEqual(event, { type: 'status', timestamp: 1000, message: 'Connected' });
});

test('normalizes turn text delta notifications', () => {
  const event = normalizeAppServerNotification({
    method: 'turn/output_text/delta',
    params: { delta: 'hello' }
  }, 2000);
  assert.deepEqual(event, { type: 'assistant_delta', timestamp: 2000, text: 'hello' });
});

test('normalizes tool call notifications', () => {
  const event = normalizeAppServerNotification({
    method: 'mcpServer/tool/call',
    params: { server: 'photoshop', tool: 'photoshop_place_latest_codex_image' }
  }, 3000);
  assert.deepEqual(event, {
    type: 'tool_event',
    timestamp: 3000,
    server: 'photoshop',
    tool: 'photoshop_place_latest_codex_image',
    status: 'started'
  });
});

test('normalizes turn completion', () => {
  const event = normalizeAppServerNotification({ method: 'turn/completed', params: {} }, 4000);
  assert.equal(event.type, 'turn_completed');
});

test('unknown notifications are preserved for debugging', () => {
  const event = normalizeAppServerNotification({ method: 'custom/event', params: { value: 1 } }, 5000);
  assert.equal(event.type, 'raw_event');
  assert.equal(event.method, 'custom/event');
  assert.deepEqual(event.params, { value: 1 });
});
```

- [ ] **Step 2: Run the event tests to verify they fail**

Run:

```bash
npm run test:bridge -- agent/bridge/test/events.test.js
```

Expected: fails because `agent/bridge/src/events.js` does not exist.

- [ ] **Step 3: Implement event normalization**

Create `agent/bridge/src/events.js` with:

```js
export function panelEvent(type, payload = {}, timestamp = Date.now()) {
  return { type, timestamp, ...payload };
}

export function normalizeAppServerNotification(message, timestamp = Date.now()) {
  const method = message?.method || '';
  const params = message?.params || {};

  if (method === 'turn/output_text/delta' || method === 'turn/output_text_delta') {
    return panelEvent('assistant_delta', { text: params.delta || params.text || '' }, timestamp);
  }

  if (method === 'mcpServer/tool/call') {
    return panelEvent('tool_event', {
      server: params.server || params.serverName || 'unknown',
      tool: params.tool || params.toolName || 'unknown',
      status: 'started'
    }, timestamp);
  }

  if (method === 'turn/completed') {
    return panelEvent('turn_completed', { result: params }, timestamp);
  }

  if (method === 'error') {
    return panelEvent('error', { message: params.message || 'Codex app-server error', details: params }, timestamp);
  }

  return panelEvent('raw_event', { method, params }, timestamp);
}

export function serializeSse(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
```

- [ ] **Step 4: Run the event tests**

Run:

```bash
npm run test:bridge -- agent/bridge/test/events.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit event normalization**

Run:

```bash
git add agent/bridge/src/events.js agent/bridge/test/events.test.js
git commit -m "feat: normalize codex panel events"
```

---

### Task 4: Bridge Store

**Files:**
- Create: `agent/bridge/src/store.js`
- Create: `agent/bridge/test/store.test.js`

- [ ] **Step 1: Write store tests**

Create `agent/bridge/test/store.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../src/store.js';

test('store defaults to safe-auto mode and empty log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-ps-store-'));
  try {
    const store = createStore(join(dir, 'state.json'));
    assert.equal((await store.read()).mode, 'safe-auto');
    assert.deepEqual((await store.read()).operationLog, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('store persists mode, thread id, and recent operation log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-ps-store-'));
  try {
    const store = createStore(join(dir, 'state.json'));
    await store.update({ mode: 'full-auto', threadId: 'thread-1' });
    await store.appendOperation({ type: 'tool_event', tool: 'photoshop_place_latest_codex_image' });
    const nextStore = createStore(join(dir, 'state.json'));
    const state = await nextStore.read();
    assert.equal(state.mode, 'full-auto');
    assert.equal(state.threadId, 'thread-1');
    assert.equal(state.operationLog.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the store tests to verify they fail**

Run:

```bash
npm run test:bridge -- agent/bridge/test/store.test.js
```

Expected: fails because `agent/bridge/src/store.js` does not exist.

- [ ] **Step 3: Implement the store**

Create `agent/bridge/src/store.js` with:

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_STATE = {
  mode: 'safe-auto',
  threadId: null,
  photoshopConnected: false,
  lastImportedImagePath: null,
  operationLog: []
};

export function createStore(filePath) {
  async function read() {
    try {
      const raw = await readFile(filePath, 'utf8');
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch (error) {
      if (error.code === 'ENOENT') return { ...DEFAULT_STATE };
      throw error;
    }
  }

  async function write(state) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    return state;
  }

  return {
    read,
    async update(patch) {
      return write({ ...(await read()), ...patch });
    },
    async appendOperation(operation) {
      const state = await read();
      const operationLog = [...state.operationLog, { ...operation, timestamp: operation.timestamp || Date.now() }].slice(-100);
      return write({ ...state, operationLog });
    }
  };
}
```

- [ ] **Step 4: Run the store tests**

Run:

```bash
npm run test:bridge -- agent/bridge/test/store.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit store**

Run:

```bash
git add agent/bridge/src/store.js agent/bridge/test/store.test.js
git commit -m "feat: persist codex ps bridge state"
```

---

### Task 5: JSON-RPC Client For Codex App-Server Proxy

**Files:**
- Create: `agent/bridge/src/json-rpc-client.js`
- Create: `agent/bridge/test/json-rpc-client.test.js`

- [ ] **Step 1: Write JSON-RPC client tests**

Create `agent/bridge/test/json-rpc-client.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createJsonRpcClient } from '../src/json-rpc-client.js';

test('JSON-RPC client writes requests and resolves responses', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const client = createJsonRpcClient({ input, output });

  const responsePromise = client.request('thread/start', { title: 'Codex PS' });
  const sent = JSON.parse(output.read().toString('utf8'));
  assert.equal(sent.jsonrpc, '2.0');
  assert.equal(sent.method, 'thread/start');
  assert.deepEqual(sent.params, { title: 'Codex PS' });

  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { thread: { id: 't1' } } })}\n`);
  assert.deepEqual(await responsePromise, { thread: { id: 't1' } });
});

test('JSON-RPC client emits notifications', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const notifications = [];
  createJsonRpcClient({ input, output, onNotification: event => notifications.push(event) });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { ok: true } })}\n`);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(notifications, [{ method: 'turn/completed', params: { ok: true } }]);
});
```

- [ ] **Step 2: Run JSON-RPC tests to verify they fail**

Run:

```bash
npm run test:bridge -- agent/bridge/test/json-rpc-client.test.js
```

Expected: fails because `agent/bridge/src/json-rpc-client.js` does not exist.

- [ ] **Step 3: Implement the JSON-RPC client**

Create `agent/bridge/src/json-rpc-client.js` with:

```js
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
```

- [ ] **Step 4: Run JSON-RPC tests**

Run:

```bash
npm run test:bridge -- agent/bridge/test/json-rpc-client.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit JSON-RPC client**

Run:

```bash
git add agent/bridge/src/json-rpc-client.js agent/bridge/test/json-rpc-client.test.js
git commit -m "feat: add app server json rpc client"
```

---

### Task 6: App-Server Adapter

**Files:**
- Create: `agent/bridge/src/app-server-adapter.js`
- Create: `agent/bridge/test/app-server-adapter.test.js`

- [ ] **Step 1: Write app-server adapter tests**

Create `agent/bridge/test/app-server-adapter.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServerAdapter } from '../src/app-server-adapter.js';

function fakeClient() {
  const calls = [];
  return {
    calls,
    async request(method, params) {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      if (method === 'mcpServer/tool/call') return { content: [{ type: 'text', text: 'ok' }] };
      return {};
    }
  };
}

test('ensureThread starts a new Photoshop thread when no thread id exists', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client });
  assert.equal(await adapter.ensureThread(), 'thread-1');
  assert.equal(client.calls[0].method, 'thread/start');
});

test('startTurn sends message and thread id', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client });
  await adapter.ensureThread();
  await adapter.startTurn('hello');
  assert.deepEqual(client.calls[1], {
    method: 'turn/start',
    params: { threadId: 'thread-1', input: 'hello' }
  });
});

test('callMcpTool forwards server, tool, and arguments', async () => {
  const client = fakeClient();
  const adapter = createAppServerAdapter({ client });
  const result = await adapter.callMcpTool('photoshop', 'photoshop_place_latest_codex_image', { fitMode: 'fit' });
  assert.deepEqual(result, { content: [{ type: 'text', text: 'ok' }] });
  assert.equal(client.calls[0].method, 'mcpServer/tool/call');
});
```

- [ ] **Step 2: Run app-server adapter tests to verify they fail**

Run:

```bash
npm run test:bridge -- agent/bridge/test/app-server-adapter.test.js
```

Expected: fails because `agent/bridge/src/app-server-adapter.js` does not exist.

- [ ] **Step 3: Implement the app-server adapter**

Create `agent/bridge/src/app-server-adapter.js` with:

```js
export function createAppServerAdapter({ client, threadId = null } = {}) {
  if (!client) throw new Error('createAppServerAdapter requires a JSON-RPC client');
  let activeThreadId = threadId;

  return {
    get threadId() {
      return activeThreadId;
    },

    async ensureThread() {
      if (activeThreadId) return activeThreadId;
      const result = await client.request('thread/start', {
        title: 'Codex PS',
        metadata: { source: 'codex-ps-agent' }
      });
      activeThreadId = result?.thread?.id || result?.id;
      if (!activeThreadId) throw new Error('Codex app-server did not return a thread id');
      return activeThreadId;
    },

    async startTurn(input) {
      const threadIdForTurn = await this.ensureThread();
      return client.request('turn/start', { threadId: threadIdForTurn, input });
    },

    async interruptTurn() {
      const threadIdForTurn = await this.ensureThread();
      return client.request('turn/interrupt', { threadId: threadIdForTurn });
    },

    async callMcpTool(server, tool, args = {}) {
      return client.request('mcpServer/tool/call', {
        server,
        tool,
        arguments: args
      });
    }
  };
}
```

- [ ] **Step 4: Run app-server adapter tests**

Run:

```bash
npm run test:bridge -- agent/bridge/test/app-server-adapter.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit app-server adapter**

Run:

```bash
git add agent/bridge/src/app-server-adapter.js agent/bridge/test/app-server-adapter.test.js
git commit -m "feat: add codex app server adapter"
```

---

### Task 7: Photoshop Tool Adapter With Policy Enforcement

**Files:**
- Create: `agent/bridge/src/photoshop-tools.js`
- Create: `agent/bridge/test/photoshop-tools.test.js`

- [ ] **Step 1: Write Photoshop tool adapter tests**

Create `agent/bridge/test/photoshop-tools.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoshopTools } from '../src/photoshop-tools.js';

function fakeAppServer() {
  const calls = [];
  return {
    calls,
    async callMcpTool(server, tool, args) {
      calls.push({ server, tool, args });
      return { content: [{ type: 'text', text: `${tool}: ok` }] };
    }
  };
}

test('safe-auto imports latest Codex image through Photoshop MCP', async () => {
  const appServer = fakeAppServer();
  const tools = createPhotoshopTools({ appServer, mode: 'safe-auto' });
  await tools.placeLatestCodexImage({ fitMode: 'fit' });
  assert.deepEqual(appServer.calls[0], {
    server: 'photoshop',
    tool: 'photoshop_place_latest_codex_image',
    args: { fitMode: 'fit', layerName: 'Codex Generated Image' }
  });
});

test('safe-auto blocks destructive actions', async () => {
  const tools = createPhotoshopTools({ appServer: fakeAppServer(), mode: 'safe-auto' });
  await assert.rejects(() => tools.deleteLayer({ layerId: 7 }), /delete_layer blocked in B safe-auto mode/);
});

test('full-auto still requires protection for delete', async () => {
  const tools = createPhotoshopTools({ appServer: fakeAppServer(), mode: 'full-auto' });
  await assert.rejects(() => tools.deleteLayer({ layerId: 7 }), /requires a protection point/);
});
```

- [ ] **Step 2: Run Photoshop adapter tests to verify they fail**

Run:

```bash
npm run test:bridge -- agent/bridge/test/photoshop-tools.test.js
```

Expected: fails because `agent/bridge/src/photoshop-tools.js` does not exist.

- [ ] **Step 3: Implement Photoshop tool adapter**

Create `agent/bridge/src/photoshop-tools.js` with:

```js
import { requireAllowedAction } from './policy.js';

const PHOTOSHOP_SERVER = 'photoshop';

export function createPhotoshopTools({ appServer, mode = 'safe-auto', protectionReady = false } = {}) {
  if (!appServer) throw new Error('createPhotoshopTools requires appServer');

  function allowed(action) {
    return requireAllowedAction(mode, action, { protectionReady });
  }

  return {
    async readDocument() {
      allowed('read_document');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_get_document_info', {});
    },

    async readLayers() {
      allowed('read_layers');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_get_layers', {});
    },

    async placeLatestCodexImage(args = {}) {
      allowed('place_latest_codex_image');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_place_latest_codex_image', {
        fitMode: args.fitMode || 'fit',
        layerName: args.layerName || 'Codex Generated Image'
      });
    },

    async deleteLayer(args = {}) {
      allowed('delete_layer');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_delete_layer', args);
    }
  };
}
```

- [ ] **Step 4: Run Photoshop adapter tests**

Run:

```bash
npm run test:bridge -- agent/bridge/test/photoshop-tools.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit Photoshop tool adapter**

Run:

```bash
git add agent/bridge/src/photoshop-tools.js agent/bridge/test/photoshop-tools.test.js
git commit -m "feat: gate photoshop tools by mode"
```

---

### Task 8: Local HTTP/SSE Bridge

**Files:**
- Create: `agent/bridge/src/server.js`
- Create: `agent/bridge/src/index.js`
- Create: `agent/bridge/test/server.test.js`

- [ ] **Step 1: Write bridge server tests**

Create `agent/bridge/test/server.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeServer } from '../src/server.js';

test('GET /health returns bridge status', async () => {
  const server = createBridgeServer({ appServer: { startTurn: async () => ({}) } });
  const listener = await server.listen(0);
  try {
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    await server.close();
  }
});

test('POST /chat accepts a message', async () => {
  const calls = [];
  const server = createBridgeServer({
    appServer: {
      async startTurn(message) {
        calls.push(message);
        return { turn: { id: 'turn-1' } };
      }
    }
  });
  const listener = await server.listen(0);
  try {
    const port = listener.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello', mode: 'safe-auto' })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(calls, ['hello']);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run bridge server tests to verify they fail**

Run:

```bash
npm run test:bridge -- agent/bridge/test/server.test.js
```

Expected: fails because `agent/bridge/src/server.js` does not exist.

- [ ] **Step 3: Implement the bridge server**

Create `agent/bridge/src/server.js` with:

```js
import http from 'node:http';
import { panelEvent, serializeSse } from './events.js';
import { normalizeMode } from './policy.js';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(data));
}

export function createBridgeServer({ appServer, store, host = '127.0.0.1' } = {}) {
  const sseClients = new Set();

  function broadcast(event) {
    for (const res of sseClients) res.write(serializeSse(event));
  }

  const listener = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && req.url === '/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'access-control-allow-origin': '*'
        });
        sseClients.add(res);
        res.write(serializeSse(panelEvent('status', { message: 'Connected to Codex PS bridge' })));
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (req.method === 'POST' && req.url === '/chat') {
        const body = await readJson(req);
        const mode = normalizeMode(body.mode);
        await store?.update?.({ mode });
        broadcast(panelEvent('user_message', { text: body.message, mode }));
        await appServer.startTurn(body.message);
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (error) {
      broadcast(panelEvent('error', { message: error.message }));
      sendJson(res, 500, { ok: false, error: error.message });
    }
  });

  return {
    listen(port = 17891) {
      return new Promise(resolve => listener.listen(port, host, () => resolve(listener)));
    },
    close() {
      return new Promise(resolve => listener.close(resolve));
    },
    broadcast
  };
}
```

Create `agent/bridge/src/index.js` with:

```js
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
```

- [ ] **Step 4: Run bridge server tests**

Run:

```bash
npm run test:bridge -- agent/bridge/test/server.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit bridge server**

Run:

```bash
git add agent/bridge/src/server.js agent/bridge/src/index.js agent/bridge/test/server.test.js
git commit -m "feat: add codex ps bridge server"
```

---

### Task 9: UXP Panel Static UI

**Files:**
- Create: `agent/panel/manifest.json`
- Create: `agent/panel/index.html`
- Create: `agent/panel/styles.css`
- Create: `agent/panel/panel.js`
- Create: `agent/panel/test/static.test.js`

- [ ] **Step 1: Write panel static tests**

Create `agent/panel/test/static.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('panel manifest declares a Photoshop panel', async () => {
  const manifest = JSON.parse(await readFile('agent/panel/manifest.json', 'utf8'));
  assert.equal(manifest.host[0].app, 'PS');
  assert.equal(manifest.entrypoints[0].type, 'panel');
});

test('panel copy does not mention template slot mapping', async () => {
  const html = await readFile('agent/panel/index.html', 'utf8');
  const js = await readFile('agent/panel/panel.js', 'utf8');
  assert.doesNotMatch(`${html}\n${js}`, /模板|插槽|IMG_MAIN|LOGO/);
});
```

- [ ] **Step 2: Run panel tests to verify they fail**

Run:

```bash
npm run test:panel
```

Expected: fails because panel files do not exist.

- [ ] **Step 3: Create the UXP manifest**

Create `agent/panel/manifest.json` with:

```json
{
  "id": "com.codex.ps.agent",
  "name": "Codex PS Agent",
  "version": "0.1.0",
  "main": "index.html",
  "host": [
    {
      "app": "PS",
      "minVersion": "25.0.0"
    }
  ],
  "manifestVersion": 5,
  "entrypoints": [
    {
      "type": "panel",
      "id": "codexPsAgentPanel",
      "label": {
        "default": "Codex PS"
      },
      "minimumSize": {
        "width": 320,
        "height": 420
      },
      "maximumSize": {
        "width": 520,
        "height": 1200
      },
      "preferredDockedSize": {
        "width": 360,
        "height": 720
      }
    }
  ],
  "requiredPermissions": {
    "network": {
      "domains": ["http://127.0.0.1:17891"]
    }
  }
}
```

- [ ] **Step 4: Create panel markup**

Create `agent/panel/index.html` with:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Codex PS</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main class="panel">
      <header class="topbar">
        <div>
          <strong>Codex PS</strong>
          <span id="connection">Disconnected</span>
        </div>
        <button id="interrupt" title="Stop current run">Stop</button>
      </header>

      <section class="mode-switch" aria-label="Execution mode">
        <button data-mode="safe-auto" class="active">B 安全自动</button>
        <button data-mode="full-auto">C 全自动</button>
      </section>

      <section id="log" class="log" aria-live="polite"></section>

      <section class="quick-actions">
        <button id="import-latest">导入最新图</button>
        <button id="read-canvas">读取画布</button>
        <button id="read-layers">读取图层</button>
      </section>

      <form id="composer" class="composer">
        <textarea id="message" rows="3" placeholder="描述你要生成、导入或修改的画面..."></textarea>
        <button type="submit">发送</button>
      </form>
    </main>
    <script type="module" src="./panel.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Create panel styles**

Create `agent/panel/styles.css` with the approved compact dark UI:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  background: #15171a;
  color: #e5e7eb;
  font: 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button,
textarea {
  font: inherit;
}

.panel {
  height: 100vh;
  display: grid;
  grid-template-rows: auto auto 1fr auto auto;
  background: #202327;
  border: 1px solid #30343a;
}

.topbar {
  height: 42px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #30343a;
}

.topbar span {
  display: block;
  margin-top: 2px;
  color: #94a3b8;
  font-size: 11px;
}

.topbar button,
.composer button,
.quick-actions button,
.mode-switch button {
  border: 1px solid #454b55;
  border-radius: 8px;
  background: #30343a;
  color: #e5e7eb;
  min-height: 32px;
  padding: 0 10px;
}

.mode-switch {
  padding: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  border-bottom: 1px solid #30343a;
}

.mode-switch button.active {
  background: #0f766e;
  border-color: #14b8a6;
  color: #ffffff;
}

.log {
  padding: 10px;
  overflow-y: auto;
}

.event {
  margin-bottom: 8px;
  border-radius: 8px;
  padding: 9px 10px;
  background: #24282e;
  border: 1px solid #343a44;
  line-height: 1.45;
}

.event.user {
  background: #303743;
}

.event.tool_event {
  border-color: rgba(245, 158, 11, 0.34);
  background: rgba(245, 158, 11, 0.08);
  color: #fde68a;
}

.event.error {
  border-color: rgba(248, 113, 113, 0.38);
  background: rgba(248, 113, 113, 0.08);
  color: #fecaca;
}

.quick-actions {
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  border-top: 1px solid #30343a;
}

.composer {
  padding: 10px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  border-top: 1px solid #30343a;
  background: #1d2024;
}

textarea {
  width: 100%;
  resize: none;
  border: 1px solid #3a3f46;
  background: #15171a;
  color: #f8fafc;
  border-radius: 8px;
  padding: 10px;
}

.composer button {
  background: #0f766e;
  border-color: #14b8a6;
  color: #ffffff;
  font-weight: 700;
}
```

- [ ] **Step 6: Create panel client logic**

Create `agent/panel/panel.js` with:

```js
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
```

- [ ] **Step 7: Run panel tests**

Run:

```bash
npm run test:panel
```

Expected: all tests pass.

- [ ] **Step 8: Commit panel shell**

Run:

```bash
git add agent/panel
git commit -m "feat: add codex ps uxp panel shell"
```

---

### Task 10: App-Server Wiring In Bridge Entrypoint

**Files:**
- Modify: `agent/bridge/src/index.js`
- Create: `agent/scripts/start-dev.mjs`
- Test: `agent/bridge/test/app-server-wiring.test.js`

- [ ] **Step 1: Write wiring test**

Create `agent/bridge/test/app-server-wiring.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServerAdapter } from '../src/app-server-adapter.js';

test('app-server adapter can be constructed with an existing thread id', () => {
  const adapter = createAppServerAdapter({
    threadId: 'thread-existing',
    client: { request: async () => ({}) }
  });
  assert.equal(adapter.threadId, 'thread-existing');
});
```

- [ ] **Step 2: Run wiring test**

Run:

```bash
npm run test:bridge -- agent/bridge/test/app-server-wiring.test.js
```

Expected: passes after Task 6.

- [ ] **Step 3: Replace mock app-server in `index.js`**

Modify `agent/bridge/src/index.js` to:

```js
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { createStore } from './store.js';
import { createBridgeServer } from './server.js';
import { createJsonRpcClient } from './json-rpc-client.js';
import { createAppServerAdapter } from './app-server-adapter.js';

const port = Number(process.env.CODEX_PS_BRIDGE_PORT || 17891);
const statePath = process.env.CODEX_PS_STATE_PATH || join(homedir(), '.codex-ps-agent', 'state.json');
const codexBin = process.env.CODEX_BIN || 'codex';

const store = createStore(statePath);
const state = await store.read();

const daemon = spawn(codexBin, ['app-server', 'daemon', 'start'], { stdio: 'ignore' });
await new Promise(resolve => daemon.on('exit', resolve));

const proxy = spawn(codexBin, ['app-server', 'proxy'], { stdio: ['pipe', 'pipe', 'pipe'] });
proxy.stderr.on('data', chunk => console.error(chunk.toString('utf8')));

const client = createJsonRpcClient({ input: proxy.stdout, output: proxy.stdin });
const appServer = createAppServerAdapter({ client, threadId: state.threadId });
const server = createBridgeServer({ appServer, store });

await server.listen(port);
console.log(`Codex PS bridge listening on http://127.0.0.1:${port}`);

process.on('SIGINT', async () => {
  await store.update({ threadId: appServer.threadId });
  proxy.kill();
  await server.close();
  process.exit(0);
});
```

- [ ] **Step 4: Add the dev script**

Create `agent/scripts/start-dev.mjs` with:

```js
import '../bridge/src/index.js';
```

- [ ] **Step 5: Run bridge tests**

Run:

```bash
npm run test:bridge
```

Expected: all bridge tests pass.

- [ ] **Step 6: Start the bridge manually**

Run:

```bash
npm run dev:bridge
```

Expected: terminal prints `Codex PS bridge listening on http://127.0.0.1:17891`.

- [ ] **Step 7: Commit app-server wiring**

Run:

```bash
git add agent/bridge/src/index.js agent/scripts/start-dev.mjs agent/bridge/test/app-server-wiring.test.js
git commit -m "feat: wire bridge to codex app server"
```

---

### Task 11: Manual Photoshop Import Verification

**Files:**
- Modify: `scripts/photoshop-mcp-smoke-test.mjs`
- Create: `docs/superpowers/verification/2026-05-18-codex-ps-agent.md`

- [ ] **Step 1: Add a short verification document**

Create `docs/superpowers/verification/2026-05-18-codex-ps-agent.md` with:

```markdown
# Codex PS Agent Verification

## Automated

- `npm test`
- `node scripts/photoshop-mcp-smoke-test.mjs`

## Manual Photoshop Flow

1. Start Photoshop.
2. Open or create a document.
3. Start the bridge with `npm run dev:bridge`.
4. Load `agent/panel` in UXP Developer Tool.
5. Open the `Codex PS` panel.
6. Confirm the panel connects to `http://127.0.0.1:17891`.
7. Send: `导入最新 Codex 图片到当前 Photoshop 画布，作为智能对象。`
8. Confirm a new smart object layer appears.
9. Confirm existing layers are not deleted, merged, flattened, or overwritten in B mode.

## Current Risk

The first implementation proves the bridge, event stream, panel shell, and latest-image import path. C full-auto mode remains an advanced UI mode and must not run destructive actions until protection-point creation is implemented and verified.
```

- [ ] **Step 2: Run all tests**

Run:

```bash
npm test
```

Expected: all Node tests pass.

- [ ] **Step 3: Run existing Photoshop MCP smoke test**

Run:

```bash
node scripts/photoshop-mcp-smoke-test.mjs
```

Expected: smoke test reports all required Photoshop MCP checks passing when Photoshop is open.

- [ ] **Step 4: Commit verification notes**

Run:

```bash
git add docs/superpowers/verification/2026-05-18-codex-ps-agent.md
git commit -m "docs: add codex ps agent verification"
```

---

### Task 12: Push Versioned Work

**Files:**
- No source files created in this task.

- [ ] **Step 1: Check working tree**

Run:

```bash
git status -sb
```

Expected: clean working tree on `main`.

- [ ] **Step 2: Push to GitHub**

Run:

```bash
git push
```

Expected: pushes commits to `https://github.com/1023298516/codex-ps`.

- [ ] **Step 3: Confirm remote head**

Run:

```bash
git ls-remote origin refs/heads/main
```

Expected: remote `main` SHA matches local `git rev-parse HEAD`.

---

## Self-Review

- Spec coverage:
  - Photoshop side-docked panel: Task 9.
  - Chat-first interaction: Tasks 8 and 9.
  - Automatic execution: Tasks 6, 8, and 10.
  - B safe-auto default: Tasks 2, 7, and 9.
  - C full-auto advanced switch: Tasks 2 and 9.
  - Latest Codex image import: Task 7, verified in Task 11.
  - Error/event visibility: Tasks 3, 8, and 9.
  - Versioned work on GitHub: Task 12.
- Completeness scan:
  - No empty markers or unspecified test sections are included.
- Type consistency:
  - Mode values are consistently `safe-auto` and `full-auto`.
  - App-server wrapper names are consistently `createAppServerAdapter`, `startTurn`, and `callMcpTool`.
  - Photoshop adapter names are consistently `createPhotoshopTools`, `placeLatestCodexImage`, `readDocument`, `readLayers`, and `deleteLayer`.
