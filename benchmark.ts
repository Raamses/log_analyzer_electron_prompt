export interface LogEntry {
    timestamp: Date;
    clientIp: string;
    method: string;
    uriStem: string;
    statusCode: number;
    timeTaken: number;
    // ... other fields
}

// Generate dummy logs
const generateLogs = (count: number): LogEntry[] => {
    const logs: LogEntry[] = [];
    const baseTime = new Date('2023-01-01T00:00:00Z').getTime();
    for (let i = 0; i < count; i++) {
        const isError = Math.random() < 0.1; // 10% errors
        const statusCode = isError ? (Math.random() < 0.5 ? 404 : 500) : 200;
        logs.push({
            timestamp: new Date(baseTime + i * 1000),
            clientIp: '127.0.0.1',
            method: 'GET',
            uriStem: '/api/test',
            statusCode: statusCode,
            timeTaken: 100 + Math.random() * 500,
        } as LogEntry);
    }
    return logs;
};

const logs = generateLogs(1_000_000);
const totalRequests = logs.length;

// Version 1: Original
function runOriginal() {
    const sortedLogs = logs;
    const errors = sortedLogs.filter(log => log.statusCode >= 400);
    const totalErrors = errors.length;
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const clientErrors = errors.filter(log => log.statusCode >= 400 && log.statusCode < 500).length;
    const serverErrors = errors.filter(log => log.statusCode >= 500).length;
    const errorCodes = errors.reduce((acc, log) => { acc[log.statusCode] = (acc[log.statusCode] || 0) + 1; return acc; }, {} as { [key: string]: number });
    return { totalErrors, clientErrors, serverErrors, errorCodes };
}

// Version 2: Optimized
function runOptimized() {
    const sortedLogs = logs;
    let totalErrors = 0;
    let clientErrors = 0;
    let serverErrors = 0;
    const errorCodes: { [key: string]: number } = {};

    for (let i = 0; i < sortedLogs.length; i++) {
        const log = sortedLogs[i];
        if (log.statusCode >= 400) {
            totalErrors++;
            if (log.statusCode < 500) {
                clientErrors++;
            } else {
                serverErrors++;
            }
            errorCodes[log.statusCode] = (errorCodes[log.statusCode] || 0) + 1;
        }
    }
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    return { totalErrors, clientErrors, serverErrors, errorCodes };
}

// Warmup
for (let i = 0; i < 5; i++) {
    runOriginal();
    runOptimized();
}

console.log("Starting benchmark...");

console.time("Original");
for (let i = 0; i < 50; i++) {
    runOriginal();
}
console.timeEnd("Original");

console.time("Optimized");
for (let i = 0; i < 50; i++) {
    runOptimized();
}
console.timeEnd("Optimized");

const res1 = runOriginal();
const res2 = runOptimized();
console.assert(JSON.stringify(res1) === JSON.stringify(res2), "Results mismatch!");
