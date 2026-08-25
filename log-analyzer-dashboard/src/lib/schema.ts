// @paths lib/schema
/**
 * Schema registry — the heart of the generic parser.
 *
 * Adding a format = adding one entry here. No parser surgery.
 *
 * Each entry declares how source column names map to canonical roles,
 * including precedence (when multiple columns want the same role),
 * multi-value handling, and value transforms. The registry produces
 * ColumnDef[] + Schema from raw column headers — pure functions, no IO.
 *
 * Existing behaviour from parser.ts is preserved exactly:
 *   - IIS: XFF priority over c-ip; cs-uri-stem + cs-uri-query concat; ms latency
 *   - Azure APGW: seconds latency → ms; ClientIp; single timestamp
 */

import type {
  Role, CellType, TimeZoneDecl, RoleBinding, Schema, ColumnDef, TransformId,
} from '../types';

export interface SchemaEntry {
  id: string;
  label: string;
  /** Which columns must be present (any) for this schema to match. */
  match?: { anyColumn?: string[]; allColumns?: string[]; };
  /** Declared timezone for timestamps in this format. */
  timezone: TimeZoneDecl;
  /** Source column name → role binding spec. The LAST spec for a role wins
   *  unless `priority` is set — then highest priority wins. */
  bindings: Partial<Record<string, {
    role: Role;
    type: CellType;
    priority?: number;
    multiplicity?: 'single' | 'list';
    splitter?: string;           // string form of RegExp; undefined = no split
    transform?: TransformId;
    unit?: 'ms' | 's' | 'us' | 'bytes';
    nullable?: boolean;
  }>>;
}

const ms = (v: string) => parseFloat(v) * 1000;
const sec = (v: string) => parseFloat(v);

