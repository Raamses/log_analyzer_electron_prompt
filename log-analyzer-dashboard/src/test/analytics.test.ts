import { describe, it, expect } from 'vitest';
import { analyzeLogs } from '../utils/analytics';
import { LogEntry } from '../utils/parser';

describe('analytics', () => {
    it('should calculate analytics correctly', () => {
        const logs: LogEntry[] = [
            { timestamp: new Date('2025-10-26T14:23:50Z'), uriStem: '/foo', statusCode: 200, timeTaken: 100, clientIp: '127.0.0.1' },
            { timestamp: new Date('2025-10-26T14:24:50Z'), uriStem: '/bar', statusCode: 404, timeTaken: 200, clientIp: '127.0.0.1' },
            { timestamp: new Date('2025-10-26T14:25:50Z'), uriStem: '/foo', statusCode: 500, timeTaken: 300, clientIp: '127.0.0.2' },
        ];
        const analytics = analyzeLogs(logs);
        expect(analytics?.totalRequests).toBe(3);
        expect(analytics?.totalErrors).toBe(2);
        expect(analytics?.errorRate).toBeCloseTo(66.67);
        expect(analytics?.topEndpoints[0].uri).toBe('/foo');
        expect(analytics?.topEndpoints[0].totalCalls).toBe(2);
    });
});
