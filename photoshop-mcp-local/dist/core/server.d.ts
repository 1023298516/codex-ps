export declare class PhotoshopMCPServer {
    private server;
    private logger;
    private toolRegistry;
    private session;
    constructor();
    private registerTools;
    private setupHandlers;
    private pingPhotoshop;
    private getVersion;
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map