export const SCHEMA_REGISTRY: SchemaEntry[] = [
  // ---------- IIS W3C Extended ----------
  {
    id: 'iis-w3c',
    label: 'IIS W3C Extended',
    timezone: 'utc',
    match: { anyColumn: ['#Fields:', 'sc-status', 'cs-uri-stem'] },
    bindings: {
      date:            { role: 'timestamp', type: 'date' },
      time:            { role: 'timestamp', type: 'date' },
      'cs-uri-stem':   { role: 'uri',       type: 'url' },
      'cs-uri-query':  { role: 'query',     type: 'string' },
      'sc-status':     { role: 'status',    type: 'int' },
      'time-taken':    { role: 'latency_ms', type: 'int', unit: 'ms' },
      'c-ip':          { role: 'client_ip', type: 'ip', priority: 0 },
      'X-Forwarded-For': { role: 'client_ip', type: 'ip', priority: 10,
                           multiplicity: 'list', splitter: '\\s*,\\s*',
                           transform: 'xff_first' },
      'cs-method':     { role: 'method',    type: 'string', priority: 10 },
      'method':        { role: 'method',    type: 'string', priority: 0 },
      'cs(User-Agent)': { role: 'user_agent', type: 'string' },
      'sc-bytes':      { role: 'bytes_out', type: 'int' },
      'cs-bytes':      { role: 'bytes_in',  type: 'int' },
      'cs-host':       { role: 'host',      type: 'string' },
      'cs(Referer)':   { role: 'referrer',  type: 'url' },
      'cs-version':    { role: 'protocol',  type: 'string' },
    },
  },

  // ---------- Azure Application Gateway ----------
  {
    id: 'azure-apgw',
    label: 'Azure Application Gateway',
    timezone: 'utc',
    match: { anyColumn: ['TimeGenerated [UTC]', 'RequestUri', 'HttpStatus'] },
    bindings: {
      'TimeGenerated [UTC]': { role: 'timestamp',  type: 'date' },
      HttpStatus:            { role: 'status',     type: 'int' },
      RequestUri:            { role: 'uri',        type: 'url' },
      ClientIp:              { role: 'client_ip',  type: 'ip' },
      TimeTaken:             { role: 'latency_ms', type: 'number', unit: 's' },
      HttpMethod:            { role: 'method',     type: 'string', priority: 10 },
      HttpMethod_s:          { role: 'method',     type: 'string', priority: 5 },
      UserAgent:             { role: 'user_agent', type: 'string', priority: 10 },
      userAgent_s:           { role: 'user_agent', type: 'string', priority: 5 },
      ResponseBytes:         { role: 'bytes_out',  type: 'int', priority: 10 },
      ReceivedBytes:         { role: 'bytes_in',   type: 'int', priority: 10 },
      Host:                  { role: 'host',       type: 'string' },
      OriginalRequestUriWithArgs: { role: 'uri',   type: 'url', priority: 0 },
      ErrorInfo:             { role: 'category',   type: 'string' },
      WafEvaluationTime:     { role: 'waf_action', type: 'string' },
    },
  },

  // ---------- Cloudflare Logpush (ndjson, Enterprise) ----------
  // Three status columns — primary = EdgeResponseStatus; UI lets user pick.
  {
    id: 'cloudflare-http',
    label: 'Cloudflare HTTP Requests',
    timezone: 'utc',
    match: { anyColumn: ['EdgeStartTimestamp', 'EdgeResponseStatus', 'ClientIP'] },
    bindings: {
      EdgeStartTimestamp:    { role: 'timestamp',   type: 'date' },
      EdgeResponseStatus:    { role: 'status',      type: 'int', priority: 10 },
      OriginResponseStatus:  { role: 'status',      type: 'int', priority: 5 },
      CacheResponseStatus:   { role: 'status',      type: 'int', priority: 0 },
      ClientIP:              { role: 'client_ip',   type: 'ip' },
      ClientRequestMethod:   { role: 'method',      type: 'string' },
      ClientRequestURI:      { role: 'uri',         type: 'url' },
      ClientRequestHost:     { role: 'host',        type: 'string' },
      ClientRequestUserAgent: { role: 'user_agent', type: 'string' },
      EdgeResponseBytes:     { role: 'bytes_out',   type: 'int' },
      EdgeTimeToFirstByteMs: { role: 'latency_ms',  type: 'int', unit: 'ms' },
      CacheCacheStatus:      { role: 'cache_status', type: 'string' },
      ClientCountry:         { role: 'country',     type: 'string' },
      RayID:                 { role: 'request_id',  type: 'string' },
      WAFAction:             { role: 'waf_action',  type: 'string' },
      EdgeColoCode:          { role: 'edge_location', type: 'string' },
      ClientRequestReferer:  { role: 'referrer',    type: 'url' },
    },
  },

  // ---------- Apache Combined Log Format ----------
  // Positional (no header) — applied by regex in dialect layer, names here.
  {
    id: 'apache-combined',
    label: 'Apache Combined',
    timezone: 'utc',
    bindings: {
      // positional: the dialect layer names these before lookup
      _host:     { role: 'client_ip',  type: 'ip' },
      _ident:    { role: 'unknown',    type: 'string' },
      _user:     { role: 'unknown',    type: 'string' },
      _timestamp:{ role: 'timestamp',  type: 'date' },
      _method:   { role: 'method',     type: 'string' },
      _uri:      { role: 'uri',        type: 'url' },
      _protocol: { role: 'protocol',   type: 'string' },
      _status:   { role: 'status',     type: 'int' },
      _bytes:    { role: 'bytes_out',  type: 'int' },
      _referer:  { role: 'referrer',   type: 'url' },
      _agent:    { role: 'user_agent', type: 'string' },
    },
  },
];

