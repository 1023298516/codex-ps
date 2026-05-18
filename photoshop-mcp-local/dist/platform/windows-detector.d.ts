import { PhotoshopInfo } from './connection.js';
export declare class WindowsDetector {
    private logger;
    constructor();
    detect(): Promise<PhotoshopInfo>;
    private detectFromRegistry;
    private parseRegistryOutput;
    private extractPathFromCLSID;
    private getCommonPaths;
    private checkPath;
    private extractVersionFromPath;
    private checkIfRunning;
}
//# sourceMappingURL=windows-detector.d.ts.map