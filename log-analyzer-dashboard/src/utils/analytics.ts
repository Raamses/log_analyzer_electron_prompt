import { getStayCategory, getOccupancyProfile, parseSearchParams, type LogEntry } from './parser';

export const analyzeLogs = (logs: LogEntry[]) => {
    if (logs.length === 0) return null;

    const sortedLogs = logs;
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
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil(0.95 * sorted.length) - 1;
        return sorted[index];
    };

    const p99 = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil(0.99 * sorted.length) - 1;
        return sorted[index];
    };

    const endpoints = sortedLogs.reduce((acc, log) => {
        if (!acc[log.uriStem]) {
            acc[log.uriStem] = { calls: 0, errors: 0, latencies: [] };
        }
        acc[log.uriStem].calls++;
        if (log.statusCode >= 400) acc[log.uriStem].errors++;
        acc[log.uriStem].latencies.push(log.timeTaken);
        return acc;
    }, {} as { [key: string]: { calls: number; errors: number; latencies: number[] } });

    const allEndpoints = Object.entries(endpoints).map(([uri, data]) => ({
        uri,
        totalCalls: data.calls,
        errorCount: data.errors,
        errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0,
        avgLatency: data.latencies.reduce((a, b) => a + b, 0) / data.calls,
        p95Latency: p95(data.latencies),
        p99Latency: p99(data.latencies),
    })).sort((a, b) => b.totalCalls - a.totalCalls);

    const topEndpoints = allEndpoints.slice(0, 10);

    const ips = sortedLogs.reduce((acc, log) => {
        if (!acc[log.clientIp]) acc[log.clientIp] = { calls: 0, errors: 0 };
        acc[log.clientIp].calls++;
        if (log.statusCode >= 400) acc[log.clientIp].errors++;
        return acc;
    }, {} as { [key: string]: { calls: number; errors: number } });

    const allIps = Object.entries(ips).map(([ip, data]) => ({
        ip,
        totalCalls: data.calls,
        errorCount: data.errors,
        errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0
    })).sort((a, b) => b.totalCalls - a.totalCalls);

    const topIps = allIps.slice(0, 10).map(x => [x.ip, x.totalCalls] as [string, number]);

    const searchLogs = sortedLogs.filter(log => log.uriStem.includes('singleHotelSearch'));
    const hotelCodes = searchLogs.reduce((acc, log) => {
        let hc = log.hotelCode;
        if (hc === undefined || hc === null) {
            const match = log.uriStem.match(/[?&]hotelCode=([^&]+)/);
            hc = match ? decodeURIComponent(match[1]) : null;
        }
        if (hc) acc[hc] = (acc[hc] || 0) + 1;
        return acc;
    }, {} as { [key: string]: number });

    const compositions = searchLogs.reduce((acc, log) => {
        let comp = log.composition;
        if (comp === undefined || comp === null) {
            const match = log.uriStem.match(/[?&]composition=([^&]+)/);
            comp = match ? decodeURIComponent(match[1]) : null;
        }
        if (comp) acc[comp] = (acc[comp] || 0) + 1;
        return acc;
    }, {} as { [key: string]: number });

    const stayCategories = ['Short', 'Standard', 'Long', 'Extended'];
    const occupancyProfiles = ['Single', 'Double', 'Family', 'Other'];

    const stayStatsInit = stayCategories.reduce((acc, cat) => {
        acc[cat] = { calls: 0, errors: 0, latencies: [] };
        return acc;
    }, {} as Record<string, { calls: number; errors: number; latencies: number[] }>);

    const occupancyStatsInit = occupancyProfiles.reduce((acc, prof) => {
        acc[prof] = { calls: 0, errors: 0, latencies: [] };
        return acc;
    }, {} as Record<string, { calls: number; errors: number; latencies: number[] }>);

    const matrixInit = {} as Record<string, Record<string, { calls: number; errors: number; latencies: number[] }>>;
    stayCategories.forEach(cat => {
        matrixInit[cat] = {};
        occupancyProfiles.forEach(prof => {
            matrixInit[cat][prof] = { calls: 0, errors: 0, latencies: [] };
        });
    });

    let totalStayDuration = 0;
    let stayDurationCount = 0;

    searchLogs.forEach(log => {
        let comp = log.composition;
        if (comp === undefined || comp === null) {
            const match = log.uriStem.match(/[?&]composition=([^&]+)/);
            comp = match ? decodeURIComponent(match[1]) : null;
        }
        
        let sd = log.stayDuration;
        let tg = log.totalGuests;
        let cp = log.childrenPresent;
        
        if (sd === undefined || sd === null || tg === undefined || tg === null || cp === undefined || cp === null) {
            const parsed = parseSearchParams(log.uriStem);
            if (sd === undefined || sd === null) sd = parsed.stayDuration;
            if (tg === undefined || tg === null) tg = parsed.totalGuests;
            if (cp === undefined || cp === null) cp = parsed.childrenPresent;
        }

        if (sd !== undefined && sd !== null) {
            totalStayDuration += sd;
            stayDurationCount++;
        }

        const stayCat = getStayCategory(sd);
        const occProf = getOccupancyProfile(comp, tg, cp);

        if (stayCat && stayStatsInit[stayCat]) {
            stayStatsInit[stayCat].calls++;
            if (log.statusCode >= 400) stayStatsInit[stayCat].errors++;
            stayStatsInit[stayCat].latencies.push(log.timeTaken);
        }

        if (occProf && occupancyStatsInit[occProf]) {
            occupancyStatsInit[occProf].calls++;
            if (log.statusCode >= 400) occupancyStatsInit[occProf].errors++;
            occupancyStatsInit[occProf].latencies.push(log.timeTaken);
        }

        if (stayCat && occProf && matrixInit[stayCat] && matrixInit[stayCat][occProf]) {
            matrixInit[stayCat][occProf].calls++;
            if (log.statusCode >= 400) matrixInit[stayCat][occProf].errors++;
            matrixInit[stayCat][occProf].latencies.push(log.timeTaken);
        }
    });

    const avgStayDuration = stayDurationCount > 0 ? totalStayDuration / stayDurationCount : 0;
    const familyCalls = occupancyStatsInit['Family']?.calls || 0;
    const totalOccupancyCalls = Object.values(occupancyStatsInit).reduce((a, b) => a + b.calls, 0);
    const familySearchShare = totalOccupancyCalls > 0 ? (familyCalls / totalOccupancyCalls) * 100 : 0;

    const stayCategoryStats = Object.entries(stayStatsInit).map(([category, data]) => ({
        category,
        totalCalls: data.calls,
        errorCount: data.errors,
        errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0,
        avgLatency: data.calls > 0 ? data.latencies.reduce((a, b) => a + b, 0) / data.calls : 0,
        p95Latency: p95(data.latencies),
    }));

    const occupancyStats = Object.entries(occupancyStatsInit).map(([profile, data]) => ({
        profile,
        totalCalls: data.calls,
        errorCount: data.errors,
        errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0,
        avgLatency: data.calls > 0 ? data.latencies.reduce((a, b) => a + b, 0) / data.calls : 0,
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
                avgLatency: data.calls > 0 ? data.latencies.reduce((a, b) => a + b, 0) / data.calls : 0,
                p95Latency: p95(data.latencies),
            });
        });
    });

    const requestsPerWindow1: { [key: number]: number } = {};
    const requestsPerWindow15: { [key: number]: number } = {};
    const requestsPerWindow60: { [key: number]: number } = {};
    const timeMap = new Map<number, { requests: number; errors: number; totalLatency: number }>();

    // Single pass for time binning and throughput calculations
    sortedLogs.forEach(log => {
        const ts = log.timestamp.getTime();

        // 1 minute bins
        const window1 = Math.floor(ts / 60000);
        requestsPerWindow1[window1] = (requestsPerWindow1[window1] || 0) + 1;

        // 15 minute bins
        const window15 = Math.floor(ts / (15 * 60000));
        requestsPerWindow15[window15] = (requestsPerWindow15[window15] || 0) + 1;

        // 60 minute bins
        const window60 = Math.floor(ts / (60 * 60000));
        requestsPerWindow60[window60] = (requestsPerWindow60[window60] || 0) + 1;

        // Time Map for Series Data (Binning by minute: 60000ms)
        const bin = window1 * 60000;
        const existing = timeMap.get(bin) || { requests: 0, errors: 0, totalLatency: 0 };
        existing.requests++;
        if (log.statusCode >= 400) existing.errors++;
        existing.totalLatency += log.timeTaken;
        timeMap.set(bin, existing);
    });

    const getThroughputStats = (requestsPerWindow: { [key: number]: number }, windowSize: number) => {
        const windowValues = Object.values(requestsPerWindow);
        if (windowValues.length === 0) {
            return { mean: "0.00", max: "0.00" };
        }

        let sum = 0;
        let maxVal = -Infinity;
        for (let i = 0; i < windowValues.length; i++) {
            sum += windowValues[i];
            if (windowValues[i] > maxVal) {
                maxVal = windowValues[i];
            }
        }

        const mean = (sum / windowValues.length) / windowSize;
        const max = maxVal / windowSize;
        return { mean: mean.toFixed(2), max: max.toFixed(2) };
    };

    // Generate Time Series Data for Charts
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

    // ─── Performance Outliers & Statistical Calculations ─────────────────────────
    
    // Calculate overall mean & stdDev for latency
    const totalLatency = sortedLogs.reduce((sum, log) => sum + log.timeTaken, 0);
    const overallMean = totalRequests > 0 ? totalLatency / totalRequests : 0;
    const overallVariance = totalRequests > 0 
        ? sortedLogs.reduce((sum, log) => sum + Math.pow(log.timeTaken - overallMean, 2), 0) / totalRequests 
        : 0;
    const overallStdDev = Math.sqrt(overallVariance);

    // Calculate mean & stdDev per endpoint
    const endpointStats = new Map<string, { mean: number; stdDev: number; calls: number }>();
    Object.entries(endpoints).forEach(([uri, data]) => {
        const calls = data.calls;
        const sum = data.latencies.reduce((a, b) => a + b, 0);
        const mean = sum / calls;
        const variance = data.latencies.reduce((sumVal, val) => sumVal + Math.pow(val - mean, 2), 0) / calls;
        const stdDev = Math.sqrt(variance);
        endpointStats.set(uri, { mean, stdDev, calls });
    });

    // Flag anomalies (Outliers)
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

    sortedLogs.forEach(log => {
        const stats = endpointStats.get(log.uriStem);
        if (stats && stats.calls >= 5 && stats.stdDev > 0) {
            const zScore = (log.timeTaken - stats.mean) / stats.stdDev;
            // Flag if Z-score > 3, latency > 100ms
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
    });

    // Sort outliers by zScore descending
    outliers.sort((a, b) => b.zScore - a.zScore);
    const latencyOutliers = outliers.slice(0, 500);

    // Anomaly correlations
    const ipCounts: Record<string, number> = {};
    outliers.forEach(o => { ipCounts[o.clientIp] = (ipCounts[o.clientIp] || 0) + 1; });
    const ipCorrelation = Object.entries(ipCounts)
        .map(([ip, count]) => ({ value: ip, count, percentage: outliers.length > 0 ? (count / outliers.length) * 100 : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const methodCounts: Record<string, number> = {};
    outliers.forEach(o => { const m = o.method || 'GET'; methodCounts[m] = (methodCounts[m] || 0) + 1; });
    const methodCorrelation = Object.entries(methodCounts)
        .map(([method, count]) => ({ value: method, count, percentage: outliers.length > 0 ? (count / outliers.length) * 100 : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const statusCounts: Record<number, number> = {};
    outliers.forEach(o => { statusCounts[o.statusCode] = (statusCounts[o.statusCode] || 0) + 1; });
    const statusCorrelation = Object.entries(statusCounts)
        .map(([status, count]) => ({ value: parseInt(status, 10), count, percentage: outliers.length > 0 ? (count / outliers.length) * 100 : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Predefined buckets: <50ms, 50-200ms, 200-500ms, 500-1000ms, 1s-3s, 3s+
    const distribution = {
        under50: 0,
        under200: 0,
        under500: 0,
        under1000: 0,
        under3000: 0,
        over3000: 0
    };
    sortedLogs.forEach(log => {
        const t = log.timeTaken;
        if (t < 50) distribution.under50++;
        else if (t < 200) distribution.under200++;
        else if (t < 500) distribution.under500++;
        else if (t < 1000) distribution.under1000++;
        else if (t < 3000) distribution.under3000++;
        else distribution.over3000++;
    });

    const distributionData = [
        { range: '< 50ms', count: distribution.under50 },
        { range: '50-200ms', count: distribution.under200 },
        { range: '200-500ms', count: distribution.under500 },
        { range: '500-1000ms', count: distribution.under1000 },
        { range: '1s-3s', count: distribution.under3000 },
        { range: '3s+', count: distribution.over3000 },
    ];

    const deviceCategories = {
        desktop: 0,
        mobile: 0,
        crawler: 0,
        scraper: 0,
        unknown: 0
    };

    const botStats = new Map<string, { count: number; errorCount: number; totalLatency: number }>();

    sortedLogs.forEach(log => {
        const cat = log.deviceCategory || 'unknown';
        if (cat in deviceCategories) {
            deviceCategories[cat as keyof typeof deviceCategories]++;
        } else {
            deviceCategories.unknown++;
        }

        if (log.userAgent && (cat === 'crawler' || cat === 'scraper')) {
            const existing = botStats.get(log.userAgent) || { count: 0, errorCount: 0, totalLatency: 0 };
            existing.count++;
            if (log.statusCode >= 400) {
                existing.errorCount++;
            }
            existing.totalLatency += log.timeTaken;
            botStats.set(log.userAgent, existing);
        }
    });

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
            rpm1: getThroughputStats(requestsPerWindow1, 1),
            rpm15: getThroughputStats(requestsPerWindow15, 15),
            rpm60: getThroughputStats(requestsPerWindow60, 60),
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
