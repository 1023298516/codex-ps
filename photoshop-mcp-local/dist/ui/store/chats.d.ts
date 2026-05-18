import type { LanguageModelUsage } from 'ai';
import type { UsageCost } from '../providers/registry.js';
export interface ChatRow {
    id: string;
    title: string;
    provider: string;
    model: string;
    sessionId: string | null;
    createdAt: number;
    updatedAt: number;
}
export interface MessageContent {
    text: string;
    toolCalls: Array<{
        id: string;
        name: string;
        input: unknown;
        result?: {
            ok: boolean;
            content: string;
        };
        status: 'pending' | 'success' | 'error';
    }>;
    usage?: LanguageModelUsage;
    cost?: UsageCost;
    provider?: string;
    model?: string;
}
export interface MessageRow {
    id: string;
    chatId: string;
    role: 'user' | 'assistant';
    content: MessageContent;
    createdAt: number;
}
export declare function listChats(): ChatRow[];
export declare function getChat(id: string): ChatRow | null;
export declare function getMessages(chatId: string): MessageRow[];
export declare function createChat(input: {
    provider: string;
    model: string;
    title?: string;
}): ChatRow;
export declare function appendMessage(input: {
    chatId: string;
    role: 'user' | 'assistant';
    content: MessageContent;
}): MessageRow;
export declare function renameChat(id: string, title: string): void;
export declare function updateChatModel(id: string, provider: string, model: string): void;
export declare function deleteChat(id: string): void;
export declare function setChatSessionId(id: string, sessionId: string | null): void;
//# sourceMappingURL=chats.d.ts.map