/** API response for quota limits */
export interface QuotaLimitResponse {
    limits: QuotaLimit[];
}

export interface QuotaLimit {
    type: 'TOKENS_LIMIT' | 'TIME_LIMIT';
    percentage: number;
    currentValue?: string;
    usage?: string;
    usageDetails?: Record<string, unknown>;
}

/** API response for model/tool usage */
export interface UsageResponse {
    data: UsageData[];
}

export interface UsageData {
    timestamp: string;
    model?: string;
    tool?: string;
    tokens?: number;
    requests?: number;
}

/** Combined usage data for UI */
export interface CombinedUsageData {
    quotaLimits: QuotaLimitResponse;
    modelUsage: UsageResponse;
    toolUsage: UsageResponse;
    timestamp: string;
}

/** Display-friendly quota summary */
export interface QuotaSummary {
    tokenUsage: { percentage: number; used: number; total: number; };
    mcpUsage: { percentage: number; used: number; total: number; };
}

/** Platform type */
export type Platform = 'ZAI' | 'ZHIPU';

/** API configuration */
export interface ApiConfig {
    authToken: string;
    baseUrl: string;
}
