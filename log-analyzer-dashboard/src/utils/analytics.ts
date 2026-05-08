import type { LogEntry } from './parser';

export const quickSelect = (arr: number[], k: number): number => {
    let left = 0;
    let right = arr.length - 1;
    while (left < right) {
        const pivot = arr[Math.floor((left + right) / 2)];
        let i = left;
        let j = right;
        while (i <= j) {
            while (arr[i] < pivot) i++;
            while (arr[j] > pivot) j--;
            if (i <= j) {
                [arr[i], arr[j]] = [arr[j], arr[i]];
                i++;
                j--;
            }
        }
        if (k <= j) right = j;
        else if (k >= i) left = i;
        else break;
    }
    return arr[k];
};

export const analyzeLogs = (logs: LogEntry[]) => {
    if (logs.length === 0) return null;

    const sortedLogs = [...logs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const startTime = sortedLogs[0].timestamp;
    const endTime = sortedLogs[sortedLogs.length - 1].timestamp;

    const totalRequests = sortedLogs.length;
    const timeSpan = endTime.getTime() - startTime.getTime();
    const errors = sortedLogs.filter(log => log.statusCode >= 400);
    const totalErrors = errors.length;
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const clientErrors = errors.filter(log => log.statusCode >= 400 && log.statusCode < 500).length;
    const serverErrors = errors.filter(log => log.statusCode >= 500).length;
    const errorCodes = errors.reduce((acc, log) => { acc[log.statusCode] = (acc[log.statusCode] || 0) + 1; return acc; }, {} as { [key: string]: number });

    const p95 = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const index = Math.ceil(0.95 * arr.length) - 1;
        return quickSelect([...arr], index);
    };

    const endpoints = sortedLogs.reduce((acc, log) => {
        if (!acc[log.uriStem]) {
            acc[log.uriStem] = { calls: 0, latencies: [] };
        }
        acc[log.uriStem].calls++;
        acc[log.uriStem].latencies.push(log.timeTaken);
        return acc;
    }, {} as { [key: string]: { calls: number; latencies: number[] } });

    const topEndpoints = Object.entries(endpoints)
        .sort((a, b) => b[1].calls - a[1].calls)
        .slice(0, 10)
        .map(([uri, data]) => ({
            uri,
            totalCalls: data.calls,
            avgLatency: data.latencies.reduce((a, b) => a + b, 0) / data.calls,
            p95Latency: p95(data.latencies),
        }));

    const ips = sortedLogs.reduce((acc, log) => {
        acc[log.clientIp] = (acc[log.clientIp] || 0) + 1;
        return acc;
    }, {} as { [key: string]: number });

    const topIps = Object.entries(ips).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const searchLogs = sortedLogs.filter(log => log.uriStem.startsWith('singleHotelSearch'));
    const hotelCodes = searchLogs.reduce((acc, log) => { try { const code = new URLSearchParams(log.uriStem.split('?')[1]).get('hotelCode'); if (code) acc[code] = (acc[code] || 0) + 1; } catch (e) {} return acc; }, {} as { [key: string]: number });
    const compositions = searchLogs.reduce((acc, log) => { try { const comp = new URLSearchParams(log.uriStem.split('?')[1]).get('composition'); if (comp) acc[comp] = (acc[comp] || 0) + 1; } catch (e) {} return acc; }, {} as { [key: string]: number });

    const getThroughput = (windowSize: number) => {
        const requestsPerWindow: { [key: number]: number } = {};
        sortedLogs.forEach(log => {
            const window = Math.floor(log.timestamp.getTime() / (windowSize * 60000));
            requestsPerWindow[window] = (requestsPerWindow[window] || 0) + 1;
        });
        const windowValues = Object.values(requestsPerWindow);
        const mean = windowValues.length > 0 ? (windowValues.reduce((a, b) => a + b, 0) / windowValues.length) / windowSize : 0;
        const max = windowValues.length > 0 ? Math.max(...windowValues) / windowSize : 0;
        return { mean: mean.toFixed(2), max: max.toFixed(2) };
    };

    // Generate Time Series Data for Charts
    const timeSeriesData: { timestamp: number; requests: number; errors: number; avgLatency: number }[] = [];
    const timeMap = new Map<number, { requests: number; errors: number; totalLatency: number }>();

    // Binning by minute (60000ms)
    sortedLogs.forEach(log => {
        const bin = Math.floor(log.timestamp.getTime() / 60000) * 60000;
        const existing = timeMap.get(bin) || { requests: 0, errors: 0, totalLatency: 0 };
        existing.requests++;
        if (log.statusCode >= 400) existing.errors++;
        existing.totalLatency += log.timeTaken;
        timeMap.set(bin, existing);
    });

    Array.from(timeMap.entries())
        .sort((a, b) => a[0] - b[0])
        .forEach(([timestamp, data]) => {
            timeSeriesData.push({
                timestamp,
                requests: data.requests,
                errors: data.errors,
                avgLatency: data.totalLatency / data.requests
            });
        });

    return {
        totalRequests,
        timeSpan: (timeSpan / 1000 / 60).toFixed(2),
        totalErrors,
        errorRate,
        clientErrors,
        serverErrors,
        errorCodes,
        topEndpoints,
        topIps,
        searchStats: {
            topHotelCodes: Object.entries(hotelCodes).sort((a, b) => b[1] - a[1]).slice(0, 10),
            topCompositions: Object.entries(compositions).sort((a, b) => b[1] - a[1]).slice(0, 10),
        },
        throughput: {
            rpm1: getThroughput(1),
            rpm15: getThroughput(15),
            rpm60: getThroughput(60),
        },
        timeSeriesData
    };
};
