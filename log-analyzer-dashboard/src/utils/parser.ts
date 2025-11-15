export interface LogEntry {
    timestamp: Date;
    uriStem: string;
    statusCode: number;
    timeTaken: number;
    clientIp: string;
}

export const parseLogs = (content: string): { logs: LogEntry[], error: string } => {
    const lines = content.trim().split('\n');
    if (lines.length === 0) {
        return { logs: [], error: '' };
    }

    let format = null;
    let fields: any = {};
    let headerLine = -1;

    for(let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#Fields:')) {
            format = 'IIS';
            const fieldNames = line.substring(9).trim().split(' ');
            fields = { date: fieldNames.indexOf('date'), time: fieldNames.indexOf('time'), uri: fieldNames.indexOf('cs-uri-stem'), status: fieldNames.indexOf('sc-status'), timeTaken: fieldNames.indexOf('time-taken'), ip: fieldNames.indexOf('c-ip') };
            headerLine = i;
            break;
        }
        if (line.includes('TimeGenerated [UTC]') && line.includes('RequestUri')) {
            format = 'AzureAPGW';
            const fieldNames = line.split('\t');
            fields = { time: fieldNames.indexOf('TimeGenerated [UTC]'), status: fieldNames.indexOf('HttpStatus'), uri: fieldNames.indexOf('RequestUri'), ip: fieldNames.indexOf('ClientIp'), timeTaken: fieldNames.indexOf('TimeTaken') };
            headerLine = i;
            break;
        }
    }

    if (!format) {
        return { logs: [], error: 'Invalid or unsupported log format. Please provide IIS W3C or Azure APGW logs.' };
    }

    const data: LogEntry[] = [];
    for (let i = headerLine + 1; i < lines.length; i++) {
        if (lines[i].startsWith('#') || lines[i].trim() === '') continue;

        let values = format === 'IIS' ? lines[i].split(' ') : lines[i].split('\t');
        try {
            let uri = values[fields.uri];
            if (uri.includes("searchresult")) uri = 'singleHotelSearch?' + uri.split('?')[1];

            const timeTaken = format === 'AzureAPGW' ? parseFloat(values[fields.timeTaken]) * 1000 : parseFloat(values[fields.timeTaken]);

            const logEntry = {
                timestamp: format === 'IIS' ? new Date(`${values[fields.date]}T${values[fields.time]}Z`) : new Date(values[fields.time]),
                uriStem: uri,
                statusCode: parseInt(values[fields.status], 10),
                timeTaken: timeTaken,
                clientIp: values[fields.ip],
            };

            if (!isNaN(logEntry.timestamp.getTime())) {
                data.push(logEntry);
            }
        } catch (e) {
            // Ignore lines that fail to parse
        }
    }

    if (data.length === 0) {
        return { logs: [], error: 'Successfully parsed, but no valid log entries were found.' };
    }

    return { logs: data, error: '' };
};
