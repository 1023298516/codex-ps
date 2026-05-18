import { PhotoshopInfo } from './connection.js';
export declare class MacOSDetector {
    private logger;
    constructor();
    detect(): Promise<PhotoshopInfo>;
    private detectUsingSpotlight;
    private getCommonPaths;
    private checkPath;
    private extractVersionFromApp;
    private checkIfRunning;
    getAppBundleId(appPath: string): Promise<string | null>;
}
//# sourceMappingURL=macos-detector.d.ts.map