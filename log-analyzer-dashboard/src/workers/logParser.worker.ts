import { classifyUserAgent, parseSearchParams } from '../utils/parser';

// Compact wire format sent to main thread — no Date objects, minimal strings
export interface LogEntryWire {
  ts: number;        // Unix timestamp ms
  uri: string;
  sc: number;        // sc-status
  tt: number;        // time-taken
  ip: string;
  method?: string;
  uaIdx?: number;     // Index pointing to the UA dictionary
  scb?: number;       // sc-bytes
  csb?: number;       // cs-bytes
  hc?: string | null;  // pre-parsed hotel code
  comp?: string | null; // pre-parsed composition
  sd?: number | null;   // pre-parsed stay duration
  tg?: number | null;   // pre-parsed total guests
  cp?: boolean | null;  // pre-parsed children present
}

// Field index map, resolved once from the #Fields: header
interface FieldMap {
  format: 'IIS' | 'AzureAPGW';
  date: number;
  time: number;
  uri: number;
  query: number;
  status: number;
  timeTaken: number;
  ip: number;
  method: number;
  userAgent: number;
  scBytes: number;
  csBytes: number;
}

function resolveFields(line: string): FieldMap | null {
  const clean = line.replace(/\r$/, '');

  if (clean.startsWith('#Fields:')) {
    const names = clean.substring(9).trim().split(' ');
    return {
      format: 'IIS',
      date: names.indexOf('date'),
      time: names.indexOf('time'),
      uri: names.indexOf('cs-uri-stem'),
      query: names.indexOf('cs-uri-query'),
      status: names.indexOf('sc-status'),
      timeTaken: names.indexOf('time-taken'),
      ip: names.indexOf('X-Forwarded-For') !== -1
        ? names.indexOf('X-Forwarded-For')
        : names.indexOf('c-ip'),
      method: names.indexOf('cs-method') !== -1
        ? names.indexOf('cs-method')
        : names.indexOf('method'),
      userAgent: names.indexOf('cs(User-Agent)'),
      scBytes: names.indexOf('sc-bytes'),
      csBytes: names.indexOf('cs-bytes'),
    };
  }

  if (clean.includes('TimeGenerated [UTC]') && clean.includes('RequestUri')) {
    const names = clean.split('\t');
    return {
      format: 'AzureAPGW',
      date: -1,
      time: names.indexOf('TimeGenerated [UTC]'),
      uri: names.indexOf('RequestUri'),
      query: -1,
      status: names.indexOf('HttpStatus'),
      timeTaken: names.indexOf('TimeTaken'),
      ip: names.indexOf('ClientIp'),
      method: names.indexOf('Method') !== -1
        ? names.indexOf('Method')
        : names.indexOf('HttpMethod') !== -1
          ? names.indexOf('HttpMethod')
          : names.indexOf('httpMethod'),
      userAgent: names.indexOf('UserAgent') !== -1
        ? names.indexOf('UserAgent')
        : names.indexOf('userAgent_s'),
      scBytes: names.indexOf('ResponseBytes') !== -1
        ? names.indexOf('ResponseBytes')
        : names.indexOf('scBytes'),
      csBytes: names.indexOf('ReceivedBytes') !== -1
        ? names.indexOf('ReceivedBytes')
        : names.indexOf('csBytes'),
    };
  }

  return null;
}

