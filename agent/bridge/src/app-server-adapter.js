function toTurnInput(input) {
  if (Array.isArray(input)) return input;
  return [{ type: 'text', text: String(input ?? '') }];
}

function isMissingThreadError(error) {
  return /thread not found/i.test(error?.message || '');
}

export function createAppServerAdapter({
  client,
  threadId = null,
  cwd = process.cwd(),
  clientInfo = { name: 'codex-ps-agent', version: '0.1.0' },
  capabilities = { experimentalApi: true }
} = {}) {
  if (!client) throw new Error('createAppServerAdapter requires a JSON-RPC client');
  let activeThreadId = threadId;
  let initializePromise = null;

  async function initialize() {
    if (!initializePromise) {
      initializePromise = client.request('initialize', { clientInfo, capabilities });
    }
    await initializePromise;
  }

  return {
    get threadId() {
      return activeThreadId;
    },

    initialize,

    async ensureThread() {
      await initialize();
      if (activeThreadId) return activeThreadId;
      const result = await client.request('thread/start', { cwd, threadSource: 'user' });
      activeThreadId = result?.thread?.id || result?.threadId || result?.id;
      if (!activeThreadId) throw new Error('Codex app-server did not return a thread id');
      return activeThreadId;
    },

    async startTurn(input) {
      const threadIdForTurn = await this.ensureThread();
      const turnInput = toTurnInput(input);
      try {
        return await client.request('turn/start', {
          threadId: threadIdForTurn,
          input: turnInput
        });
      } catch (error) {
        if (!isMissingThreadError(error)) throw error;
        activeThreadId = null;
        const recoveredThreadId = await this.ensureThread();
        return client.request('turn/start', {
          threadId: recoveredThreadId,
          input: turnInput
        });
      }
    },

    async interruptTurn() {
      const threadIdForTurn = await this.ensureThread();
      return client.request('turn/interrupt', { threadId: threadIdForTurn });
    },

    async callMcpTool(server, tool, args = {}) {
      await initialize();
      return client.request('mcpServer/tool/call', {
        server,
        tool,
        arguments: args
      });
    }
  };
}
