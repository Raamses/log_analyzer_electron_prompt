import { describe, it, expect } from 'vitest';
import { generateInsights } from '../insights';
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
});
