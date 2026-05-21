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
