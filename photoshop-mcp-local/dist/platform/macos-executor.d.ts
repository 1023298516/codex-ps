import { ScriptExecutor } from './script-executor.js';
export declare class MacOSExecutor implements ScriptExecutor {
    private logger;
    private scriptQueue;
    private isProcessing;
    private appName;
    constructor();
    setAppName(appName: string): void;
    execute(script: string, timeout?: number): Promise<unknown>;
    private processQueue;
    private executeScript;
    private createAppleScriptWrapper;
    private parseResult;
    isPhotoshopRunning(): Promise<boolean>;
    launchPhotoshop(photoshopPath: string): Promise<void>;
    /**
     * Alternative method using 'do shell script' via AppleScript
     * This can be more reliable for some versions
     */
    executeViaDoShellScript(script: string): Promise<unknown>;
}
//# sourceMappingURL=macos-executor.d.ts.map