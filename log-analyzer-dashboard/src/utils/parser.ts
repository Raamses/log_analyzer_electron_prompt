export type DeviceCategory = 'desktop' | 'mobile' | 'crawler' | 'scraper' | 'unknown';

export interface LogEntry {
    timestamp: Date;
    uriStem: string;
    statusCode: number;
    timeTaken: number;
    clientIp: string;
    method?: string;
    userAgent?: string;
    deviceCategory?: DeviceCategory;
    scBytes?: number;
    csBytes?: number;
    hotelCode?: string | null;
    composition?: string | null;
    stayDuration?: number | null;
    totalGuests?: number | null;
    childrenPresent?: boolean | null;
}

export function safeDecodeURIComponent(str: string): string {
    if (!str) return '';
    try {
        return decodeURIComponent(str.replace(/\+/g, ' '));
    } catch {
        return str.replace(/\+/g, ' ');
    }
}

export function classifyUserAgent(uaString: string | undefined): DeviceCategory {
    if (!uaString || uaString === '-') return 'unknown';
    
    const ua = safeDecodeURIComponent(uaString).toLowerCase();
    
    // 1. Search Engines / Crawlers
    const crawlers = ['googlebot', 'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot', 'facebot', 'facebookexternalhit', 'slurp', 'ia_archiver'];
    if (crawlers.some(bot => ua.includes(bot))) {
        return 'crawler';
    }
    
    // 2. Automation / Scripting / Scrapers
    const automation = ['python', 'curl', 'wget', 'httpclient', 'go-http-client', 'postman', 'scrapy', 'playwright', 'puppeteer', 'headless', 'axios', 'node-fetch'];
    if (automation.some(tool => ua.includes(tool))) {
        return 'scraper';
    }
    
    // 3. Mobile vs Desktop
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad') || ua.includes('phone')) {
        return 'mobile';
    }
    
    if (ua.includes('mozilla') || ua.includes('gecko') || ua.includes('chrome') || ua.includes('safari') || ua.includes('opera') || ua.includes('edge')) {
        return 'desktop';
    }
    
    return 'unknown';
}

export interface SearchParams {
    hotelCode: string | null;
    composition: string | null;
    stayDuration: number | null;
    totalGuests: number | null;
    childrenPresent: boolean | null;
}

export function parseDateString(dateStr: string): Date | null {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();
    
    // 1. Format: DD-MM-YYYY or DD/MM/YYYY
    const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
    const dmyMatch = cleanStr.match(dmyRegex);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        const year = parseInt(dmyMatch[3], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            return new Date(Date.UTC(year, month - 1, day));
        }
    }
    
    // 2. Format: YYYY-MM-DD or YYYY/MM/DD
    const ymdRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
    const ymdMatch = cleanStr.match(ymdRegex);
    if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10);
        const day = parseInt(ymdMatch[3], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            return new Date(Date.UTC(year, month - 1, day));
        }
    }
    
    // 3. Fallback: Standard Date parser
    const parsed = Date.parse(cleanStr);
    if (!isNaN(parsed)) {
        const d = new Date(parsed);
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
    
    return null;
}

