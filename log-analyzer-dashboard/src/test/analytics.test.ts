import { describe, it, expect } from 'vitest';
import { analyzeLogs } from '../utils/analytics';
import type { LogEntry } from '../utils/parser';

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
        expect(analytics?.topEndpoints[0].errorCount).toBe(1);
        expect(analytics?.topEndpoints[0].errorRate).toBe(50);
        expect(analytics?.topEndpoints[0].p99Latency).toBe(300);
        expect(analytics?.topIps[0][0]).toBe('127.0.0.1');
        expect(analytics?.topIps[0][1]).toBe(2);
        expect(analytics?.allIps[0].errorCount).toBe(1);
        expect(analytics?.allIps[0].errorRate).toBe(50);
    });

    it('should calculate performance anomalies and identify outliers correctly', () => {
        const logs: LogEntry[] = [];
        
        // Add 14 fast calls for /api/test (100ms)
        for (let i = 0; i < 14; i++) {
            logs.push({
                timestamp: new Date(`2025-10-26T14:00:${String(i).padStart(2, '0')}Z`),
                uriStem: '/api/test',
                statusCode: 200,
                timeTaken: 100,
                clientIp: '192.168.1.1',
                method: 'GET'
            });
        }
        
        // Add 1 very slow outlier call (3000ms)
        logs.push({
            timestamp: new Date('2025-10-26T14:01:00Z'),
            uriStem: '/api/test',
            statusCode: 500,
            timeTaken: 3000,
            clientIp: '192.168.1.50',
            method: 'POST'
        });

        // Add 2 calls for another endpoint (/api/other) to check that it is NOT flagged due to sample size < 5
        logs.push({
            timestamp: new Date('2025-10-26T14:02:00Z'),
            uriStem: '/api/other',
            statusCode: 200,
            timeTaken: 500,
            clientIp: '192.168.1.1',
            method: 'GET'
        });
        logs.push({
            timestamp: new Date('2025-10-26T14:02:05Z'),
            uriStem: '/api/other',
            statusCode: 200,
            timeTaken: 1000,
            clientIp: '192.168.1.1',
            method: 'GET'
        });

        const analytics = analyzeLogs(logs);
        expect(analytics).not.toBeNull();
        
        const anomalies = analytics!.performanceAnomalies;
        expect(anomalies.totalOutliers).toBe(1);
        expect(anomalies.outlierRate).toBeCloseTo((1 / 17) * 100, 2);
        expect(anomalies.latencyOutliers.length).toBe(1);
        
        const outlier = anomalies.latencyOutliers[0];
        expect(outlier.uriStem).toBe('/api/test');
        expect(outlier.timeTaken).toBe(3000);
        expect(outlier.zScore).toBeGreaterThan(3.0);
        expect(outlier.clientIp).toBe('192.168.1.50');
        expect(outlier.method).toBe('POST');
        
        // Check correlations
        expect(anomalies.ipCorrelation[0].value).toBe('192.168.1.50');
        expect(anomalies.ipCorrelation[0].percentage).toBe(100);
        
        expect(anomalies.methodCorrelation[0].value).toBe('POST');
        expect(anomalies.methodCorrelation[0].percentage).toBe(100);

        expect(anomalies.statusCorrelation[0].value).toBe(500);
        expect(anomalies.statusCorrelation[0].percentage).toBe(100);

        // Check distribution data
        const buckets = anomalies.distributionData;
        // Under 50: 0, Under 200: 14, Under 500: 0, Under 1000: 1, Under 3000: 1, Over 3000: 1 (wait, t=3000 goes to over3000)
        // Let's verify distribution calculations
        const under200 = buckets.find(b => b.range === '50-200ms');
        expect(under200?.count).toBe(14);
        const over3000 = buckets.find(b => b.range === '3s+');
        expect(over3000?.count).toBe(1);
    });

    it('should calculate search stats correctly and return all items without slicing to 10', () => {
        const logs: LogEntry[] = [];
        // Add 12 different search logs with different hotel codes and compositions
        for (let i = 1; i <= 12; i++) {
            logs.push({
                timestamp: new Date(`2025-10-26T14:00:${String(i).padStart(2, '0')}Z`),
                uriStem: `/singleHotelSearch?hotelCode=H${i}&composition=C${i}`,
                statusCode: 200,
                timeTaken: 150,
                clientIp: '127.0.0.1'
            });
        }
        // Also add a non-search log
        logs.push({
            timestamp: new Date('2025-10-26T14:01:00Z'),
            uriStem: '/home',
            statusCode: 200,
            timeTaken: 80,
            clientIp: '127.0.0.1'
        });

        const analytics = analyzeLogs(logs);
        expect(analytics).not.toBeNull();
        expect(analytics!.searchStats.topHotelCodes.length).toBe(12);
        expect(analytics!.searchStats.topCompositions.length).toBe(12);

        // Verify ordering/sorting
        // Add one more with an existing hotelCode to check if count becomes 2 and sorted first
        logs.push({
            timestamp: new Date('2025-10-26T14:02:00Z'),
            uriStem: '/singleHotelSearch?hotelCode=H5&composition=C5',
            statusCode: 200,
            timeTaken: 120,
            clientIp: '127.0.0.1'
        });

        const analyticsWithDup = analyzeLogs(logs);
        expect(analyticsWithDup!.searchStats.topHotelCodes[0][0]).toBe('H5');
        expect(analyticsWithDup!.searchStats.topHotelCodes[0][1]).toBe(2);
        expect(analyticsWithDup!.searchStats.topHotelCodes.length).toBe(12);
    });

    it('should calculate device stats and top bots correctly', () => {
        const logs: LogEntry[] = [
            { timestamp: new Date('2025-10-26T14:23:50Z'), uriStem: '/foo', statusCode: 200, timeTaken: 100, clientIp: '127.0.0.1', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', deviceCategory: 'desktop' },
            { timestamp: new Date('2025-10-26T14:24:50Z'), uriStem: '/bar', statusCode: 404, timeTaken: 200, clientIp: '127.0.0.1', userAgent: 'Googlebot/2.1', deviceCategory: 'crawler' },
            { timestamp: new Date('2025-10-26T14:25:50Z'), uriStem: '/foo', statusCode: 200, timeTaken: 300, clientIp: '127.0.0.2', userAgent: 'Googlebot/2.1', deviceCategory: 'crawler' },
            { timestamp: new Date('2025-10-26T14:26:50Z'), uriStem: '/baz', statusCode: 500, timeTaken: 400, clientIp: '127.0.0.3', userAgent: 'python-requests/2.28', deviceCategory: 'scraper' },
        ];
        const analytics = analyzeLogs(logs);
        expect(analytics).not.toBeNull();
        expect(analytics!.deviceStats.categories.desktop).toBe(1);
        expect(analytics!.deviceStats.categories.crawler).toBe(2);
        expect(analytics!.deviceStats.categories.scraper).toBe(1);
        expect(analytics!.deviceStats.categories.mobile).toBe(0);

        expect(analytics!.deviceStats.topBots.length).toBe(2);
        expect(analytics!.deviceStats.topBots[0].userAgent).toBe('Googlebot/2.1');
        expect(analytics!.deviceStats.topBots[0].count).toBe(2);
        expect(analytics!.deviceStats.topBots[0].errorRate).toBe(50); // 1 error (404) out of 2 calls
        expect(analytics!.deviceStats.topBots[0].avgLatency).toBe(250); // (200 + 300) / 2

        expect(analytics!.deviceStats.topBots[1].userAgent).toBe('python-requests/2.28');
        expect(analytics!.deviceStats.topBots[1].count).toBe(1);
        expect(analytics!.deviceStats.topBots[1].errorRate).toBe(100);
        expect(analytics!.deviceStats.topBots[1].avgLatency).toBe(400);
    });

    it('should calculate stay categories, occupancy profiles, and the correlation matrix correctly', () => {
        const logs: LogEntry[] = [
            // Short stay (2 nights), Single occupancy (1A)
            {
                timestamp: new Date('2026-05-09T00:00:00Z'),
                uriStem: '/singleHotelSearch?hotelCode=H1&composition=1-0-0',
                statusCode: 200,
                timeTaken: 120,
                clientIp: '127.0.0.1',
                hotelCode: 'H1',
                composition: '1-0-0',
                stayDuration: 2,
                totalGuests: 1,
                childrenPresent: false
            },
            // Standard stay (5 nights), Double occupancy (2A)
            {
                timestamp: new Date('2026-05-09T00:01:00Z'),
                uriStem: '/singleHotelSearch?hotelCode=H2&composition=2-0-0',
                statusCode: 200,
                timeTaken: 180,
                clientIp: '127.0.0.1',
                hotelCode: 'H2',
                composition: '2-0-0',
                stayDuration: 5,
                totalGuests: 2,
                childrenPresent: false
            },
            // Long stay (10 nights), Family occupancy (2 adults + 1 child)
            {
                timestamp: new Date('2026-05-09T00:02:00Z'),
                uriStem: '/singleHotelSearch?hotelCode=H3&composition=2-1-0',
                statusCode: 500, // Error
                timeTaken: 300,
                clientIp: '127.0.0.1',
                hotelCode: 'H3',
                composition: '2-1-0',
                stayDuration: 10,
                totalGuests: 3,
                childrenPresent: true
            },
            // Extended stay (20 nights), Other occupancy (multi-room double search: 1-0-0,1-0-0)
            {
                timestamp: new Date('2026-05-09T00:03:00Z'),
                uriStem: '/singleHotelSearch?hotelCode=H4&composition=1-0-0,1-0-0',
                statusCode: 200,
                timeTaken: 250,
                clientIp: '127.0.0.1',
                hotelCode: 'H4',
                composition: '1-0-0,1-0-0',
                stayDuration: 20,
                totalGuests: 2,
                childrenPresent: false
            }
        ];

        const analytics = analyzeLogs(logs);
        expect(analytics).not.toBeNull();
        
        const stats = analytics!.searchStats;
        expect(stats.stayCategoryStats).toBeDefined();
        expect(stats.occupancyStats).toBeDefined();
        expect(stats.correlationMatrix).toBeDefined();

        // 1. Check stay categories
        const short = stats.stayCategoryStats.find(s => s.category === 'Short');
        expect(short?.totalCalls).toBe(1);
        expect(short?.avgLatency).toBe(120);

        const standard = stats.stayCategoryStats.find(s => s.category === 'Standard');
        expect(standard?.totalCalls).toBe(1);
        expect(standard?.avgLatency).toBe(180);

        const long = stats.stayCategoryStats.find(s => s.category === 'Long');
        expect(long?.totalCalls).toBe(1);
        expect(long?.errorRate).toBe(100);

        const extended = stats.stayCategoryStats.find(s => s.category === 'Extended');
        expect(extended?.totalCalls).toBe(1);
        expect(extended?.avgLatency).toBe(250);

        // 2. Check occupancy profiles
        const single = stats.occupancyStats.find(o => o.profile === 'Single');
        expect(single?.totalCalls).toBe(1);
        expect(single?.avgLatency).toBe(120);

        const double = stats.occupancyStats.find(o => o.profile === 'Double');
        expect(double?.totalCalls).toBe(1);
        expect(double?.avgLatency).toBe(180);

        const family = stats.occupancyStats.find(o => o.profile === 'Family');
        expect(family?.totalCalls).toBe(1);
        expect(family?.errorCount).toBe(1);

        const other = stats.occupancyStats.find(o => o.profile === 'Other');
        expect(other?.totalCalls).toBe(1);
        expect(other?.avgLatency).toBe(250);

        // 3. Check correlation matrix (should have 16 entries)
        expect(stats.correlationMatrix.length).toBe(16);
        
        // Find Short-Single cell
        const cell1 = stats.correlationMatrix.find(c => c.stayCategory === 'Short' && c.occupancyProfile === 'Single');
        expect(cell1?.totalCalls).toBe(1);
        expect(cell1?.avgLatency).toBe(120);

        // Find Long-Family cell
        const cell2 = stats.correlationMatrix.find(c => c.stayCategory === 'Long' && c.occupancyProfile === 'Family');
        expect(cell2?.totalCalls).toBe(1);
        expect(cell2?.errorRate).toBe(100);

        // Cell with no logs should have 0 calls
        const cell3 = stats.correlationMatrix.find(c => c.stayCategory === 'Extended' && c.occupancyProfile === 'Single');
        expect(cell3?.totalCalls).toBe(0);
        expect(cell3?.avgLatency).toBe(0);
    });
});


