import assert from 'assert';
import { getTimeWindowParams } from '../../util/timeWindow';

suite('Time Window Tests', () => {
    test('calculates time window for current hour', () => {
        // Mock current time: 2026-04-01 14:30:00
        const mockDate = new Date('2026-04-01T14:30:00Z');
        const result = getTimeWindowParams(mockDate);

        assert.strictEqual(result.startTime, '2026-03-31T14:00:00Z');
        assert.strictEqual(result.endTime, '2026-04-01T14:59:59Z');
    });

    test('handles midnight boundary', () => {
        const mockDate = new Date('2026-04-01T00:15:00Z');
        const result = getTimeWindowParams(mockDate);

        assert.strictEqual(result.startTime, '2026-03-31T00:00:00Z');
        assert.strictEqual(result.endTime, '2026-04-01T00:59:59Z');
    });
});