export function parseSearchParams(url: string): SearchParams {
    const result: SearchParams = {
        hotelCode: null,
        composition: null,
        stayDuration: null,
        totalGuests: null,
        childrenPresent: null
    };
    
    const queryIdx = url.indexOf('?');
    if (queryIdx === -1) return result;
    const query = url.substring(queryIdx + 1);
    const pairs = query.split('&');
    
    let checkInStr: string | null = null;
    let checkOutStr: string | null = null;
    
    // 1. Try parsing from SearchQuery (case-insensitive) parameter first
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].split('=');
        const keyLower = pair[0].toLowerCase();
        if (keyLower === 'searchquery' && pair[1]) {
            try {
                const decodedVal = safeDecodeURIComponent(pair[1]);
                // Format: HOTELCODE/STARTDATE/ENDDATE/COMPOSITION/FLIGHTFROM...
                const parts = decodedVal.split('/');
                if (parts.length >= 3) {
                    result.hotelCode = parts[0];
                    checkInStr = parts[1];
                    checkOutStr = parts[2];
                    
                    const compParts: string[] = [];
                    // Room compositions are generally of format X-Y-Z where X, Y, Z are single/double digits.
                    // Skip parts[1] and parts[2] (dates DD-MM-YYYY) to avoid incorrect matching.
                    const compRegex = /^\d{1,2}-\d{1,2}-\d{1,2}(?:,\d{1,2}-\d{1,2}-\d{1,2})*$/;
                    for (let j = 3; j < parts.length; j++) {
                        const part = parts[j];
                        if (compRegex.test(part)) {
                            compParts.push(part);
                        }
                    }
                    if (compParts.length > 0) {
                        result.composition = compParts.join(',');
                    }
                }
            } catch {
                // Ignore decoding errors
            }
        }
    }

    // 2. Fallback to standard hotelCode and composition parameters
    if (!result.hotelCode || !result.composition || !checkInStr || !checkOutStr) {
        let tempAdults = '0', tempChildren = '0', tempInfants = '0';
        let hasGuestParams = false;
        
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].split('=');
            if (!pair[1]) continue;
            
            const key = pair[0];
            const val = safeDecodeURIComponent(pair[1]);
            
            if (key === 'hotelCode' && !result.hotelCode) {
                result.hotelCode = val;
            } else if (key === 'composition' && !result.composition) {
                result.composition = val;
            } else if (['checkIn', 'checkin', 'startDate', 'arrival', 'checkInDate', 'checkinDate'].includes(key)) {
                checkInStr = val;
            } else if (['checkOut', 'checkout', 'endDate', 'departure', 'checkOutDate', 'checkoutDate'].includes(key)) {
                checkOutStr = val;
            } else if (key === 'adults') {
                tempAdults = val;
                hasGuestParams = true;
            } else if (key === 'children') {
                tempChildren = val;
                hasGuestParams = true;
            } else if (key === 'infants') {
                tempInfants = val;
                hasGuestParams = true;
            }
        }
        
        if (!result.composition && hasGuestParams) {
            result.composition = `${tempAdults}-${tempChildren}-${tempInfants}`;
        }
    }

    // 3. Fallback to nested JSON 'query' parameter
    if (!result.hotelCode || !result.composition || !checkInStr || !checkOutStr) {
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].split('=');
            if (pair[0] === 'query' && pair[1]) {
                try {
                    const decodedVal = safeDecodeURIComponent(pair[1]);
                    const parsedJson = JSON.parse(decodedVal);
                    
                    const hc = parsedJson.HotelCode || parsedJson.hotelCode;
                    if (!result.hotelCode && hc) {
                        result.hotelCode = hc;
                    }
                    if (!result.hotelCode) {
                        const codes = parsedJson.HotelCodes || parsedJson.hotelCodes;
                        if (Array.isArray(codes) && codes.length > 0) {
                            result.hotelCode = codes[0];
                        }
                    }
                    
                    const ci = parsedJson.checkIn || parsedJson.checkin || parsedJson.checkInDate || parsedJson.checkinDate || parsedJson.startDate || parsedJson.arrival;
                    if (!checkInStr && ci) checkInStr = String(ci);
                    
                    const co = parsedJson.checkOut || parsedJson.checkout || parsedJson.checkOutDate || parsedJson.checkoutDate || parsedJson.endDate || parsedJson.departure;
                    if (!checkOutStr && co) checkOutStr = String(co);
                    
                    const rooms = parsedJson.Rooms || parsedJson.rooms;
                    if (!result.composition && Array.isArray(rooms)) {
                        const compParts = rooms.map((room: any) => {
                            const adults = room.AdultsNumber || room.adults || '0';
                            const children = room.ChildrenNumber || room.children || '0';
                            const infants = room.InfantsNumber || room.infants || '0';
                            return `${adults}-${children}-${infants}`;
                        });
                        if (compParts.length > 0) {
                            result.composition = compParts.join(',');
                        }
                    }
                } catch {
                    // Ignore JSON parse errors
                }
            }
        }
    }
    
    // 4. Calculate Stay Duration & Guest Counts
    if (checkInStr && checkOutStr) {
        const checkIn = parseDateString(checkInStr);
        const checkOut = parseDateString(checkOutStr);
        if (checkIn && checkOut) {
            const diffMs = checkOut.getTime() - checkIn.getTime();
            const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
            // Clamp stay duration to valid boundaries (1 to 90 nights)
            if (nights >= 1 && nights <= 90) {
                result.stayDuration = nights;
            }
        }
    }
    
    if (result.composition) {
        const rooms = result.composition.split(',');
        let adultsSum = 0;
        let childrenSum = 0;
        let infantsSum = 0;
        
        rooms.forEach(room => {
            const parts = room.split('-');
            if (parts.length >= 1) adultsSum += parseInt(parts[0], 10) || 0;
            if (parts.length >= 2) childrenSum += parseInt(parts[1], 10) || 0;
            if (parts.length >= 3) infantsSum += parseInt(parts[2], 10) || 0;
        });
        
        result.totalGuests = adultsSum + childrenSum + infantsSum;
        result.childrenPresent = childrenSum > 0 || infantsSum > 0;
    }
    
    return result;
}

