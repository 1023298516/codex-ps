import { PhotoshopConnection } from '../platform/connection.js';
export interface SessionConfig {
    autoConnect?: boolean;
    reconnectAttempts?: number;
    reconnectDelay?: number;
}
export declare class Session {
    private logger;
    private connection;
    private config;
    private isConnected;
    private lastActivity;
    constructor(config?: SessionConfig);
    initialize(): Promise<void>;
    connect(): Promise<boolean>;
    reconnect(): Promise<boolean>;
    disconnect(): Promise<void>;
    getConnection(): PhotoshopConnection;
    getConnectionStatus(): boolean;
    getLastActivity(): Date;
    updateActivity(): void;
    private delay;
}
//# sourceMappingURL=session.d.ts.map