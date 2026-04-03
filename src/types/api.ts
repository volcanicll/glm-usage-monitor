/** API response for quota limits */
export interface QuotaLimitResponse {
    limits: QuotaLimit[];
}

export interface QuotaLimit {
    type: 'TOKENS_LIMIT' | 'TIME_LIMIT';
    percentage: number;
    currentValue?: string | number;
    currentUsage?: string | number;
    used?: string | number;
    usage?: string | number;
    total?: string | number;
    totol?: string | number; // Note: API has a typo "totol"
    nextResetTime?: string | number; // Timestamp in milliseconds
    unit?: number;
    number?: number;
    remaining?: number;
    usageDetails?: Record<string, unknown> | Array<Record<string, unknown>>;
}

/** API response for model/tool usage */
export interface UsageResponse {
    code?: number;
    msg?: string;
    data?: unknown;
    success?: boolean;
}

/** Model usage response data */
export interface ModelUsageData {
    totalUsage: {
        totalModelCallCount: number;
        totalTokensUsage: number;
    };
}

/** Tool usage response data */
export interface ToolUsageData {
    totalUsage: {
        totalNetworkSearchCount: number;
        totalWebReadMcpCount: number;
        totalZreadMcpCount: number;
        totalSearchMcpCount: number;
        toolDetails?: Array<{
            modelName: string;
            totalUsageCount: number;
        }>;
    };
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
    monthlyResetAt: string;
    /** Token数 consumed in the query time period */
    consumedTokens?: number;
    /** MCP tool calls in the query time period */
    mcpToolCalls?: {
        totalNetworkSearchCount: number;
        totalWebReadMcpCount: number;
        totalZreadMcpCount: number;
        totalSearchMcpCount: number;
    };
}

export type UsageRange = 'today' | 'last7Days' | 'last30Days';

export interface UsageRangeOption {
    key: UsageRange;
    label: string;
}

export interface UsageMetricSummary {
    name: string;
    tokens: number;
    requests: number;
}

export interface DetailedUsageSnapshot {
    range: UsageRange;
    rangeLabel: string;
    summary: QuotaSummary;
    modelUsage: UsageMetricSummary[];
    toolUsage: UsageMetricSummary[];
    fetchedAt: string;
}

/** Platform type */
export type Platform = 'ZAI' | 'ZHIPU';

/** API configuration */
export interface ApiConfig {
    authToken: string;
    baseUrl: string;
}
