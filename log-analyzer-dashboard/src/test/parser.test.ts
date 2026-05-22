import { describe, it, expect } from 'vitest';
import { parseLogs, classifyUserAgent, safeDecodeURIComponent, parseDateString, parseSearchParams } from '../utils/parser';

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

    it('should parse extended IIS logs with X-Forwarded-For and cs-uri-query correctly', () => {
        const extendedIisLogs = `#Software: Microsoft Internet Information Services 10.0\r\n#Version: 1.0\r\n#Date: 2026-05-09 00:00:24\r\n#Fields: date time s-sitename s-computername s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs-version cs(User-Agent) cs(Cookie) cs(Referer) cs-host sc-status sc-substatus sc-win32-status sc-bytes cs-bytes time-taken X-Forwarded-For\r\n2026-05-09 00:00:37 W3SVC2 Server-Prod 10.0.0.1 GET /api/search hotelCode=123 80 - 10.0.0.2 HTTP/1.1 Mozilla/5.0 - - www.example.com 200 0 0 1024 512 150 203.0.113.5,172.70.47.37`;
        const { logs, error } = parseLogs(extendedIisLogs);
        expect(error).toBe('');
        expect(logs.length).toBe(1);
        expect(logs[0].statusCode).toBe(200);
        expect(logs[0].timeTaken).toBe(150);
        // Should use X-Forwarded-For (first IP) not c-ip
        expect(logs[0].clientIp).toBe('203.0.113.5');
        // Should combine uri-stem + uri-query
        expect(logs[0].uriStem).toContain('hotelCode=123');
        expect(logs[0].method).toBe('GET');
        
        // Assert new fields
        expect(logs[0].userAgent).toBe('Mozilla/5.0');
        expect(logs[0].deviceCategory).toBe('desktop');
        expect(logs[0].scBytes).toBe(1024);
        expect(logs[0].csBytes).toBe(512);
        expect(logs[0].hotelCode).toBe('123');
    });

    it('should return an error for invalid format', () => {
        const invalidLogs = `this is not a valid log file`;
        const { logs, error } = parseLogs(invalidLogs);
        expect(error).not.toBe('');
        expect(logs.length).toBe(0);
    });

    it('should classify User-Agents correctly', () => {
        expect(classifyUserAgent('Mozilla/5.0+(compatible;+Googlebot/2.1;+http://www.google.com/bot.html)')).toBe('crawler');
        expect(classifyUserAgent('python-requests/2.28.1')).toBe('scraper');
        expect(classifyUserAgent('Mozilla/5.0+(iPhone;+CPU+iPhone+OS+16_5+like+Mac+OS+X)+AppleWebKit/605.1.15')).toBe('mobile');
        expect(classifyUserAgent('Mozilla/5.0+(Windows+NT+10.0;+Win64;+x64)+AppleWebKit/537.36')).toBe('desktop');
        expect(classifyUserAgent('-')).toBe('unknown');
    });

    it('should decode malformed User-Agents safely', () => {
        // Normal plus replacement
        expect(safeDecodeURIComponent('Mozilla/5.0+Googlebot')).toBe('Mozilla/5.0 Googlebot');
        // Malformed URI encoding
        expect(safeDecodeURIComponent('Mozilla/5.0+%E0%A4')).toBe('Mozilla/5.0 %E0%A4');
    });

    it('should parse search parameters from url-encoded JSON query parameter correctly', () => {
        const queryJson = JSON.stringify({
            HotelCode: 'KS',
            Rooms: [
                { AdultsNumber: '2', ChildrenNumber: '1', InfantsNumber: '0' },
                { AdultsNumber: '1', ChildrenNumber: '0', InfantsNumber: '0' }
            ]
        });
        
        const logsHeader = `#Fields: date time cs-uri-stem cs-uri-query sc-status time-taken c-ip`;
        const logLine = `2026-05-09 00:00:51 /umbraco/Surface/Search/GetSingleHotelSearchResults query=${encodeURIComponent(queryJson)} 200 100 127.0.0.1`;
        const { logs, error } = parseLogs(`${logsHeader}\n${logLine}`);
        
        expect(error).toBe('');
        expect(logs.length).toBe(1);
        expect(logs[0].uriStem).toBe('/singleHotelSearch?query=' + encodeURIComponent(queryJson));
        expect(logs[0].hotelCode).toBe('KS');
        expect(logs[0].composition).toBe('2-1-0,1-0-0');
    });

    it('should parse search parameters from SearchQuery URL-encoded parameter formats correctly', () => {
        const logsHeader = `#Fields: date time cs-uri-stem cs-uri-query sc-status time-taken c-ip`;
        
        // Single room composition format
        const logLine1 = `2026-05-09 00:00:51 /searchresult/room/ SearchQuery=PT%2F08-02-2026%2F09-02-2026%2F2-0-0%2F-1 200 100 127.0.0.1`;
        const res1 = parseLogs(`${logsHeader}\n${logLine1}`);
        expect(res1.error).toBe('');
        expect(res1.logs[0].hotelCode).toBe('PT');
        expect(res1.logs[0].composition).toBe('2-0-0');

        // Multi-room composition format
        const logLine2 = `2026-05-09 00:00:51 /search-results/room/ SearchQuery=GA%2F16-07-2026%2F17-07-2026%2F2-0-0%2F-1%2F2-0-0%2F-1 200 100 127.0.0.1`;
        const res2 = parseLogs(`${logsHeader}\n${logLine2}`);
        expect(res2.error).toBe('');
        expect(res2.logs[0].hotelCode).toBe('GA');
        expect(res2.logs[0].composition).toBe('2-0-0,2-0-0');
    });

    describe('parseDateString and stay/guest calculations', () => {
        it('should parse DMY format correctly', () => {
            const date = parseDateString('08-02-2026');
            expect(date).not.toBeNull();
            expect(date?.getUTCFullYear()).toBe(2026);
            expect(date?.getUTCMonth()).toBe(1); // February (0-indexed)
            expect(date?.getUTCDate()).toBe(8);
            
            const dateSlash = parseDateString('15/07/2026');
            expect(dateSlash).not.toBeNull();
            expect(dateSlash?.getUTCFullYear()).toBe(2026);
            expect(dateSlash?.getUTCMonth()).toBe(6); // July
            expect(dateSlash?.getUTCDate()).toBe(15);
        });

        it('should parse YMD format correctly', () => {
            const date = parseDateString('2026-05-12');
            expect(date).not.toBeNull();
            expect(date?.getUTCFullYear()).toBe(2026);
            expect(date?.getUTCMonth()).toBe(4); // May
            expect(date?.getUTCDate()).toBe(12);
        });

        it('should fallback to standard parser safely', () => {
            const date = parseDateString('Wed, 12 May 2026 00:00:00 GMT');
            expect(date).not.toBeNull();
            expect(date?.getUTCFullYear()).toBe(2026);
            expect(date?.getUTCMonth()).toBe(4);
            expect(date?.getUTCDate()).toBe(12);
        });

        it('should calculate stay duration and guest details correctly', () => {
            // Stay of 7 nights, 2 adults + 1 child in room 1, 1 adult in room 2
            const url = '/singleHotelSearch?hotelCode=XYZ&checkIn=08-02-2026&checkOut=15-02-2026&composition=2-1-0,1-0-0';
            const params = parseSearchParams(url);
            expect(params.hotelCode).toBe('XYZ');
            expect(params.composition).toBe('2-1-0,1-0-0');
            expect(params.stayDuration).toBe(7);
            expect(params.totalGuests).toBe(4);
            expect(params.childrenPresent).toBe(true);
        });

        it('should clamp stay duration to valid boundaries (1 to 90 nights)', () => {
            // 0 nights stay (check-in and check-out same day) should be clamped out (null)
            const urlZero = '/singleHotelSearch?hotelCode=XYZ&checkIn=08-02-2026&checkOut=08-02-2026&composition=1-0-0';
            expect(parseSearchParams(urlZero).stayDuration).toBeNull();

            // Negative nights stay
            const urlNeg = '/singleHotelSearch?hotelCode=XYZ&checkIn=15-02-2026&checkOut=08-02-2026&composition=1-0-0';
            expect(parseSearchParams(urlNeg).stayDuration).toBeNull();

            // 91 nights stay (out of bounds)
            const urlLong = '/singleHotelSearch?hotelCode=XYZ&checkIn=01-01-2026&checkOut=02-04-2026&composition=1-0-0'; // 91 nights
            expect(parseSearchParams(urlLong).stayDuration).toBeNull();

            // 90 nights stay (max valid)
            const urlLongMax = '/singleHotelSearch?hotelCode=XYZ&checkIn=01-01-2026&checkOut=01-04-2026&composition=1-0-0'; // 90 nights
            expect(parseSearchParams(urlLongMax).stayDuration).toBe(90);
        });
    });
});

