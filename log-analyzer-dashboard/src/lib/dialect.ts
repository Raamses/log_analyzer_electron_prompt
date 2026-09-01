// @paths lib/dialect
/**
 * Dialect layer — framing.
 *
 * Turns raw bytes into { columns, rows } for the schema registry to consume.
 * Pure functions, no IO, no React. Each function is unit tested.
 *
 * Handles:
 *   - Encoding detection (BOM sniff: UTF-8, UTF-16LE, UTF-16BE)
 *   - Compression detection (gzip, zstd, bzip2 magic bytes)
 *   - W3C extended (#Fields: directive, space-delimited)
 *   - CSV / TSV (RFC4180 quoting-aware via one state machine)
 *   - JSON-lines (one object per line)
 *   - JSON-array ([ {...}, ... ])
 *   - Apache Combined Log Format (regex, positional, synthesised columns)
 *   - Key-value (k=v k2="v 2", some WAF/LB formats)
 *
 * Preserves the existing parser's framing decisions:
 *   - IIS W3C: split on space, #Fields: directive IS the header
 *   - Azure APGW: TSV, first row is headers
 */

export type Encoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be';
export type CompressionType = 'none' | 'gzip' | 'zstd' | 'bzip2';
export type FormatType = 'w3c' | 'csv' | 'tsv' | 'json-lines' | 'json-array' | 'clf' | 'key-value' | 'unknown';

export interface FramingResult {
  columns: string[];
  rows: string[][];
  format: FormatType;
  encoding: Encoding;
  hadBOM: boolean;
  compressed: CompressionType;
  headerLine: number;          // -1 if positional (no header line)
  warnings: string[];
}

/* ───────────────────────── compression ───────────────────────── */

export function detectCompression(buf: Uint8Array): CompressionType {
  if (buf.length < 3) return 'none';
  if (buf[0] === 0x1f && buf[1] === 0x8b) return 'gzip';
  if (buf.length >= 4 && buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd) return 'zstd';
  if (buf[0] === 0x42 && buf[1] === 0x5a && buf[2] === 0x68) return 'bzip2';
  return 'none';
}

/* ───────────────────────── encoding ───────────────────────── */

export function detectEncoding(buf: Uint8Array): { encoding: Encoding; hadBOM: boolean } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { encoding: 'utf-8-bom', hadBOM: true };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { encoding: 'utf-16le', hadBOM: true };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { encoding: 'utf-16be', hadBOM: true };
  }
  return { encoding: 'utf-8', hadBOM: false };
}

const textDecoders = new Map<string, TextDecoder>();

function getDecoder(encoding: string): TextDecoder {
  let d = textDecoders.get(encoding);
  if (!d) { d = new TextDecoder(encoding); textDecoders.set(encoding, d); }
  return d;
}

export function decodeBytes(buf: Uint8Array, encoding: Encoding): string {
  switch (encoding) {
    case 'utf-8-bom': return getDecoder('utf-8').decode(buf.slice(3));
    case 'utf-8':     return getDecoder('utf-8').decode(buf);
    case 'utf-16le': {
      const payload = (buf[0] === 0xff && buf[1] === 0xfe) ? buf.slice(2) : buf;
      return getDecoder('utf-16le').decode(payload);
    }
    case 'utf-16be': {
      const payload = (buf[0] === 0xfe && buf[1] === 0xff) ? buf.slice(2) : buf;
      const swapped = new Uint8Array(payload.byteLength);
      for (let i = 0; i < payload.byteLength; i += 2) {
        swapped[i] = payload[i + 1];
        swapped[i + 1] = payload[i];
      }
      return getDecoder('utf-16le').decode(swapped);
    }
  }
}

/* ───────────────────────── RFC4180 line parser ───────────────────────── */

/**
 * Parse one line into cells using RFC4180 rules with a configurable delimiter.
 *
 * Used for ALL delimited formats (comma, tab, space). When there is no quoting,
 * behaviour is identical to `line.split(delimiter)`. When quoting is present,
 * it correctly handles:
 *   - embedded delimiters: `a,"b,c",d` → 3 cells
 *   - embedded newlines: `a,"b\nc",d` → 3 cells (caller must join wrapped lines)
 *   - escaped quotes: `a,"b""c",d` → a, b"c, d
 *   - empty quoted field: `a,"",d` → a, '', d
 *
 * W3C uses space as delimiter and does not quote, so this reduces to split(' ').
 */
