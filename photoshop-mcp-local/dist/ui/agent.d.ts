import { type LanguageModelUsage, type ModelMessage } from 'ai';
import type { ModelPricing, ProviderAdapter, UsageCost } from './providers/registry.js';
export interface ToolCallPersist {
    id: string;
    name: string;
    input: unknown;
    result?: {
        ok: boolean;
        content: string;
    };
    status: 'pending' | 'success' | 'error';
}
export interface AssistantBuffer {
    text: string;
    toolCalls: ToolCallPersist[];
}
export interface RunChatStreamEvent {
    type: 'text-delta' | 'tool-call' | 'tool-result' | 'finish' | 'error';
    payload: unknown;
}
export interface RunChatFinishInfo {
    usage: LanguageModelUsage;
    cost?: UsageCost;
}
export interface RunChatOptions {
    prompt: string;
    history: ModelMessage[];
    provider: ProviderAdapter;
    apiKey: string;
    modelId: string;
    abortSignal: AbortSignal;
    onAssistantBuffer?: (buf: AssistantBuffer) => void;
    onFinish?: (info: RunChatFinishInfo) => void;
}
export declare const PHOTOSHOP_SYSTEM_PROMPT: string;
export declare function runChat(opts: RunChatOptions): AsyncGenerator<RunChatStreamEvent>;
export declare function computeCost(usage: LanguageModelUsage, pricing: ModelPricing): UsageCost;
export declare function buildHistory(messages: Array<{
    role: 'user' | 'assistant';
    content: {
        text: string;
    };
}>): ModelMessage[];
//# sourceMappingURL=agent.d.ts.map