/** Find the best-matching schema for a set of raw column names. */
export function detectSchema(columns: string[]): SchemaEntry | null {
  let best: SchemaEntry | null = null;
  let bestScore = 0;
  for (const entry of SCHEMA_REGISTRY) {
    if (!entry.match) continue;
    let score = 0;
    if (entry.match.allColumns) {
      if (!entry.match.allColumns.every(c => columns.includes(c))) continue;
      score = entry.match.allColumns.length * 10;
    }
    if (entry.match.anyColumn) {
      score = entry.match.anyColumn.filter(c => columns.includes(c)).length;
    }
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return best;
}

/** Apply a schema entry to raw column headers → { columns, schema }. */
export function applySchema(entry: SchemaEntry, rawColumns: string[]): {
  columns: ColumnDef[];
  schema: Schema;
} {
  const bindings: RoleBinding[] = [];
  const primary: Partial<Record<Role, string>> = {};
  const columns: ColumnDef[] = [];
  const seen = new Map<string, number>();  // sourceName -> dup count

  rawColumns.forEach((sourceName, index) => {
    const spec = entry.bindings[sourceName];
    if (!spec) return;

    // handle duplicates: key = sourceName + `_${n}`
    const dup = seen.get(sourceName) ?? 0;
    seen.set(sourceName, dup + 1);
    const key = dup === 0 ? slugify(sourceName) : `${slugify(sourceName)}_${dup + 1}`;

    columns.push({
      key, sourceName, label: humanize(sourceName),
      role: spec.role, type: spec.type, index,
      nullable: spec.nullable ?? false,
      confidence: spec.priority !== undefined ? 0.95 : 0.7,
      derived: false,
    });

    bindings.push({
      role: spec.role, columnKey: key,
      priority: spec.priority ?? 0,
      multiplicity: spec.multiplicity ?? 'single',
      splitter: spec.splitter ? new RegExp(spec.splitter) : undefined,
      transform: spec.transform,
      unit: spec.unit,
    });

    // highest priority wins per role
    const cur = primary[spec.role];
    if (cur === undefined) {
      primary[spec.role] = key;
    } else {
      const curBind = bindings.find(b => b.columnKey === cur);
      if (curBind && (spec.priority ?? 0) > curBind.priority) {
        primary[spec.role] = key;
      }
    }
  });

  return { columns, schema: {
    format: entry.id, label: entry.label,
    bindings, primary, timezone: entry.timezone,
  }};
}

/** Fallback: infer a schema from column names + a value sample.
 *
 * Phase 6 plan §3.10: promote value-based inference so unknown-name columns
 * can still get real roles from a value sample. Name-based inference stays
 * first (fast, header-explicit); value-sampling only fires when the name
 * gives `unknown`.
 */
export function inferSchema(rawColumns: string[], sampleRows?: string[][]): SchemaEntry {
  const bindings: SchemaEntry['bindings'] = {};
  for (const c of rawColumns) {
    let role = inferRole(c);
    // Value-based promotion: sample the first N rows, score the column.
    if (role === 'unknown' && sampleRows && sampleRows.length > 0) {
      role = inferRoleFromValues(c, rawColumns, sampleRows);
    }
    bindings[c] = { role, type: roleToCellType(role) };
  }

  return {
    id: 'generic-inferred',
    label: 'Generic (inferred)',
    timezone: 'utc',
    bindings,
  };
}

function roleToCellType(role: Role): CellType {
  switch (role) {
    case 'timestamp': return 'date';
    case 'status': return 'int';
    case 'latency_ms': return 'int';
    case 'client_ip': return 'ip';
    case 'method': return 'string';
    case 'uri': return 'url';
    case 'bytes_out':
    case 'bytes_in': return 'int';
    case 'user_agent': return 'string';
    case 'host': return 'string';
    case 'referrer': return 'url';
    case 'protocol': return 'string';
    case 'country': return 'string';
    default: return 'string';
  }
}

/**
 * Sample a column's values and score candidate roles. Threshold: 0.8 match
 * ratio (per Phase 6 plan). A wrong guess is worse than staying `unknown`,
 * so we only rebind when confident.
 */
function inferRoleFromValues(
  colName: string,
  rawColumns: string[],
  sampleRows: string[][],
): Role {
  const colIdx = rawColumns.indexOf(colName);
  if (colIdx < 0) return 'unknown';

  const samples = sampleRows.map(r => r[colIdx] ?? '').filter(v => v !== '');

  if (samples.length === 0) return 'unknown';

  const scores: { role: Role; hits: number }[] = [];
  const total = samples.length;

  // status: integer, 100-598, low cardinality
  let statusHits = 0;
  const statusSeen = new Set<string>();
  for (const s of samples) {
    const n = Number(s);
    if (!isNaN(n) && n >= 100 && n <= 598 && /^\d+$/.test(s)) {
      statusHits++;
      statusSeen.add(s);
    }
  }
  if (statusHits / total >= 0.8 && statusSeen.size <= 30) scores.push({ role: 'status', hits: statusHits });

  // timestamp: ISO 8601 / epoch parses in >90% of samples
  let tsHits = 0;
  for (const s of samples) {
    if (/^\d{10,13}$/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s) || /\d{2}\/\w{3}\/\d{4}/.test(s)) tsHits++;
  }
  if (tsHits / total >= 0.8) scores.push({ role: 'timestamp', hits: tsHits });

  // client_ip: IPv4 regex matches >90%
  let ipHits = 0;
  for (const s of samples) {
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(s)) ipHits++;
  }
  if (ipHits / total >= 0.8) scores.push({ role: 'client_ip', hits: ipHits });

  // method: <=10 distinct, all HTTP verbs
  const methods = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']);
  let methodHits = 0;
  const methodSeen = new Set<string>();
  for (const s of samples) {
    if (methods.has(s.toUpperCase())) {
      methodHits++;
      methodSeen.add(s.toUpperCase());
    }
  }
  if (methodHits / total >= 0.8 && methodSeen.size <= 10) scores.push({ role: 'method', hits: methodHits });

  // uri: starts with /, high cardinality
  let uriHits = 0;
  for (const s of samples) {
    if (s.startsWith('/')) uriHits++;
  }
  if (uriHits / total >= 0.8) scores.push({ role: 'uri', hits: uriHits });

  // latency_ms: numeric, non-negative, header contains time/duration/latency/elapsed
  let latHits = 0;
  for (const s of samples) {
    const n = Number(s);
    if (!isNaN(n) && n >= 0 && n <= 1e9) latHits++;
  }
  if (latHits / total >= 0.8 && /time|duration|latency|elapsed/i.test(colName)) {
    scores.push({ role: 'latency_ms', hits: latHits });
  }

  scores.sort((a, b) => b.hits - a.hits);
  return scores.length > 0 ? scores[0].role : 'unknown';
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanize(s: string): string {
  return s
    .replace(/^#?/, '')
    .replace(/[-_\s]+([a-z])/g, (_, l) => ` ${l.toUpperCase()}`)
    .replace(/^./, c => c.toUpperCase())
    .replace(/\bcs\b/g, 'CS')
    .replace(/\bsc\b/g, 'SC')
    .replace(/\bip\b/g, 'IP')
    .replace(/\bua\b/g, 'UA');
}

/** Best-effort role inference from a column name. */
function inferRole(name: string): Role {
  const l = name.toLowerCase();
  if (/time|date|timestamp/.test(l)) return 'timestamp';
  if (/status|http/.test(l)) return 'status';
  if (/latency|duration|took|taken|time_ms/.test(l)) return 'latency_ms';
  if (/ip|clientip|client-ip|xff|forwarded/.test(l)) return 'client_ip';
  if (/method|verb/.test(l)) return 'method';
  if (/uri|url|path|request-uri/.test(l)) return 'uri';
  if (/agent|user-agent/.test(l)) return 'user_agent';
  if (/bytes|size|length/.test(l)) return 'bytes_out';
  if (/host|server_name/.test(l)) return 'host';
  if (/referer|referrer/.test(l)) return 'referrer';
  if (/cache/.test(l)) return 'cache_status';
  if (/country/.test(l)) return 'country';
  return 'unknown';
}
