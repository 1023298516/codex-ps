/**
 * Helper functions for batchPlay API
 * batchPlay is the modern way to execute Photoshop actions in UXP
 */
export interface ActionDescriptor {
    _obj: string;
    [key: string]: unknown;
}
export interface BatchPlayOptions {
    synchronousExecution?: boolean;
    modalBehavior?: 'wait' | 'execute' | 'fail';
}
/**
 * Create a batchPlay command template
 */
export declare function createBatchPlayCommand(action: string, params?: Record<string, unknown>): ActionDescriptor;
/**
 * Execute batchPlay commands
 */
export declare function generateBatchPlayScript(descriptors: ActionDescriptor[], options?: BatchPlayOptions): string;
/**
 * Common batchPlay action descriptors
 */
export declare const Actions: {
    /**
     * Create a new document
     */
    newDocument: (width: number, height: number, resolution?: number, colorMode?: string) => ActionDescriptor;
    /**
     * Get active document info
     */
    getDocumentInfo: () => ActionDescriptor;
    /**
     * Create a text layer
     */
    createTextLayer: (text: string, x?: number, y?: number) => ActionDescriptor;
    /**
     * Save document
     */
    saveDocument: (path: string, format?: string) => ActionDescriptor;
    /**
     * Close document
     */
    closeDocument: (save?: boolean) => ActionDescriptor;
    /**
     * Fill layer with color
     */
    fillLayer: (red: number, green: number, blue: number) => ActionDescriptor;
    /**
     * Create a new layer
     */
    newLayer: (name?: string) => ActionDescriptor;
    /**
     * Delete current layer
     */
    deleteLayer: () => ActionDescriptor;
    /**
     * Resize image
     */
    resizeImage: (width: number, height: number) => ActionDescriptor;
};
//# sourceMappingURL=batch-play.d.ts.map