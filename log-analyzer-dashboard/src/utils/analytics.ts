import { getStayCategory, getOccupancyProfile, parseSearchParams, type LogEntry } from './parser';

// Quickselect algorithm for O(N) average time complexity percentile calculation
function quickselect(arr: number[], k: number): number {
    if (arr.length === 0) return 0;

    let left = 0;
    let right = arr.length - 1;

    while (left <= right) {
        let pivotIndex = partition(arr, left, right);
        if (pivotIndex === k) {
            return arr[k];
        } else if (pivotIndex < k) {
            left = pivotIndex + 1;
        } else {
            right = pivotIndex - 1;
        }
    }
    return arr[k];
}

function partition(arr: number[], left: number, right: number): number {
    let pivot = arr[right];
    let i = left - 1;

    for (let j = left; j < right; j++) {
        if (arr[j] <= pivot) {
            i++;
            // swap
            let temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
    }
    // swap pivot
    let temp = arr[i + 1];
    arr[i + 1] = arr[right];
    arr[right] = temp;

    return i + 1;
}

export const analyzeLogs = (logs: LogEntry[]) => {
    if (logs.length === 0) return null;

    // Fast check if already sorted
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

    const endpoints: Record<string, { calls: number; errors: number; totalLatency: number; latencies: number[] }> = {};
    const ips: Record<string, { calls: number; errors: number }> = {};

    const hotelCodes: Record<string, number> = {};
    const compositions: Record<string, number> = {};

    const stayCategories = ['Short', 'Standard', 'Long', 'Extended'];
    const occupancyProfiles = ['Single', 'Double', 'Family', 'Other'];

    const stayStatsInit = stayCategories.reduce((acc, cat) => {
        acc[cat] = { calls: 0, errors: 0, totalLatency: 0, latencies: [] };
        return acc;
    }, {} as Record<string, { calls: number; errors: number; totalLatency: number; latencies: number[] }>);

    const occupancyStatsInit = occupancyProfiles.reduce((acc, prof) => {
        acc[prof] = { calls: 0, errors: 0, totalLatency: 0, latencies: [] };
        return acc;
    }, {} as Record<string, { calls: number; errors: number; totalLatency: number; latencies: number[] }>);

    const matrixInit = {} as Record<string, Record<string, { calls: number; errors: number; totalLatency: number; latencies: number[] }>>;
    stayCategories.forEach(cat => {
        matrixInit[cat] = {};
        occupancyProfiles.forEach(prof => {
            matrixInit[cat][prof] = { calls: 0, errors: 0, totalLatency: 0, latencies: [] };
        });
    });

    let totalStayDuration = 0;
    let stayDurationCount = 0;

    const timeMap = new Map<number, { requests: number; errors: number; totalLatency: number }>();
    const requestsPerWindow1: { [key: number]: number } = {};
    const requestsPerWindow15: { [key: number]: number } = {};
    const requestsPerWindow60: { [key: number]: number } = {};

    let totalLatency = 0;

    const distribution = {
        under50: 0,
        under200: 0,
        under500: 0,
        under1000: 0,
        under3000: 0,
        over3000: 0
    };

    const deviceCategories = {
        desktop: 0,
        mobile: 0,
        crawler: 0,
        scraper: 0,
        unknown: 0
    };

    const botStats = new Map<string, { count: number; errorCount: number; totalLatency: number }>();

    // ONE BIG LOOP!
    for (let i = 0; i < sortedLogs.length; i++) {
        const log = sortedLogs[i];
        const isError = log.statusCode >= 400;
        
        // Error stats
        if (isError) {
            totalErrors++;
            if (log.statusCode < 500) clientErrors++;
            else serverErrors++;

            errorCodes[log.statusCode] = (errorCodes[log.statusCode] || 0) + 1;
        }

        // Endpoint stats
        if (!endpoints[log.uriStem]) {
            endpoints[log.uriStem] = { calls: 0, errors: 0, totalLatency: 0, latencies: [] };
        }
        endpoints[log.uriStem].calls++;
        if (isError) endpoints[log.uriStem].errors++;
        endpoints[log.uriStem].totalLatency += log.timeTaken;
        endpoints[log.uriStem].latencies.push(log.timeTaken);

        // IP stats
        if (!ips[log.clientIp]) {
            ips[log.clientIp] = { calls: 0, errors: 0 };
        }
        ips[log.clientIp].calls++;
        if (isError) ips[log.clientIp].errors++;

        // Search stats
        if (log.uriStem.includes('singleHotelSearch')) {
            let hc = log.hotelCode;
            let comp = log.composition;
            let sd = log.stayDuration;
            let tg = log.totalGuests;
            let cp = log.childrenPresent;

            if (hc === undefined || hc === null || comp === undefined || comp === null || sd === undefined || sd === null || tg === undefined || tg === null || cp === undefined || cp === null) {
                const parsed = parseSearchParams(log.uriStem);
                if (hc === undefined || hc === null) hc = parsed.hotelCode;
                if (comp === undefined || comp === null) comp = parsed.composition;
                if (sd === undefined || sd === null) sd = parsed.stayDuration;
                if (tg === undefined || tg === null) tg = parsed.totalGuests;
                if (cp === undefined || cp === null) cp = parsed.childrenPresent;
            }

            if (hc) hotelCodes[hc] = (hotelCodes[hc] || 0) + 1;
            if (comp) compositions[comp] = (compositions[comp] || 0) + 1;

            if (sd !== undefined && sd !== null) {
                totalStayDuration += sd;
                stayDurationCount++;
            }

            const stayCat = getStayCategory(sd);
            const occProf = getOccupancyProfile(comp, tg, cp);

            if (stayCat && stayStatsInit[stayCat]) {
                stayStatsInit[stayCat].calls++;
                if (isError) stayStatsInit[stayCat].errors++;
                stayStatsInit[stayCat].totalLatency += log.timeTaken;
                stayStatsInit[stayCat].latencies.push(log.timeTaken);
            }

            if (occProf && occupancyStatsInit[occProf]) {
                occupancyStatsInit[occProf].calls++;
                if (isError) occupancyStatsInit[occProf].errors++;
                occupancyStatsInit[occProf].totalLatency += log.timeTaken;
                occupancyStatsInit[occProf].latencies.push(log.timeTaken);
            }

            if (stayCat && occProf && matrixInit[stayCat] && matrixInit[stayCat][occProf]) {
                matrixInit[stayCat][occProf].calls++;
                if (isError) matrixInit[stayCat][occProf].errors++;
                matrixInit[stayCat][occProf].totalLatency += log.timeTaken;
                matrixInit[stayCat][occProf].latencies.push(log.timeTaken);
            }
        }

        // Time bins and throughput
        const timeMs = log.timestamp.getTime();

        const bin60s = Math.floor(timeMs / 60000);
        requestsPerWindow1[bin60s] = (requestsPerWindow1[bin60s] || 0) + 1;

        const bin15m = Math.floor(timeMs / (15 * 60000));
        requestsPerWindow15[bin15m] = (requestsPerWindow15[bin15m] || 0) + 1;

        const bin60m = Math.floor(timeMs / (60 * 60000));
        requestsPerWindow60[bin60m] = (requestsPerWindow60[bin60m] || 0) + 1;

        const bin = bin60s * 60000;
        const existing = timeMap.get(bin) || { requests: 0, errors: 0, totalLatency: 0 };
        existing.requests++;
        if (isError) existing.errors++;
        existing.totalLatency += log.timeTaken;
        timeMap.set(bin, existing);

        // Latency
        totalLatency += log.timeTaken;

        const t = log.timeTaken;
        if (t < 50) distribution.under50++;
        else if (t < 200) distribution.under200++;
        else if (t < 500) distribution.under500++;
        else if (t < 1000) distribution.under1000++;
        else if (t < 3000) distribution.under3000++;
        else distribution.over3000++;

        // Devices and Bots
        const cat = log.deviceCategory || 'unknown';
        if (cat in deviceCategories) {
            deviceCategories[cat as keyof typeof deviceCategories]++;
        } else {
            deviceCategories.unknown++;
        }

        if (log.userAgent && (cat === 'crawler' || cat === 'scraper')) {
            const botExisting = botStats.get(log.userAgent) || { count: 0, errorCount: 0, totalLatency: 0 };
            botExisting.count++;
            if (isError) {
                botExisting.errorCount++;
            }
            botExisting.totalLatency += log.timeTaken;
            botStats.set(log.userAgent, botExisting);
        }
    }

    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    const p95 = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const index = Math.ceil(0.95 * arr.length) - 1;
        return quickselect([...arr], index);
    };

    const p99 = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const index = Math.ceil(0.99 * arr.length) - 1;
        return quickselect([...arr], index);
    };

    const allEndpoints = Object.entries(endpoints).map(([uri, data]) => ({
        uri,
        totalCalls: data.calls,
        errorCount: data.errors,
        errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0,
        avgLatency: data.calls > 0 ? data.totalLatency / data.calls : 0,
        p95Latency: p95(data.latencies),
        p99Latency: p99(data.latencies),
    })).sort((a, b) => b.totalCalls - a.totalCalls);

    const topEndpoints = allEndpoints.slice(0, 10);

    const allIps = Object.entries(ips).map(([ip, data]) => ({
        ip,
        totalCalls: data.calls,
        errorCount: data.errors,
        errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0
    })).sort((a, b) => b.totalCalls - a.totalCalls);

    const topIps = allIps.slice(0, 10).map(x => [x.ip, x.totalCalls] as [string, number]);

    const avgStayDuration = stayDurationCount > 0 ? totalStayDuration / stayDurationCount : 0;
    const familyCalls = occupancyStatsInit['Family']?.calls || 0;
    const totalOccupancyCalls = Object.values(occupancyStatsInit).reduce((a, b) => a + b.calls, 0);
    const familySearchShare = totalOccupancyCalls > 0 ? (familyCalls / totalOccupancyCalls) * 100 : 0;

    const stayCategoryStats = Object.entries(stayStatsInit).map(([category, data]) => ({
        category,
        totalCalls: data.calls,
        errorCount: data.errors,
        errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0,
        avgLatency: data.calls > 0 ? data.totalLatency / data.calls : 0,
        p95Latency: p95(data.latencies),
    }));

    const occupancyStats = Object.entries(occupancyStatsInit).map(([profile, data]) => ({
        profile,
        totalCalls: data.calls,
        errorCount: data.errors,
        errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0,
        avgLatency: data.calls > 0 ? data.totalLatency / data.calls : 0,
        p95Latency: p95(data.latencies),
    }));

    const correlationMatrix: Array<{
        stayCategory: string;
        occupancyProfile: string;
        totalCalls: number;
        errorCount: number;
        errorRate: number;
        avgLatency: number;
        p95Latency: number;
    }> = [];

    stayCategories.forEach(cat => {
        occupancyProfiles.forEach(prof => {
            const data = matrixInit[cat][prof];
            correlationMatrix.push({
                stayCategory: cat,
                occupancyProfile: prof,
                totalCalls: data.calls,
                errorCount: data.errors,
                errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0,
                avgLatency: data.calls > 0 ? data.totalLatency / data.calls : 0,
                p95Latency: p95(data.latencies),
            });
        });
    });

    const calcThroughput = (reqs: { [key: number]: number }, windowSize: number) => {
        const windowValues = Object.values(reqs);
        const mean = windowValues.length > 0 ? (windowValues.reduce((a, b) => a + b, 0) / windowValues.length) / windowSize : 0;
        const max = windowValues.length > 0 ? Math.max(...windowValues) / windowSize : 0;
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

    const overallMean = totalRequests > 0 ? totalLatency / totalRequests : 0;
    const overallVariance = totalRequests > 0 
        ? sortedLogs.reduce((sum, log) => sum + Math.pow(log.timeTaken - overallMean, 2), 0) / totalRequests 
        : 0;
    const overallStdDev = Math.sqrt(overallVariance);

    const endpointStats = new Map<string, { mean: number; stdDev: number; calls: number }>();
    Object.entries(endpoints).forEach(([uri, data]) => {
        const calls = data.calls;
        const mean = data.totalLatency / calls;
        const variance = data.latencies.reduce((sumVal, val) => sumVal + Math.pow(val - mean, 2), 0) / calls;
        const stdDev = Math.sqrt(variance);
        endpointStats.set(uri, { mean, stdDev, calls });
    });

    const outliers: {
        timestamp: Date;
        uriStem: string;
        statusCode: number;
        timeTaken: number;
        clientIp: string;
        method?: string;
        zScore: number;
        endpointMean: number;
        endpointStdDev: number;
    }[] = [];

    // Second loop for outliers since it needs endpoint stats first
    for (let i = 0; i < sortedLogs.length; i++) {
        const log = sortedLogs[i];
        const stats = endpointStats.get(log.uriStem);
        if (stats && stats.calls >= 5 && stats.stdDev > 0) {
            const zScore = (log.timeTaken - stats.mean) / stats.stdDev;
            if (zScore > 3.0 && log.timeTaken > 100) {
                outliers.push({
                    timestamp: log.timestamp,
                    uriStem: log.uriStem,
                    statusCode: log.statusCode,
                    timeTaken: log.timeTaken,
                    clientIp: log.clientIp,
                    method: log.method,
                    zScore,
                    endpointMean: stats.mean,
                    endpointStdDev: stats.stdDev,
                });
            }
        }
    }

    outliers.sort((a, b) => b.zScore - a.zScore);
    const latencyOutliers = outliers.slice(0, 500);

    const ipCounts: Record<string, number> = {};
    const methodCounts: Record<string, number> = {};
    const statusCounts: Record<number, number> = {};

    for (let i = 0; i < outliers.length; i++) {
        const o = outliers[i];
        ipCounts[o.clientIp] = (ipCounts[o.clientIp] || 0) + 1;
        const m = o.method || 'GET';
        methodCounts[m] = (methodCounts[m] || 0) + 1;
        statusCounts[o.statusCode] = (statusCounts[o.statusCode] || 0) + 1;
    }

    const ipCorrelation = Object.entries(ipCounts)
        .map(([ip, count]) => ({ value: ip, count, percentage: outliers.length > 0 ? (count / outliers.length) * 100 : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const methodCorrelation = Object.entries(methodCounts)
        .map(([method, count]) => ({ value: method, count, percentage: outliers.length > 0 ? (count / outliers.length) * 100 : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const statusCorrelation = Object.entries(statusCounts)
        .map(([status, count]) => ({ value: parseInt(status, 10), count, percentage: outliers.length > 0 ? (count / outliers.length) * 100 : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const distributionData = [
        { range: '< 50ms', count: distribution.under50 },
        { range: '50-200ms', count: distribution.under200 },
        { range: '200-500ms', count: distribution.under500 },
        { range: '500-1000ms', count: distribution.under1000 },
        { range: '1s-3s', count: distribution.under3000 },
        { range: '3s+', count: distribution.over3000 },
    ];

    const topBots = Array.from(botStats.entries())
        .map(([ua, data]) => ({
            userAgent: ua,
            count: data.count,
            errorRate: data.count > 0 ? (data.errorCount / data.count) * 100 : 0,
            avgLatency: data.count > 0 ? data.totalLatency / data.count : 0
        }))
        .sort((a, b) => b.count - a.count);

    return {
        deviceStats: {
            categories: deviceCategories,
            topBots
        },
        totalRequests,
        timeSpan: (timeSpan / 1000 / 60).toFixed(2),
        totalErrors,
        errorRate,
        clientErrors,
        serverErrors,
        errorCodes,
        allEndpoints,
        topEndpoints,
        allIps,
        topIps,
        searchStats: {
            topHotelCodes: Object.entries(hotelCodes).sort((a, b) => b[1] - a[1]),
            topCompositions: Object.entries(compositions).sort((a, b) => b[1] - a[1]),
            stayCategoryStats,
            occupancyStats,
            correlationMatrix,
            avgStayDuration,
            familySearchShare,
        },
        throughput: {
            rpm1: calcThroughput(requestsPerWindow1, 1),
            rpm15: calcThroughput(requestsPerWindow15, 15),
            rpm60: calcThroughput(requestsPerWindow60, 60),
        },
        timeSeriesData,
        performanceAnomalies: {
            totalOutliers: outliers.length,
            outlierRate: totalRequests > 0 ? (outliers.length / totalRequests) * 100 : 0,
            overallStdDev,
            overallMean,
            latencyOutliers,
            ipCorrelation,
            methodCorrelation,
            statusCorrelation,
            distributionData
        }
    };
};
