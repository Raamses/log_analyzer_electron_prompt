import type { LogEntry } from './parser';

export const analyzeLogs = (logs: LogEntry[]) => {
    if (logs.length === 0) return null;

    let isSorted = true;
    for (let i = 1; i < logs.length; i++) {
        if (logs[i].timestamp.getTime() < logs[i - 1].timestamp.getTime()) {
            isSorted = false;
            break;
        }
    }

    const sortedLogs = isSorted ? logs : [...logs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const startTime = sortedLogs[0].timestamp;
    const endTime = sortedLogs[sortedLogs.length - 1].timestamp;

    const totalRequests = sortedLogs.length;
    const timeSpan = endTime.getTime() - startTime.getTime();

    let totalErrors = 0;
    let clientErrors = 0;
    let serverErrors = 0;
    const errorCodes: Record<string, number> = {};
    const endpoints: Record<string, { calls: number; latencies: number[] }> = {};
    const ips: Record<string, number> = {};
    const hotelCodes: Record<string, number> = {};
    const compositions: Record<string, number> = {};
    const timeMap = new Map<number, { requests: number; errors: number; totalLatency: number }>();

    // Throughput tracking
    const rpm1Map: Record<number, number> = {};
    const rpm15Map: Record<number, number> = {};
    const rpm60Map: Record<number, number> = {};

    sortedLogs.forEach(log => {
        const ts = log.timestamp.getTime();

        // Error counting
        if (log.statusCode >= 400) {
            totalErrors++;
            if (log.statusCode < 500) clientErrors++;
            else serverErrors++;
            errorCodes[log.statusCode] = (errorCodes[log.statusCode] || 0) + 1;
        }

        // Endpoint grouping
        if (!endpoints[log.uriStem]) {
            endpoints[log.uriStem] = { calls: 0, latencies: [] };
        }
        endpoints[log.uriStem].calls++;
        endpoints[log.uriStem].latencies.push(log.timeTaken);

        // IP grouping
        ips[log.clientIp] = (ips[log.clientIp] || 0) + 1;

        // Search log analysis
        if (log.uriStem.startsWith('singleHotelSearch')) {
            try {
                const params = new URLSearchParams(log.uriStem.split('?')[1]);
                const code = params.get('hotelCode');
                if (code) hotelCodes[code] = (hotelCodes[code] || 0) + 1;
                const comp = params.get('composition');
                if (comp) compositions[comp] = (compositions[comp] || 0) + 1;
            } catch (e) { /* ignore */ }
        }

        // Time Series Data (1-minute binning)
        const bin = Math.floor(ts / 60000) * 60000;
        const existing = timeMap.get(bin) || { requests: 0, errors: 0, totalLatency: 0 };
        existing.requests++;
        if (log.statusCode >= 400) existing.errors++;
        existing.totalLatency += log.timeTaken;
        timeMap.set(bin, existing);

        // Throughput data
        const bin1 = Math.floor(ts / 60000);
        const bin15 = Math.floor(ts / 900000);
        const bin60 = Math.floor(ts / 3600000);
        rpm1Map[bin1] = (rpm1Map[bin1] || 0) + 1;
        rpm15Map[bin15] = (rpm15Map[bin15] || 0) + 1;
        rpm60Map[bin60] = (rpm60Map[bin60] || 0) + 1;
    });

    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    const quickselect = (arr: number[], k: number): number => {
        let left = 0;
        let right = arr.length - 1;
        while (true) {
            if (left === right) return arr[left];
            const pivotIndex = left + Math.floor(Math.random() * (right - left + 1));
            const newPivotIndex = partition(arr, left, right, pivotIndex);
            if (k === newPivotIndex) return arr[k];
            else if (k < newPivotIndex) right = newPivotIndex - 1;
            else left = newPivotIndex + 1;
        }
    };

    const partition = (arr: number[], left: number, right: number, pivotIndex: number): number => {
        const pivotValue = arr[pivotIndex];
        [arr[pivotIndex], arr[right]] = [arr[right], arr[pivotIndex]];
        let storeIndex = left;
        for (let i = left; i < right; i++) {
            if (arr[i] < pivotValue) {
                [arr[i], arr[storeIndex]] = [arr[storeIndex], arr[i]];
                storeIndex++;
            }
        }
        [arr[storeIndex], arr[right]] = [arr[right], arr[storeIndex]];
        return storeIndex;
    };

    const p95 = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const k = Math.ceil(0.95 * arr.length) - 1;
        // Use a copy to avoid mutating the original latency array if needed,
        // though here it's already a copy or we don't care about order.
        return quickselect([...arr], k);
    };

    const topEndpoints = Object.entries(endpoints)
        .sort((a, b) => b[1].calls - a[1].calls)
        .slice(0, 10)
        .map(([uri, data]) => ({
            uri,
            totalCalls: data.calls,
            avgLatency: data.latencies.reduce((a, b) => a + b, 0) / data.calls,
            p95Latency: p95(data.latencies),
        }));

    const topIps = Object.entries(ips).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const getThroughputStats = (map: Record<number, number>, windowSize: number) => {
        const values = Object.values(map);
        const mean = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length) / windowSize : 0;
        const max = values.length > 0 ? Math.max(...values) / windowSize : 0;
        return { mean: mean.toFixed(2), max: max.toFixed(2) };
    };

    const timeSeriesData: { timestamp: number; requests: number; errors: number; avgLatency: number }[] = [];

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
            rpm1: getThroughputStats(rpm1Map, 1),
            rpm15: getThroughputStats(rpm15Map, 15),
            rpm60: getThroughputStats(rpm60Map, 60),
        },
        timeSeriesData
    };
};
