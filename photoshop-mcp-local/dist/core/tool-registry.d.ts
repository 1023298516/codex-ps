import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
export interface ToolHandler {
    (args: Record<string, unknown>): Promise<CallToolResult>;
}
export type ToolResult = CallToolResult;
export interface ToolDefinition {
    tool: Tool;
    handler: ToolHandler;
}
export declare class ToolRegistry {
    private logger;
    private tools;
    constructor();
    register(name: string, definition: ToolDefinition): void;
    unregister(name: string): boolean;
    has(name: string): boolean;
    get(name: string): ToolDefinition | undefined;
    list(): Tool[];
    execute(name: string, args: Record<string, unknown>): Promise<ToolResult>;
    clear(): void;
    count(): number;
}
//# sourceMappingURL=tool-registry.d.ts.map