function parseLine(
  line: string,
  f: FieldMap,
  uaMap: Map<string, number>,
  uaDictionary: { raw: string; category: string }[]
): LogEntryWire | null {
  if (!line || line.startsWith('#')) return null;

  const v = f.format === 'IIS' ? line.split(' ') : line.split('\t');

  try {
    let uri = v[f.uri] || '-';
    if (f.query !== -1 && v[f.query] && v[f.query] !== '-') {
      uri = `${uri}?${v[f.query]}`;
    }
    const uriLower = uri.toLowerCase();
    if (uriLower.includes('searchresult') || uriLower.includes('search-results') || uriLower.includes('getsinglehotelsearchresults')) {
      const parts = uri.split('?');
      uri = parts.length > 1 ? `/singleHotelSearch?${parts[1]}` : '/singleHotelSearch';
    }

    let ts: number;
    if (f.format === 'IIS') {
      const datePart = v[f.date];
      const timePart = v[f.time];
      if (!datePart || !timePart) return null;
      ts = Date.parse(`${datePart}T${timePart}Z`);
    } else {
      ts = Date.parse(v[f.time]);
    }

    if (isNaN(ts)) return null;

    const sc = parseInt(v[f.status], 10);
    if (isNaN(sc)) return null;

    const ttRaw = parseFloat(v[f.timeTaken]);
    const tt = f.format === 'AzureAPGW' ? ttRaw * 1000 : ttRaw;

    let ip = v[f.ip] || '-';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();

    const entry: LogEntryWire = { ts, uri, sc, tt, ip };

    if (f.method !== -1 && v[f.method]) {
      entry.method = v[f.method].trim().toUpperCase();
    }

    // User Agent Dictionary Lookup
    if (f.userAgent !== -1 && v[f.userAgent] && v[f.userAgent] !== '-') {
      const rawUa = v[f.userAgent];
      let uaIdx = uaMap.get(rawUa);
      if (uaIdx === undefined) {
        uaIdx = uaDictionary.length;
        uaMap.set(rawUa, uaIdx);
        uaDictionary.push({
          raw: rawUa,
          category: classifyUserAgent(rawUa)
        });
      }
      entry.uaIdx = uaIdx;
    }

    // Parse bytes
    if (f.scBytes !== -1 && v[f.scBytes]) {
      const bytes = parseInt(v[f.scBytes], 10);
      if (!isNaN(bytes)) entry.scb = bytes;
    }
    if (f.csBytes !== -1 && v[f.csBytes]) {
      const bytes = parseInt(v[f.csBytes], 10);
      if (!isNaN(bytes)) entry.csb = bytes;
    }

    // Pre-parse query parameters
    const searchParams = parseSearchParams(uri);
    entry.hc = searchParams.hotelCode;
    entry.comp = searchParams.composition;
    
    // Sparse representation: only attach stay info if it's a search request
    if (uri.includes('singleHotelSearch') || searchParams.hotelCode || searchParams.composition) {
      entry.sd = searchParams.stayDuration;
      entry.tg = searchParams.totalGuests;
      entry.cp = searchParams.childrenPresent;
    }

    return entry;
  } catch {
    return null;
  }
}

// ─── Main Worker Entry Point ──────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<File>) => {
  const file = e.data;
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB decode window
  const decoder = new TextDecoder('utf-8');

  let leftover = '';
  let fieldMap: FieldMap | null = null;
  let bytesRead = 0;

  const entries: LogEntryWire[] = [];
  const uaDictionary: { raw: string; category: string }[] = [];
  const uaMap = new Map<string, number>();

  try {
    while (bytesRead < file.size) {
      const slice = file.slice(bytesRead, bytesRead + CHUNK_SIZE);
      const arrayBuffer = await slice.arrayBuffer();
      const chunkText = decoder.decode(arrayBuffer, { stream: bytesRead + CHUNK_SIZE < file.size });
      bytesRead += arrayBuffer.byteLength;

      const raw = leftover + chunkText;
      const nlIndex = raw.lastIndexOf('\n');

      let processable: string;
      if (nlIndex === -1) {
        leftover = raw;
        continue;
      }

      processable = raw.substring(0, nlIndex);
      leftover = raw.substring(nlIndex + 1);

      const lines = processable.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/\r$/, ''); // strip CRLF

        if (fieldMap === null) {
          if (line.startsWith('#Fields:') || (line.includes('TimeGenerated [UTC]') && line.includes('RequestUri'))) {
            fieldMap = resolveFields(line);
          }
          continue;
        }

        if (line.startsWith('#') || line.trim() === '') continue;

        const entry = parseLine(line, fieldMap, uaMap, uaDictionary);
        if (entry) entries.push(entry);
      }

      const progress = Math.round((bytesRead / file.size) * 100);
      self.postMessage({ type: 'progress', stage: 'reading', progress });
    }

    if (leftover.trim() && fieldMap) {
      const line = leftover.replace(/\r$/, '');
      const entry = parseLine(line, fieldMap, uaMap, uaDictionary);
      if (entry) entries.push(entry);
    }

    if (!fieldMap) {
      self.postMessage({
        type: 'error',
        error: 'Invalid or unsupported log format. Please provide IIS W3C or Azure APGW logs.'
      });
      return;
    }

    self.postMessage({ type: 'progress', stage: 'parsing', progress: 50 });

    entries.sort((a, b) => a.ts - b.ts);

    self.postMessage({ type: 'progress', stage: 'parsing', progress: 100 });

    self.postMessage({ type: 'done', logs: entries, uaDictionary });

  } catch (err: any) {
    self.postMessage({ type: 'error', error: err?.message || 'Unknown error processing file' });
  }
};

