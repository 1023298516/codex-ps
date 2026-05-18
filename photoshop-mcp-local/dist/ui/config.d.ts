export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'google';
export interface ProviderConfig {
    apiKey?: string;
    defaultModel?: string;
}
export interface UIConfig {
    providers: Partial<Record<ProviderId, ProviderConfig>>;
    activeProvider: ProviderId;
    activeModel: string;
}
export declare function loadConfig(): UIConfig;
export declare function saveConfig(patch: Partial<UIConfig>): UIConfig;
export declare function setProviderConfig(id: ProviderId, patch: ProviderConfig): UIConfig;
export declare function getProviderConfig(id: ProviderId): ProviderConfig | undefined;
export declare function maskApiKey(apiKey?: string): string | null;
//# sourceMappingURL=config.d.ts.map