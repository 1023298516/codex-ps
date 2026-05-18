export interface PhotoshopInfo {
    version: string;
    path: string;
    isRunning: boolean;
    appName?: string;
}
export declare class PhotoshopConnection {
    private logger;
    private detector;
    private executor;
    private photoshopInfo;
    private macosExecutor?;
    constructor();
    ping(): Promise<boolean>;
    getVersion(): Promise<string>;
    executeScript(script: string, timeout?: number): Promise<unknown>;
    getPhotoshopInfo(): PhotoshopInfo | null;
    ensurePhotoshopRunning(): Promise<void>;
}
//# sourceMappingURL=connection.d.ts.map