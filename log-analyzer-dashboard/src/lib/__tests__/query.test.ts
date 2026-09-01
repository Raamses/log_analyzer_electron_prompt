import { describe, it, expect } from 'vitest';
import { parseQuery, filterRows } from '../query';
import type { ColumnDef, Dataset } from '../types';

const cols: ColumnDef[] = [
  { key: 'status', sourceName: 'HttpStatus', label: 'Status', role: 'status', type: 'int', index: 0, nullable: false, confidence: 1, derived: false },
  { key: 'uri', sourceName: 'RequestUri', label: 'URI', role: 'uri', type: 'url', index: 1, nullable: false, confidence: 1, derived: false },
  { key: 'method', sourceName: 'Method', label: 'Method', role: 'method', type: 'string', index: 2, nullable: false, confidence: 1, derived: false },
  { key: 'ip', sourceName: 'ClientIp', label: 'IP', role: 'client_ip', type: 'ip', index: 3, nullable: false, confidence: 1, derived: false },
  { key: 'latency', sourceName: 'TimeTaken', label: 'Latency', role: 'latency_ms', type: 'int', index: 4, nullable: false, confidence: 1, derived: false },
];

// Helper to build a Dataset from row objects
const makeDataset = (rowObjs: Record<string, unknown>[]): Dataset => {
  const stores = new Map();
  for (const col of cols) {
    const values = rowObjs.map(r => r[col.key] ?? null);
    stores.set(col.key, {
      get: (i: number) => values[i],
    });
  }
  return {
    columns: cols,
    stores: stores as any,
    rowCount: rowObjs.length,
    index: new Uint32Array(rowObjs.map((_, i) => i)),
    schema: { format: 'test', label: 'Test', bindings: [], primary: {}, timezone: 'utc' },
    meta: { file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: rowObjs.length, skipped: 0, warnings: [], sampled: false, datasetId: 'test-1', alignmentKeys: [] },
  };
};

const rows = makeDataset([
  { status: '200', uri: '/api/search', method: 'GET', ip: '10.0.0.1', latency: '50' },
  { status: '404', uri: '/api/missing', method: 'GET', ip: '10.0.0.2', latency: '10' },
  { status: '500', uri: '/api/error', method: 'POST', ip: '10.0.0.3', latency: '5000' },
  { status: '200', uri: '/home', method: 'GET', ip: '10.0.0.4', latency: '100' },
]);

