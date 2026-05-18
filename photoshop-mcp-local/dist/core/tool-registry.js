import { Logger } from '../utils/logger.js';
export class ToolRegistry {
    logger;
    tools;
    constructor() {
        this.logger = new Logger('ToolRegistry');
        this.tools = new Map();
    }
    register(name, definition) {
        if (this.tools.has(name)) {
            this.logger.warn(`Tool '${name}' already registered, overwriting`);
        }
        this.tools.set(name, definition);
        this.logger.debug(`Registered tool: ${name}`);
    }
    unregister(name) {
        const result = this.tools.delete(name);
        if (result) {
            this.logger.debug(`Unregistered tool: ${name}`);
        }
        return result;
    }
    has(name) {
        return this.tools.has(name);
    }
    get(name) {
        return this.tools.get(name);
    }
    list() {
        return Array.from(this.tools.values()).map((def) => def.tool);
    }
    async execute(name, args) {
        const definition = this.tools.get(name);
        if (!definition) {
            throw new Error(`Tool not found: ${name}`);
        }
        try {
            this.logger.debug(`Executing tool: ${name}`);
            const result = await definition.handler(args);
            return result;
        }
        catch (error) {
            this.logger.error(`Tool execution failed: ${name}`, error);
            throw error;
        }
    }
    clear() {
        this.tools.clear();
        this.logger.debug('All tools cleared');
    }
    count() {
        return this.tools.size;
    }
}
//# sourceMappingURL=tool-registry.js.map