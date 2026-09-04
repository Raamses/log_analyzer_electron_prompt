import { describe, it, expect } from 'vitest';
import { generateInsights } from '../insights';
import { parseQuery, filterRows } from '../query';
import type { Dataset } from '../types';

// Create a mock ColumnStore
const mockStore = (values: unknown[]) => ({
  get: (i: number) => values[i],
  getValue: (i: number) => typeof values[i] === 'number' ? values[i] as number : null,
  set: () => null,
  length: values.length,
  type: 'string' as const,
});

const makeDataset = (overrides: Partial<Dataset> = {}): Dataset => {
  const statusValues = Array.from({ length: 1000 }, (_, i) => i < 50 ? '500' : i < 100 ? '404' : '200');
  const uriValues = Array.from({ length: 1000 }, (_, i) => i < 300 ? '/api/search' : i < 600 ? '/api/details' : '/home');
  const ipValues = Array.from({ length: 1000 }, (_, i) => i < 400 ? '10.0.0.1' : `10.0.0.${(i % 254) + 1}`);
  const latencyValues = Array.from({ length: 1000 }, (_, i) => i < 300 ? String(5000 + i) : String(50 + i % 100));

  const stores = new Map();
  stores.set('ts', mockStore(Array.from({ length: 1000 }, (_, i) => String(1761488630000 + i))));
  stores.set('status', mockStore(statusValues));
  stores.set('uri', mockStore(uriValues));
  stores.set('ip', mockStore(ipValues));
  stores.set('latency', mockStore(latencyValues));

  return {
    columns: [
      { key: 'ts', sourceName: 'timestamp', label: 'Time', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
      { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 1, nullable: false, confidence: 1, derived: false },
      { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'url', index: 2, nullable: false, confidence: 1, derived: false },
      { key: 'ip', sourceName: 'client_ip', label: 'IP', role: 'client_ip', type: 'ip', index: 3, nullable: false, confidence: 1, derived: false },
      { key: 'latency', sourceName: 'latency', label: 'Latency', role: 'latency_ms', type: 'int', index: 4, nullable: false, confidence: 1, derived: false },
    ],
    stores: stores as any,
    rowCount: 1000,
    index: new Uint32Array(Array.from({ length: 1000 }, (_, i) => i)),
    schema: { format: 'test', label: 'Test', bindings: [], primary: {}, timezone: 'utc' },
    meta: { file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: 1000, skipped: 0, warnings: [], sampled: false, datasetId: 'test-1', alignmentKeys: [] },
    ...overrides,
  };
};

describe('generateInsights', () => {
  it('returns empty for small datasets', () => {
    const ds = makeDataset();
    ds.rowCount = 50;
    expect(generateInsights(ds)).toEqual([]);
  });

  it('detects high error rate', () => {
    const insights = generateInsights(makeDataset());
    const errorInsight = insights.find(i => i.id === 'high-error-rate');
    expect(errorInsight).toBeTruthy();
    expect(errorInsight?.severity).toBe('critical');
    expect(errorInsight?.detail).toContain('10.0%');
  });

  it('detects slow endpoints', () => {
    const insights = generateInsights(makeDataset());
    const slowInsight = insights.find(i => i.id === 'slow-endpoint');
    expect(slowInsight).toBeTruthy();
    expect(slowInsight?.detail).toContain('/api/search');
    expect(slowInsight?.detail).toContain('p95 =');
  });

  it('detects top talkers', () => {
    const insights = generateInsights(makeDataset());
    const talkerInsight = insights.find(i => i.id === 'top-talker');
    expect(talkerInsight).toBeTruthy();
    expect(talkerInsight?.detail).toContain('10.0.0.1');
  });

  it('includes evidence query for each insight', () => {
    const insights = generateInsights(makeDataset());
    for (const insight of insights) {
      expect(insight.evidenceQuery).toBeTruthy();
      expect(typeof insight.evidenceQuery).toBe('string');
    }
  });

  it('returns empty when no roles match', () => {
    const ds = makeDataset();
    ds.columns = [
      { key: 'col1', sourceName: 'col1', label: 'Col1', role: 'unknown', type: 'string', index: 0, nullable: false, confidence: 0.5, derived: false },
    ];
    const stores = new Map();
    stores.set('col1', mockStore(Array(1000).fill('value')));
    ds.stores = stores as any;
    expect(generateInsights(ds)).toEqual([]);
  });

  it('every evidenceQuery actually reproduces rows when run through the real query engine', () => {
    // The insights design doc requires every insight be "falsifiable and
    // traceable" — the evidenceQuery isn't decorative, it must really work.
    const ds = makeDataset();
    for (const insight of generateInsights(ds)) {
      if (!insight.evidenceQuery) continue; // some insights can't be expressed (see empty-value note in insights.ts)
      const parsed = parseQuery(insight.evidenceQuery);
      expect(parsed.errors, `"${insight.evidenceQuery}" failed to parse: ${parsed.errors.join(', ')}`).toEqual([]);
      const matched = filterRows(ds, parsed.where);
      expect(matched.length, `"${insight.evidenceQuery}" matched 0 rows for insight "${insight.id}"`).toBeGreaterThan(0);
    }
  });
});

/* ───────────────────────── time-series fixtures (rolling-baseline detectors) ───────────────────────── */

interface RowSpec {
  tsOffsetMs: number;
  status?: number;
  ip?: string;
  uri?: string;
  latency?: number;
  ua?: string;
}

function makeTimeSeriesDataset(rows: RowSpec[]): Dataset {
  const rowCount = rows.length;
  const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0); // fixed epoch, not "now" — reproducible bucket math
  const stores = new Map();
  stores.set('ts', mockStore(rows.map(r => String(baseMs + r.tsOffsetMs))));
  stores.set('status', mockStore(rows.map(r => String(r.status ?? 200))));
  stores.set('ip', mockStore(rows.map(r => r.ip ?? '10.0.0.1')));
  stores.set('uri', mockStore(rows.map(r => r.uri ?? '/api/x')));
  stores.set('latency', mockStore(rows.map(r => String(r.latency ?? 100))));
  stores.set('ua', mockStore(rows.map(r => r.ua ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')));

  return {
    columns: [
      { key: 'ts', sourceName: 'timestamp', label: 'Time', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
      { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 1, nullable: false, confidence: 1, derived: false },
      { key: 'ip', sourceName: 'client_ip', label: 'IP', role: 'client_ip', type: 'ip', index: 2, nullable: false, confidence: 1, derived: false },
      { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'url', index: 3, nullable: false, confidence: 1, derived: false },
      { key: 'latency', sourceName: 'latency', label: 'Latency', role: 'latency_ms', type: 'int', index: 4, nullable: false, confidence: 1, derived: false },
      { key: 'ua', sourceName: 'user_agent', label: 'UA', role: 'user_agent', type: 'string', index: 5, nullable: true, confidence: 1, derived: false },
    ],
    stores: stores as any,
    rowCount,
    index: new Uint32Array(Array.from({ length: rowCount }, (_, i) => i)),
    schema: { format: 'test', label: 'Test', bindings: [], primary: { timestamp: 'ts' }, timezone: 'utc' },
    meta: { file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: rowCount, skipped: 0, warnings: [], sampled: false, datasetId: 'test-ts', alignmentKeys: [] },
  };
}

/** 24 five-minute buckets (2h span, matching detectRateSpike's default numBuckets),
 *  N rows each, all baseline except one bucket built by `spikeRow`. */
function makeBucketedDataset(
  spikeBucket: number,
  rowsPerBucket: number,
  // Callers set row CONTENT only — tsOffsetMs is computed and injected below,
  // by bucket position, not by the caller.
  baselineRow: (j: number) => Omit<RowSpec, 'tsOffsetMs'>,
  spikeRow: (j: number) => Omit<RowSpec, 'tsOffsetMs'>,
): Dataset {
  const bucketSpanMs = 300_000; // 5 min
  const rows: RowSpec[] = [];
  for (let b = 0; b < 24; b++) {
    for (let j = 0; j < rowsPerBucket; j++) {
      const t = b * bucketSpanMs + Math.floor((j / rowsPerBucket) * bucketSpanMs);
      const spec = b === spikeBucket ? spikeRow(j) : baselineRow(j);
      rows.push({ ...spec, tsOffsetMs: t });
    }
  }
  return makeTimeSeriesDataset(rows);
}

describe('generateInsights — error rate spike vs rolling baseline', () => {
  it('flags a localized spike bucket, not the flat overall rate', () => {
    const ds = makeBucketedDataset(
      12, 50,
      (j) => ({ status: j < 1 ? 500 : 200 }),   // baseline: 2% errors
      (j) => ({ status: j < 45 ? 500 : 200 }),  // spike bucket: 90% errors
    );
    const insights = generateInsights(ds);
    const spike = insights.find(i => i.id === 'error-rate-spike');
    expect(spike).toBeTruthy();
    expect(spike?.detail).toContain('90.0%');
    expect(spike?.n).toBe(45);
  });

  it('does not fire when the error rate is uniform (no localized spike)', () => {
    const ds = makeBucketedDataset(
      12, 50,
      (j) => ({ status: j < 5 ? 500 : 200 }),
      (j) => ({ status: j < 5 ? 500 : 200 }), // "spike" bucket is identical to baseline
    );
    const insights = generateInsights(ds);
    expect(insights.find(i => i.id === 'error-rate-spike')).toBeFalsy();
  });
});

describe('generateInsights — sudden 404 cluster', () => {
  it('flags a bucket dominated by 404s specifically', () => {
    const ds = makeBucketedDataset(
      8, 50,
      (j) => ({ status: j < 1 ? 404 : 200 }),
      (j) => ({ status: j < 40 ? 404 : 200 }),
    );
    const insights = generateInsights(ds);
    const cluster = insights.find(i => i.id === '404-cluster');
    expect(cluster).toBeTruthy();
    expect(cluster?.n).toBe(40);
  });

  it('does not fire for a 5xx spike (that is error-rate-spike\'s job, not 404-cluster\'s)', () => {
    const ds = makeBucketedDataset(
      8, 50,
      (j) => ({ status: j < 1 ? 500 : 200 }),
      (j) => ({ status: j < 40 ? 500 : 200 }),
    );
    const insights = generateInsights(ds);
    expect(insights.find(i => i.id === '404-cluster')).toBeFalsy();
    expect(insights.find(i => i.id === 'error-rate-spike')).toBeTruthy();
  });
});

describe('generateInsights — latency regression by endpoint', () => {
  it('flags an endpoint whose p95 rose between the first and second half', () => {
    const rows: RowSpec[] = [];
    for (let i = 0; i < 500; i++) rows.push({ tsOffsetMs: i, uri: '/api/search', latency: 50 + (i % 10) });
    for (let i = 500; i < 1000; i++) rows.push({ tsOffsetMs: i, uri: '/api/search', latency: 800 + (i % 10) });
    // Control endpoint: consistently fast throughout — must NOT be flagged.
    for (let i = 0; i < 1000; i++) rows.push({ tsOffsetMs: i, uri: '/api/stable', latency: 40 + (i % 5) });

    const ds = makeTimeSeriesDataset(rows);
    const insights = generateInsights(ds);
    const regression = insights.find(i => i.id === 'latency-regression');
    expect(regression).toBeTruthy();
    expect(regression?.detail).toContain('/api/search');
    expect(regression?.detail).not.toContain('/api/stable');
  });
});

describe('generateInsights — off-hours traffic concentrated in one IP', () => {
  it('flags a quiet hour dominated by a single IP', () => {
    const rows: RowSpec[] = [];
    const hourMs = 3_600_000;
    // Busy hours 8-18: many different IPs, healthy diversity.
    for (let h = 8; h < 18; h++) {
      for (let i = 0; i < 100; i++) {
        rows.push({ tsOffsetMs: h * hourMs + i * 30_000, ip: `10.0.${h}.${i % 50}` });
      }
    }
    // Quiet hour 3: only 15 requests, 14 of them from one IP.
    for (let i = 0; i < 15; i++) {
      rows.push({ tsOffsetMs: 3 * hourMs + i * 100_000, ip: i < 14 ? '203.0.113.9' : '203.0.113.10' });
    }
    const ds = makeTimeSeriesDataset(rows);
    const insights = generateInsights(ds);
    const offHours = insights.find(i => i.id === 'off-hours-concentration');
    expect(offHours).toBeTruthy();
    expect(offHours?.detail).toContain('203.0.113.9');
    expect(offHours?.detail).toContain('03:00');
  });
});

describe('generateInsights — repeated failures from one IP', () => {
  it('flags an IP with high volume AND mostly non-2xx (brute-force shape)', () => {
    const rows: RowSpec[] = [];
    for (let i = 0; i < 30; i++) rows.push({ tsOffsetMs: i * 1000, ip: '198.51.100.7', status: i < 27 ? 401 : 200 });
    // High-volume but healthy IP — must not be flagged as repeated-failures (it's top-talker's job).
    for (let i = 0; i < 200; i++) rows.push({ tsOffsetMs: i * 1000, ip: '10.0.0.1', status: 200 });
    const ds = makeTimeSeriesDataset(rows);
    const insights = generateInsights(ds);
    const repeated = insights.find(i => i.id === 'repeated-failures-ip');
    expect(repeated).toBeTruthy();
    expect(repeated?.detail).toContain('198.51.100.7');
    expect(repeated?.detail).not.toContain('10.0.0.1 made');
  });
});

describe('generateInsights — suspicious request paths', () => {
  it('flags known probe/attack path signatures', () => {
    const rows: RowSpec[] = [];
    for (let i = 0; i < 200; i++) rows.push({ tsOffsetMs: i * 1000, uri: '/api/search' });
    for (let i = 0; i < 12; i++) rows.push({ tsOffsetMs: i * 1000, uri: '/.env' });
    for (let i = 0; i < 3; i++) rows.push({ tsOffsetMs: i * 1000, uri: '/wp-login.php' });
    const ds = makeTimeSeriesDataset(rows);
    const insights = generateInsights(ds);
    const paths = insights.filter(i => i.id === 'suspicious-path');
    expect(paths.some(p => p.detail.includes('.env'))).toBe(true);
    expect(paths.some(p => p.detail.includes('WordPress'))).toBe(true);
  });

  it('does not flag ordinary traffic', () => {
    const rows: RowSpec[] = Array.from({ length: 200 }, (_, i) => ({ tsOffsetMs: i * 1000, uri: '/api/search' }));
    const ds = makeTimeSeriesDataset(rows);
    expect(generateInsights(ds).find(i => i.id === 'suspicious-path')).toBeFalsy();
  });
});

describe('generateInsights — scanner/tool User-Agent', () => {
  it('flags known scanner signatures', () => {
    const rows: RowSpec[] = [];
    for (let i = 0; i < 200; i++) rows.push({ tsOffsetMs: i * 1000 });
    for (let i = 0; i < 5; i++) rows.push({ tsOffsetMs: i * 1000, ua: 'sqlmap/1.7#stable' });
    const ds = makeTimeSeriesDataset(rows);
    const insights = generateInsights(ds);
    const scanner = insights.find(i => i.id === 'scanner-user-agent');
    expect(scanner).toBeTruthy();
    expect(scanner?.detail).toContain('sqlmap');
  });

  it('does not flag ordinary browser User-Agents', () => {
    const rows: RowSpec[] = Array.from({ length: 200 }, (_, i) => ({ tsOffsetMs: i * 1000 }));
    const ds = makeTimeSeriesDataset(rows);
    expect(generateInsights(ds).find(i => i.id === 'scanner-user-agent')).toBeFalsy();
  });
});