describe('parseQuery', () => {
  it('returns null for empty input', () => {
    expect(parseQuery('')).toEqual({ where: null, sort: null, errors: [] });
  });

  it('parses simple comparison', () => {
    const r = parseQuery('status >= 500');
    expect(r.errors).toEqual([]);
    expect(r.where).toEqual({ type: 'comparison', field: 'status', op: '>=', value: 500 });
  });

  it('parses string comparison', () => {
    const r = parseQuery('method = GET');
    expect(r.where).toEqual({ type: 'comparison', field: 'method', op: '=', value: 'GET' });
  });

  it('parses AND', () => {
    const r = parseQuery('status >= 400 AND method = GET');
    expect(r.where?.type).toBe('and');
  });

  it('parses OR', () => {
    const r = parseQuery('status = 404 OR status = 500');
    expect(r.where?.type).toBe('or');
  });

  it('parses NOT', () => {
    const r = parseQuery('NOT status = 200');
    expect(r.where?.type).toBe('not');
  });

  it('parses contains', () => {
    const r = parseQuery('uri contains "/api/"');
    expect(r.where).toEqual({ type: 'comparison', field: 'uri', op: 'contains', value: '/api/' });
  });

  it('parses IN list', () => {
    const r = parseQuery('status in (404, 500)');
    expect(r.where).toEqual({ type: 'comparison', field: 'status', op: 'in', value: [404, 500] });
  });

  it('parses sort clause', () => {
    const r = parseQuery('status >= 500 | sort by latency desc');
    expect(r.sort).toEqual({ field: 'latency', direction: 'desc' });
  });

  it('parses bracket-quoted field names', () => {
    const r = parseQuery("['HttpStatus'] >= 500");
    expect(r.where).toEqual({ type: 'comparison', field: 'HttpStatus', op: '>=', value: 500 });
  });

  it('reports errors for invalid syntax', () => {
    const r = parseQuery('status >=');
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('filterRows', () => {
  it('returns all rows for null expr', () => {
    expect(filterRows(rows, null)).toEqual([0, 1, 2, 3]);
  });

  it('filters by status >= 500', () => {
    const q = parseQuery('status >= 500');
    expect(filterRows(rows, q.where)).toEqual([2]);
  });

  it('filters by method = GET', () => {
    const q = parseQuery('method = GET');
    expect(filterRows(rows, q.where)).toEqual([0, 1, 3]);
  });

  it('filters by uri contains', () => {
    const q = parseQuery('uri contains "/api/"');
    expect(filterRows(rows, q.where)).toEqual([0, 1, 2]);
  });

  it('filters by AND', () => {
    const q = parseQuery('status >= 400 AND method = GET');
    expect(filterRows(rows, q.where)).toEqual([1]);
  });

  it('filters by OR', () => {
    const q = parseQuery('status = 404 OR status = 500');
    expect(filterRows(rows, q.where)).toEqual([1, 2]);
  });

  it('filters by NOT', () => {
    const q = parseQuery('NOT status = 200');
    expect(filterRows(rows, q.where)).toEqual([1, 2]);
  });

  it('filters by IN', () => {
    const q = parseQuery('status in (404, 500)');
    expect(filterRows(rows, q.where)).toEqual([1, 2]);
  });

  it('filters by bare term (free text)', () => {
    const q = parseQuery('api');
    expect(filterRows(rows, q.where)).toEqual([0, 1, 2]);
  });

  it('is case-insensitive', () => {
    const q = parseQuery('METHOD = get');
    expect(filterRows(rows, q.where)).toEqual([0, 1, 3]);
  });
});

describe('filterRows — user_agent and timestamp role aliases', () => {
  const uaCols: ColumnDef[] = [
    { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 0, nullable: false, confidence: 1, derived: false },
    { key: 'cs-user-agent', sourceName: 'cs(User-Agent)', label: 'CS User Agent', role: 'user_agent', type: 'string', index: 1, nullable: true, confidence: 1, derived: false },
  ];
  const uaDataset: Dataset = {
    columns: uaCols,
    stores: (() => {
      const s = new Map();
      s.set('status', { get: (i: number) => ['200', '500'][i] });
      s.set('cs-user-agent', { get: (i: number) => ['Mozilla/5.0', 'sqlmap/1.7'][i] });
      return s;
    })() as any,
    rowCount: 2,
    index: new Uint32Array([0, 1]),
    schema: { format: 'test', label: 'Test', bindings: [], primary: {}, timezone: 'utc' },
    meta: { file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: 2, skipped: 0, warnings: [], sampled: false, datasetId: 'test-1', alignmentKeys: [] },
  };

  it('resolves "user_agent" to a role-mapped column with a non-canonical key (e.g. IIS cs-user-agent)', () => {
    const q = parseQuery('user_agent contains "sqlmap"');
    expect(filterRows(uaDataset, q.where)).toEqual([1]);
  });

  // Split date+time timestamp (IIS W3C shape): two columns share role 'timestamp',
  // only the one named in schema.primary.timestamp holds a real combined value.
  const splitTsCols: ColumnDef[] = [
    { key: 'date', sourceName: 'date', label: 'Date', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 0.7, derived: false },
    { key: 'time', sourceName: 'time', label: 'Time', role: 'timestamp', type: 'date', index: 1, nullable: false, confidence: 0.7, derived: false },
  ];
  const splitTsDataset: Dataset = {
    columns: splitTsCols,
    stores: (() => {
      const s = new Map();
      s.set('date', { get: (i: number) => [1700000000000, 1800000000000][i] }); // combined, real values
      s.set('time', { get: () => '' }); // the non-primary sibling — always empty per normalize.ts
      return s;
    })() as any,
    rowCount: 2,
    index: new Uint32Array([0, 1]),
    schema: { format: 'iis-w3c', label: 'IIS', bindings: [], primary: { timestamp: 'date' }, timezone: 'utc' },
    meta: { file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: 2, skipped: 0, warnings: [], sampled: false, datasetId: 'test-1', alignmentKeys: [] },
  };

  it('resolves "timestamp" to the PRIMARY timestamp column, not just any timestamp-role column', () => {
    const q = parseQuery('timestamp >= 1750000000000');
    expect(filterRows(splitTsDataset, q.where)).toEqual([1]);
  });

  it('does not alias "timestamp" at all when schema.primary.timestamp is unset (no silent wrong guess)', () => {
    const dsNoPrimary: Dataset = { ...splitTsDataset, schema: { ...splitTsDataset.schema, primary: {} } };
    const q = parseQuery('timestamp >= 1750000000000');
    // Neither split column's own key/sourceName is literally "timestamp", so this
    // must resolve to nothing (query.ts returns true — "can't filter" — for an
    // unresolvable field, matching everything, not silently picking a column).
    expect(filterRows(dsNoPrimary, q.where)).toEqual([0, 1]);
  });
});
