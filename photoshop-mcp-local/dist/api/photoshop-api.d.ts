import { PhotoshopConnection } from '../platform/connection.js';
export type APIType = 'UXP' | 'ExtendScript';
export interface PhotoshopAPI {
    /**
     * Execute a script using the appropriate API
     */
    executeScript(script: string): Promise<unknown>;
    /**
     * Get the API type being used
     */
    getAPIType(): APIType;
}
export declare class PhotoshopAPIFactory {
    private logger;
    private connection;
    constructor(connection: PhotoshopConnection);
    createAPI(): Promise<PhotoshopAPI>;
    private determineAPIType;
}
//# sourceMappingURL=photoshop-api.d.ts.map