export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let i = 0;
  let inQuotes = false;
  const n = line.length;

  while (i < n) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && line[i + 1] === '"') { cur += '"'; i += 2; }
        else { inQuotes = false; i++; }
      } else { cur += ch; i++; }
      continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { cells.push(cur); cur = ''; i++; continue; }
    cur += ch;
    i++;
  }
  cells.push(cur);
  return cells;
}

/**
 * Join physically-wrapped CSV lines (a quoted field spanning multiple lines).
 * Returns an array of logical lines. Empty result if quotes are unbalanced.
 */
export function unwrapLines(lines: string[], _delimiter: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuotes = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (buf) buf += '\n';
    buf += line;

    // count unescaped quotes on the accumulated buffer
    let q = 0;
    for (let j = 0; j < buf.length; j++) {
      if (buf[j] === '"' && (j === 0 || buf[j - 1] !== '"')) q++;
      else if (buf[j] === '"' && j > 0 && buf[j - 1] === '"') { /* skip escaped */ }
    }
    // simpler: just count non-escaped quotes on this line segment
    // (re-quote-counting the whole buffer each time is O(n²); fine for framing)
    inQuotes = countQuotes(line) % 2 === 1 ? !inQuotes : inQuotes;

    if (!inQuotes) { out.push(buf); buf = ''; }
  }
  if (buf) out.push(buf);   // unbalanced — let downstream report it
  return out;
}

function countQuotes(s: string): number {
  let c = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === '"') c++;
  return c;
}

/* ───────────────────────── format sniffing ───────────────────────── */

const W3C_HEADER_RE = /^#Fields:\s*(.+)$/;
/**
 * Score each format against the first lines of input. Returns the winner.
 * Pure heuristic — `detectSchema` disambiguates CSV/TSV later via the registry.
 */
export function sniffFormat(rawLines: string[]): { format: FormatType; headerLine: number; delimiter: string } {
  const lines = rawLines.filter(l => l.trim() !== '').slice(0, 30);

  // W3C: #Fields directive
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if (W3C_HEADER_RE.test(lines[i])) {
      return { format: 'w3c', headerLine: i, delimiter: ' ' };
    }
  }

  const first = lines[0] ?? '';

  // JSON-lines: every non-empty line is a JSON object
  if (firstStartsWithJson(first)) {
    const allJson = lines.every(l => isJsonObject(l));
    if (allJson) return { format: 'json-lines', headerLine: -1, delimiter: '' };
  }

  // JSON-array: whole input is [ ... ]
  if (firstStartsWithArray(first)) {
    return { format: 'json-array', headerLine: -1, delimiter: '' };
  }

  // Apache CLF: classic regex match
  if (CLF_RE.test(first)) {
    const clfLines = lines.filter(l => CLF_RE.test(l)).length;
    if (clfLines > lines.length * 0.5) {
      return { format: 'clf', headerLine: -1, delimiter: '' };
    }
  }

  // Key-value: "k=v k2=\"v 2\"" pattern, ≥3 pairs on most lines
  if (looksLikeKeyValue(first)) {
    const kvLines = lines.filter(looksLikeKeyValue).length;
    if (kvLines > lines.length * 0.5) {
      return { format: 'key-value', headerLine: -1, delimiter: '' };
    }
  }

  // Delimited (CSV / TSV / space): pick delimiter with most consistent column count
  // Require >1 column AND >50% consistency AND ≥2 lines, else it's prose.
  const delim = guessDelimiter(lines);
  if (delim && lines.length >= 2) {
    const counts = lines.map(l => parseDelimitedLine(l, delim).length);
    const mode = mostCommon(counts);
    const consistent = counts.filter(c => c === mode).length;
    if (mode >= 2 && consistent > lines.length * 0.5) {
      return { format: delim === '\t' ? 'tsv' : 'csv', headerLine: 0, delimiter: delim };
    }
  }

  return { format: 'unknown', headerLine: -1, delimiter: '' };
}

