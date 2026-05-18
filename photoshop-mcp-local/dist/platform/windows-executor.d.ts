import { ScriptExecutor } from './script-executor.js';
export declare class WindowsExecutor implements ScriptExecutor {
    private logger;
    private scriptQueue;
    private isProcessing;
    constructor();
    execute(script: string, timeout?: number): Promise<unknown>;
    private processQueue;
    private executeScript;
    private createVBSWrapper;
    private parseResult;
    isPhotoshopRunning(): Promise<boolean>;
    launchPhotoshop(photoshopPath: string): Promise<void>;
}
//# sourceMappingURL=windows-executor.d.ts.map