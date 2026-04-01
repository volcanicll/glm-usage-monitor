/**
 * Calculate time window for API queries.
 * Start: Yesterday at current hour (HH:00:00)
 * End: Today at current hour end (HH:59:59)
 */
export function getTimeWindowParams(now: Date = new Date()): {
    startTime: string;
    endTime: string;
} {
    const currentHour = now.getUTCHours();

    // Yesterday at current hour (UTC)
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(currentHour, 0, 0, 0);

    // Today at current hour end (UTC)
    const todayEnd = new Date(now);
    todayEnd.setUTCHours(currentHour, 59, 59, 999);

    return {
        startTime: yesterday.toISOString().replace(/\.\d+Z$/, 'Z'),
        endTime: todayEnd.toISOString().replace(/\.\d+Z$/, 'Z')
    };
}

/**
 * Detect platform from base URL
 */
export function detectPlatform(baseUrl: string): 'ZAI' | 'ZHIPU' {
    if (baseUrl.includes('z.ai')) {
        return 'ZAI';
    }
    return 'ZHIPU';
}
