import { describe, it, expect } from 'vitest';
import { parseLogs } from '../utils/parser';

describe('parser', () => {
    it('should parse IIS logs correctly', () => {
        const iisLogs = `#Fields: date time cs-uri-stem sc-status time-taken c-ip
2025-10-26 14:23:50 /searchresult/foo 200 100 127.0.0.1`;
        const { logs, error } = parseLogs(iisLogs);
        expect(error).toBe('');
        expect(logs.length).toBe(1);
        expect(logs[0].statusCode).toBe(200);
        expect(logs[0].timeTaken).toBe(100);
    });

    it('should parse Azure APGW logs correctly', () => {
        const azureLogs = `TimeGenerated [UTC]\tHttpStatus\tRequestUri\tClientIp\tTimeTaken
"10/26/2025, 2:23:50.000 PM"\t200\t/api/AgentsApi/Search\t4.231.129.73\t0.05`;
        const { logs, error } = parseLogs(azureLogs);
        expect(error).toBe('');
        expect(logs.length).toBe(1);
        expect(logs[0].statusCode).toBe(200);
        expect(logs[0].timeTaken).toBe(50); // 0.05s * 1000
    });

    it('should return an error for invalid format', () => {
        const invalidLogs = `this is not a valid log file`;
        const { logs, error } = parseLogs(invalidLogs);
        expect(error).not.toBe('');
        expect(logs.length).toBe(0);
    });
});