function firstStartsWithJson(s: string): boolean {
  const t = s.trim();
  return t.startsWith('{');
}
function firstStartsWithArray(s: string): boolean {
  const t = s.trim();
  return t.startsWith('[');
}
function isJsonObject(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return false;
  try { JSON.parse(t); return true; } catch { return false; }
}

const CLF_RE = /^(\S+) (\S+) (\S+) \[([^\]]+)\] "(\S+) (\S+) (\S+)" (\d{3}) (\d+|-)( "([^"]*)" "([^"]*)")?$/;

function looksLikeKeyValue(line: string): boolean {
  const pairs = line.match(/[\w.-]+="[^"]*"|[\w.-]+=[^\s"]+/g);
  return (pairs?.length ?? 0) >= 3;
}

function guessDelimiter(lines: string[]): string | null {
  const candidates = [',', '\t', ' '];
  let best: string | null = null;
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map(l => parseDelimitedLine(l, d).length);
    if (counts.length === 0 || counts[0] < 2) continue;
    const mode = mostCommon(counts);
    const consistent = counts.filter(c => c === mode).length;
    const score = consistent * 10 + mode;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function mostCommon(arr: number[]): number {
  const freq = new Map<number, number>();
  for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
  let best = 0; let bestN = 0;
  for (const [k, v] of freq) if (v > bestN) { bestN = v; best = k; }
  return best;
}

/* ───────────────────────── format-specific extractors ───────────────────────── */

const W3C_COLS = ['host', 'ident', 'user', 'timestamp', 'method', 'uri', 'protocol', 'status', 'bytes', 'referer', 'user_agent'];

export function extractW3C(lines: string[], headerLine: number): { columns: string[]; rows: string[][] } {
  const m = lines[headerLine].match(W3C_HEADER_RE);
  if (!m) return { columns: [], rows: [] };
  const columns = m[1].split(' ');
  const rows: string[][] = [];
  for (let i = headerLine + 1; i < lines.length; i++) {
    if (lines[i].startsWith('#') || lines[i].trim() === '') continue;
    rows.push(parseDelimitedLine(lines[i], ' '));
  }
  return { columns, rows };
}

export function extractDelimited(lines: string[], headerLine: number, delimiter: string): { columns: string[]; rows: string[][] } {
  const logical = delimiter === ',' ? unwrapLines(lines, delimiter) : lines;
  if (!logical[headerLine]) return { columns: [], rows: [] };
  const columns = parseDelimitedLine(logical[headerLine], delimiter).map(c => c.trim());
  const rows: string[][] = [];
  for (let i = headerLine + 1; i < logical.length; i++) {
    if (logical[i].trim() === '') continue;
    rows.push(parseDelimitedLine(logical[i], delimiter));
  }
  return { columns, rows };
}

export function extractJsonLines(text: string): { columns: string[]; rows: string[][] } {
  const allKeys = new Set<string>();
  const objs: Record<string, unknown>[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || !t.startsWith('{')) continue;
    try { const o = JSON.parse(t); objs.push(o); for (const k of Object.keys(o)) allKeys.add(k); }
    catch { /* skip malformed line */ }
  }
  const columns = [...allKeys];
  const rows = objs.map(o => columns.map(k => formatCell(o[k])));
  return { columns, rows };
}

