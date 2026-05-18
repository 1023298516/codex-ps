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
