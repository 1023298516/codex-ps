export interface UIServerOptions {
    port: number;
    host: string;
}
export interface UIServer {
    url: string;
    close(): Promise<void>;
}
export declare function startUIServer(opts: UIServerOptions): Promise<UIServer>;
//# sourceMappingURL=server.d.ts.map