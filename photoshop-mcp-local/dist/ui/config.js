import { kvGet, kvSet } from './store/kv.js';
const KV_KEY = 'config';
const DEFAULT_CONFIG = {
    providers: {},
    activeProvider: 'anthropic',
    activeModel: 'claude-sonnet-4-5',
};
export function loadConfig() {
    const stored = kvGet(KV_KEY);
    if (!stored)
        return { ...DEFAULT_CONFIG, providers: {} };
    return {
        ...DEFAULT_CONFIG,
        ...stored,
        providers: { ...stored.providers },
    };
}
export function saveConfig(patch) {
    const current = loadConfig();
    const next = {
        ...current,
        ...patch,
        providers: { ...current.providers, ...(patch.providers ?? {}) },
    };
    kvSet(KV_KEY, next);
    return next;
}
export function setProviderConfig(id, patch) {
    const current = loadConfig();
    const merged = { ...current.providers[id], ...patch };
    return saveConfig({
        providers: { ...current.providers, [id]: merged },
    });
}
export function getProviderConfig(id) {
    return loadConfig().providers[id];
}
export function maskApiKey(apiKey) {
    if (!apiKey)
        return null;
    if (apiKey.length <= 12)
        return '***';
    return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}
//# sourceMappingURL=config.js.map