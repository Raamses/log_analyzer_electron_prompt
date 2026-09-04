// @paths lib/__tests__/merge-datasets.test.ts
import { describe, it, expect } from 'vitest';
import { mergeDatasets } from '../merge-datasets';
import { buildColumnarDataset, type CellValue } from '../columnar-dataset';
import { parseQuery, filterRows } from '../query';
import { generateInsights } from '../insights';
import type { ColumnDef, Schema, DatasetMeta, Dataset } from '../types';

const cols: ColumnDef[] = [
  { key: 'ts', sourceName: 'date', label: 'Date', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
  { key: 'status', sourceName: 'sc-status', label: 'Status', role: 'status', type: 'int', index: 1, nullable: false, confidence: 1, derived: false },
  { key: 'uri', sourceName: 'cs-uri-stem', label: 'URI', role: 'uri', type: 'string', index: 2, nullable: false, confidence: 1, derived: false },
  { key: 'ip', sourceName: 'c-ip', label: 'IP', role: 'client_ip', type: 'ip', index: 3, nullable: false, confidence: 1, derived: false },
];
const schema: Schema = { format: 'w3c', label: 'W3C', bindings: [], primary: { timestamp: 'ts' }, timezone: 'utc' };

function makeMeta(file: string, rowCount: number): DatasetMeta {
  return { file, bytes: 1000, parsedAt: new Date(0), lineCount: rowCount, skipped: 0, warnings: [], sampled: false, datasetId: file, alignmentKeys: [] };
}

function makeDay(dayOffset: number, rowCount: number, ip = '10.0.0.1'): Dataset {
  const baseMs = Date.UTC(2026, 6, 10 + dayOffset, 0, 0, 0);
  const rowsByCol: { [k: string]: CellValue[] } = {
    ts: Array.from({ length: rowCount }, (_, i) => baseMs + i * 60_000),
    status: Array.from({ length: rowCount }, () => 200),
    uri: Array.from({ length: rowCount }, (_, i) => `/api/day${dayOffset}/${i}`),
    ip: Array.from({ length: rowCount }, () => ip),
  };
  return buildColumnarDataset(cols, rowsByCol, schema, makeMeta(`day${dayOffset}.log`, rowCount));
}

describe('mergeDatasets', () => {
  it('requires at least 2 datasets', () => {
    const a = makeDay(0, 5);
    expect(() => mergeDatasets([{ dataset: a, label: 'a.log' }])).toThrow(/at least 2/);
  });

  it('sums row counts and concatenates values in entry order', () => {
    const a = makeDay(0, 3);
    const b = makeDay(1, 4);
    const merged = mergeDatasets([{ dataset: a, label: 'day0.log' }, { dataset: b, label: 'day1.log' }]);
    expect(merged.rowCount).toBe(7);
    const uriStore = merged.stores.get('uri')!;
    expect(uriStore.get(0)).toBe('/api/day0/0');
    expect(uriStore.get(2)).toBe('/api/day0/2');
    expect(uriStore.get(3)).toBe('/api/day1/0'); // first row of the second file
    expect(uriStore.get(6)).toBe('/api/day1/3');
  });

  it('adds a source_file column populated per-entry', () => {
    const a = makeDay(0, 2);
    const b = makeDay(1, 3);
    const merged = mergeDatasets([{ dataset: a, label: 'day0.log' }, { dataset: b, label: 'day1.log' }]);
    const srcCol = merged.columns.find(c => c.role === 'source_file');
    expect(srcCol).toBeTruthy();
    const srcStore = merged.stores.get(srcCol!.key)!;
    expect(srcStore.get(0)).toBe('day0.log');
    expect(srcStore.get(1)).toBe('day0.log');
    expect(srcStore.get(2)).toBe('day1.log');
    expect(srcStore.get(4)).toBe('day1.log');
  });

  it('merges 3+ datasets correctly', () => {
    const merged = mergeDatasets([
      { dataset: makeDay(0, 2), label: 'a.log' },
      { dataset: makeDay(1, 2), label: 'b.log' },
      { dataset: makeDay(2, 2), label: 'c.log' },
    ]);
    expect(merged.rowCount).toBe(6);
    expect(merged.meta.sourceFiles).toEqual(['a.log', 'b.log', 'c.log']);
  });

  it('does not mutate or add source_file to the ordinary single-file case (contract, not just behavior)', () => {
    // Documents WHY App.tsx must branch before calling this — merging a lone
    // file would silently add an unasked-for column to the common case.
    const a = makeDay(0, 5);
    expect(() => mergeDatasets([{ dataset: a, label: 'a.log' }])).toThrow();
    expect(a.columns.find(c => c.role === 'source_file')).toBeUndefined();
  });

  it('throws a clear, actionable error when column sets differ', () => {
    const a = makeDay(0, 3);
    const differentCols: ColumnDef[] = [...cols, { key: 'extra', sourceName: 'extra', label: 'Extra', role: 'unknown', type: 'string', index: 4, nullable: true, confidence: 0.5, derived: false }];
    const rowsByCol: { [k: string]: CellValue[] } = {
      ts: [Date.UTC(2026, 6, 11)], status: [200], uri: ['/x'], ip: ['10.0.0.2'], extra: ['z'],
    };
    const b = buildColumnarDataset(differentCols, rowsByCol, schema, makeMeta('mismatched.log', 1));

    expect(() => mergeDatasets([{ dataset: a, label: 'a.log' }, { dataset: b, label: 'mismatched.log' }]))
      .toThrow(/mismatched\.log.*a\.log|different columns/i);
  });

  it('sums bytes/lineCount/skipped across entries', () => {
    const a = makeDay(0, 3);
    const b = makeDay(1, 4);
    const merged = mergeDatasets([{ dataset: a, label: 'a.log' }, { dataset: b, label: 'b.log' }]);
    expect(merged.meta.bytes).toBe(2000); // 1000 + 1000 from makeMeta
    expect(merged.meta.lineCount).toBe(7);
  });

  describe('merged dataset is fully usable by query and insights (the actual point of merging)', () => {
    it('source_file is filterable — isolates one input file\'s rows from the combined set', () => {
      const merged = mergeDatasets([
        { dataset: makeDay(0, 5), label: 'day0.log' },
        { dataset: makeDay(1, 5), label: 'day1.log' },
      ]);
      const q = parseQuery('source_file = day1.log');
      // No special-case alias needed — source_file's own key/sourceName IS
      // "source_file", so it resolves via the standard per-column fieldMap path.
      const matched = filterRows(merged, q.where);
      expect(matched.length).toBe(5);
      const uriStore = merged.stores.get('uri')!;
      expect(matched.every(i => String(uriStore.get(i)).includes('day1'))).toBe(true);
    });

    it('insights reflect the combined row set, not any single input file', () => {
      const a = makeDay(0, 60, '203.0.113.9');
      const b = makeDay(1, 40); // different IP, unrelated traffic
      const merged = mergeDatasets([{ dataset: a, label: 'a.log' }, { dataset: b, label: 'b.log' }]);
      const insights = generateInsights(merged, { minSample: 10 });
      const talker = insights.find(i => i.id === 'top-talker');
      expect(talker).toBeTruthy();
      expect(talker?.detail).toContain('203.0.113.9');
      expect(talker?.n).toBe(60); // count reflects the merged total (60 of 100), not file a's own count
    });
  });
});