export const parseLogs = (content: string): { logs: LogEntry[], error: string } => {
    // Normalize Windows CRLF -> LF
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
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
            fields = { 
                date: fieldNames.indexOf('date'), 
                time: fieldNames.indexOf('time'), 
                uri: fieldNames.indexOf('cs-uri-stem'), 
                query: fieldNames.indexOf('cs-uri-query'),
                status: fieldNames.indexOf('sc-status'), 
                timeTaken: fieldNames.indexOf('time-taken'), 
                // Prefer real client IP: X-Forwarded-For falls back to c-ip
                ip: fieldNames.indexOf('X-Forwarded-For') !== -1 
                    ? fieldNames.indexOf('X-Forwarded-For') 
                    : fieldNames.indexOf('c-ip'),
                method: fieldNames.indexOf('cs-method') !== -1 
                    ? fieldNames.indexOf('cs-method') 
                    : fieldNames.indexOf('method'),
                userAgent: fieldNames.indexOf('cs(User-Agent)'),
                scBytes: fieldNames.indexOf('sc-bytes'),
                csBytes: fieldNames.indexOf('cs-bytes')
            };
            headerLine = i;
            break;
        }
        if (line.includes('TimeGenerated [UTC]') && line.includes('RequestUri')) {
            format = 'AzureAPGW';
            const fieldNames = line.split('\t');
            fields = { 
                time: fieldNames.indexOf('TimeGenerated [UTC]'), 
                status: fieldNames.indexOf('HttpStatus'), 
                uri: fieldNames.indexOf('RequestUri'), 
                query: -1,
                ip: fieldNames.indexOf('ClientIp'), 
                timeTaken: fieldNames.indexOf('TimeTaken'),
                method: fieldNames.indexOf('Method') !== -1 
                    ? fieldNames.indexOf('Method') 
                    : (fieldNames.indexOf('HttpMethod') !== -1 
                        ? fieldNames.indexOf('HttpMethod') 
                        : fieldNames.indexOf('httpMethod')),
                userAgent: fieldNames.indexOf('UserAgent') !== -1
                    ? fieldNames.indexOf('UserAgent')
                    : fieldNames.indexOf('userAgent_s'),
                scBytes: fieldNames.indexOf('ResponseBytes') !== -1
                    ? fieldNames.indexOf('ResponseBytes')
                    : fieldNames.indexOf('scBytes'),
                csBytes: fieldNames.indexOf('ReceivedBytes') !== -1
                    ? fieldNames.indexOf('ReceivedBytes')
                    : fieldNames.indexOf('csBytes')
            };
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

        const values = format === 'IIS' ? lines[i].split(' ') : lines[i].split('\t');
        try {
            let uri = values[fields.uri] || '-';

            // Append query string if it exists and isn't a placeholder
            if (fields.query !== -1 && values[fields.query] && values[fields.query] !== '-') {
                uri = `${uri}?${values[fields.query]}`;
            }

            const uriLower = uri.toLowerCase();
            if (uriLower.includes("searchresult") || uriLower.includes("search-results") || uriLower.includes("getsinglehotelsearchresults")) {
                const parts = uri.split('?');
                uri = parts.length > 1 ? `/singleHotelSearch?${parts[1]}` : '/singleHotelSearch';
            }

            const timeTaken = format === 'AzureAPGW' 
                ? parseFloat(values[fields.timeTaken]) * 1000 
                : parseFloat(values[fields.timeTaken]);

            // For X-Forwarded-For, take the first (original client) IP from a comma-separated list
            let clientIp = values[fields.ip] || '-';
            if (clientIp.includes(',')) {
                clientIp = clientIp.split(',')[0].trim();
            }

            const logEntry: LogEntry = {
                timestamp: format === 'IIS' 
                    ? new Date(`${values[fields.date]}T${values[fields.time]}Z`) 
                    : new Date(values[fields.time]),
                uriStem: uri,
                statusCode: parseInt(values[fields.status], 10),
                timeTaken: timeTaken,
                clientIp: clientIp,
            };

            if (fields.method !== -1 && fields.method !== undefined && values[fields.method]) {
                logEntry.method = values[fields.method].trim().toUpperCase();
            }

            if (fields.userAgent !== -1 && fields.userAgent !== undefined && values[fields.userAgent]) {
                const rawUa = values[fields.userAgent];
                logEntry.userAgent = safeDecodeURIComponent(rawUa);
                logEntry.deviceCategory = classifyUserAgent(rawUa);
            }

            if (fields.scBytes !== -1 && fields.scBytes !== undefined && values[fields.scBytes]) {
                const bytes = parseInt(values[fields.scBytes], 10);
                if (!isNaN(bytes)) logEntry.scBytes = bytes;
            }

            if (fields.csBytes !== -1 && fields.csBytes !== undefined && values[fields.csBytes]) {
                const bytes = parseInt(values[fields.csBytes], 10);
                if (!isNaN(bytes)) logEntry.csBytes = bytes;
            }

            const searchParams = parseSearchParams(uri);
            logEntry.hotelCode = searchParams.hotelCode;
            logEntry.composition = searchParams.composition;
            logEntry.stayDuration = searchParams.stayDuration;
            logEntry.totalGuests = searchParams.totalGuests;
            logEntry.childrenPresent = searchParams.childrenPresent;

            if (!isNaN(logEntry.timestamp.getTime()) && !isNaN(logEntry.statusCode)) {
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

export function getStayCategory(nights: number | null | undefined): string | null {
    if (nights === undefined || nights === null) return null;
    if (nights >= 1 && nights <= 3) return 'Short';
    if (nights >= 4 && nights <= 7) return 'Standard';
    if (nights >= 8 && nights <= 14) return 'Long';
    if (nights >= 15) return 'Extended';
    return null;
}

export function getOccupancyProfile(
    composition: string | null | undefined,
    totalGuests: number | null | undefined,
    childrenPresent: boolean | null | undefined
): string | null {
    if (!composition) return null;
    if (composition === '1-0-0') return 'Single';
    if (composition === '2-0-0') return 'Double';
    if ((totalGuests && totalGuests > 2) || childrenPresent) return 'Family';
    return 'Other';
}