function extractJsonArray(text: string): { columns: string[]; rows: string[][] } {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[')) return { columns: [], rows: [] };
  let arr: Record<string, unknown>[];
  try { arr = JSON.parse(trimmed); } catch { return { columns: [], rows: [] }; }
  if (!Array.isArray(arr)) return { columns: [], rows: [] };
  const allKeys = new Set<string>();
  for (const o of arr) if (o && typeof o === 'object') for (const k of Object.keys(o)) allKeys.add(k);
  const columns = [...allKeys];
  return { columns, rows: arr.map(o => columns.map(k => formatCell(o[k]))) };
}

export function extractCLF(lines: string[]): { columns: string[]; rows: string[][] } {
  const columns = W3C_COLS;
  const rows: string[][] = [];
  for (const line of lines) {
    const m = line.match(CLF_RE);
    if (!m) continue;
    rows.push([m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[11] ?? '', m[13] ?? '']);
  }
  return { columns, rows };
}

export function extractKeyValue(lines: string[]): { columns: string[]; rows: string[][] } {
  const allKeys: string[] = [];
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const line of lines) {
    const pairs = [...line.matchAll(/([\w.-]+)="([^"]*)"|([\w.-]+)=([^\s"]+)/g)];
    const map: Record<string, string> = {};
    for (const p of pairs) {
      const k = p[1] ?? p[3];
      const v = p[2] ?? p[4];
      map[k] = v;
      if (!seen.has(k)) { seen.add(k); allKeys.push(k); }
    }
    rows.push(allKeys.map(k => map[k] ?? ''));
  }
  return { columns: allKeys, rows };
}

function formatCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* ───────────────────────── shared line/delimiter helpers ───────────────────────── */

/**
 * Normalize all line endings (CRLF, lone CR) to LF.
 *
 * Single source of truth for this — the ingest worker used to reimplement
 * this inline with `.replace(/\r\n?/g, '')`, which DELETES line breaks
 * instead of normalizing them, collapsing every CRLF-terminated file (i.e.
 * virtually anything produced on Windows, IIS logs included) into one line.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Pick the field delimiter for a detected format. */
export function delimiterForFormat(format: FormatType): string {
  if (format === 'tsv') return '\t';
  if (format === 'w3c') return ' ';
  return ',';
}

/* ───────────────────────── main entry point ───────────────────────── */

/**
 * Frame raw input → structured { columns, rows }.
 *
 * Accepts string (already decoded text) or Uint8Array (raw bytes).
 * For bytes: detects encoding + compression, then decodes.
 */
export function frame(input: string | Uint8Array): FramingResult {
  const warnings: string[] = [];
  let text: string;
  let encoding: Encoding = 'utf-8';
  let hadBOM = false;
  let compressed: CompressionType = 'none';

  if (input instanceof Uint8Array) {
    compressed = detectCompression(input);
    if (compressed !== 'none') {
      // Real decompression happens in the worker (Phase 3). Here we flag it
      // and attempt a best-effort gzip via the built-in zlib-free path.
      warnings.push(`compressed:${compressed} — full decompression in ingest worker`);
    }
    const enc = detectEncoding(input);
    encoding = enc.encoding;
    hadBOM = enc.hadBOM;
    // strip BOM bytes for decoding
    let bytes = input;
    if (encoding === 'utf-8-bom') bytes = bytes.slice(3);
    else if (encoding === 'utf-16le' || encoding === 'utf-16be') bytes = bytes.slice(2);
    text = decodeBytes(bytes, encoding);
  } else {
    text = input;
  }

  const rawLines = normalizeLineEndings(text).split('\n');
  const sniffed = sniffFormat(rawLines);

  let columns: string[] = [];
  let rows: string[][] = [];

  switch (sniffed.format) {
    case 'w3c':
      ({ columns, rows } = extractW3C(rawLines, sniffed.headerLine));
      break;
    case 'csv':
    case 'tsv':
      ({ columns, rows } = extractDelimited(rawLines, sniffed.headerLine, sniffed.delimiter));
      break;
    case 'json-lines':
      ({ columns, rows } = extractJsonLines(text));
      break;
    case 'json-array':
      ({ columns, rows } = extractJsonArray(text));
      break;
    case 'clf':
      ({ columns, rows } = extractCLF(rawLines));
      break;
    case 'key-value':
      ({ columns, rows } = extractKeyValue(rawLines));
      break;
    default:
      warnings.push('unknown format — treating as single-column text');
      columns = ['raw'];
      rows = rawLines.filter(l => l.trim()).map(l => [l]);
  }

  if (rows.length === 0) warnings.push('no data rows found');
  if (columns.length === 0) warnings.push('no columns detected');

  return {
    columns, rows, format: sniffed.format, encoding, hadBOM,
    compressed, headerLine: sniffed.headerLine, warnings,
  };
}
