import type { ProviderAdapter, ProviderId } from './types.js';
export declare const providers: Record<ProviderId, ProviderAdapter>;
export declare function getProvider(id: string): ProviderAdapter | undefined;
export declare function listProviders(): ProviderAdapter[];
export type { ModelPricing, ProviderAdapter, ProviderId, UsageCost } from './types.js';
//# sourceMappingURL=registry.d.ts.map