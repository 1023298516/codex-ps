import { anthropicAdapter } from './anthropic.js';
import { googleAdapter } from './google.js';
import { openaiAdapter } from './openai.js';
import { openrouterAdapter } from './openrouter.js';
export const providers = {
    anthropic: anthropicAdapter,
    openai: openaiAdapter,
    openrouter: openrouterAdapter,
    google: googleAdapter,
};
export function getProvider(id) {
    return providers[id];
}
export function listProviders() {
    return Object.values(providers);
}
//# sourceMappingURL=registry.js.map