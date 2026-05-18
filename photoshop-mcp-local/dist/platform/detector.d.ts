import { PhotoshopInfo } from './connection.js';
export declare class PhotoshopDetector {
    private logger;
    private platformType;
    private windowsDetector?;
    private macosDetector?;
    constructor();
    detect(): Promise<PhotoshopInfo>;
    /**
     * Determine if detected Photoshop version supports UXP
     * UXP is supported in Photoshop 23.5+ (roughly 2022+)
     */
    supportsUXP(version: string): boolean;
    /**
     * Get recommended API type based on version
     */
    getRecommendedAPI(version: string): 'UXP' | 'ExtendScript';
}
//# sourceMappingURL=detector.d.ts.map