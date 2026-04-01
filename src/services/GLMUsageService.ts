import * as https from 'https';
import { ApiConfig, QuotaLimitResponse, UsageResponse, QuotaSummary } from '../types/api';
import { getTimeWindowParams } from '../util/timeWindow';

export class GLMUsageService {
    constructor(private config: ApiConfig) {}

    /**
     * Fetch all usage data
     */
    async fetchAllUsage(): Promise<{
        quotaLimits: QuotaLimitResponse;
        modelUsage: UsageResponse;
        toolUsage: UsageResponse;
    }> {
        const [quotaLimits, modelUsage, toolUsage] = await Promise.all([
            this.fetchQuotaLimits(),
            this.fetchModelUsage(),
            this.fetchToolUsage()
        ]);

        return { quotaLimits, modelUsage, toolUsage };
    }

    /**
     * Fetch quota limits
     */
    async fetchQuotaLimits(): Promise<QuotaLimitResponse> {
        const url = this.getQuotaLimitUrl();
        return this.makeRequest<QuotaLimitResponse>(url);
    }

    /**
     * Fetch model usage with time window
     */
    async fetchModelUsage(): Promise<UsageResponse> {
        const url = this.getModelUsageUrl();
        return this.makeRequest<UsageResponse>(url);
    }

    /**
     * Fetch tool usage with time window
     */
    async fetchToolUsage(): Promise<UsageResponse> {
        const url = this.getToolUsageUrl();
        return this.makeRequest<UsageResponse>(url);
    }

    /**
     * Get quota limit URL
     */
    private getQuotaLimitUrl(): string {
        const baseUrl = this.config.baseUrl.replace('/api/anthropic', '');
        return `${baseUrl}/api/monitor/usage/quota/limit`;
    }

    /**
     * Get model usage URL with time window params
     */
    private getModelUsageUrl(): string {
        const baseUrl = this.config.baseUrl.replace('/api/anthropic', '');
        const { startTime, endTime } = getTimeWindowParams();
        return `${baseUrl}/api/monitor/usage/model-usage?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`;
    }

    /**
     * Get tool usage URL with time window params
     */
    private getToolUsageUrl(): string {
        const baseUrl = this.config.baseUrl.replace('/api/anthropic', '');
        const { startTime, endTime } = getTimeWindowParams();
        return `${baseUrl}/api/monitor/usage/tool-usage?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`;
    }

    /**
     * Make HTTPS request to GLM API
     */
    private makeRequest<T>(url: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);

            const options = {
                hostname: parsedUrl.hostname,
                port: 443,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'Authorization': this.config.authToken,
                    'Accept-Language': 'en-US,en',
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${e}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Parse quota summary for display
     */
    parseQuotaSummary(response: QuotaLimitResponse): QuotaSummary {
        const tokenLimit = response.limits.find(l => l.type === 'TOKENS_LIMIT');
        const timeLimit = response.limits.find(l => l.type === 'TIME_LIMIT');

        return {
            tokenUsage: {
                percentage: tokenLimit?.percentage ?? 0,
                used: parseInt(tokenLimit?.currentValue ?? '0'),
                total: parseInt(tokenLimit?.usage ?? '100')
            },
            mcpUsage: {
                percentage: timeLimit?.percentage ?? 0,
                used: parseInt(timeLimit?.currentValue ?? '0'),
                total: parseInt(timeLimit?.usage ?? '100')
            }
        };
    }
}
