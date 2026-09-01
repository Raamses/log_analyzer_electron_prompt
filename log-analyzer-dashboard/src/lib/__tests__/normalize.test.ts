import { describe, it, expect } from 'vitest';
import { parseTimestamp, normalizeCell, normalizeRow } from '../normalize';
import type { ColumnDef, Schema } from '../types';

describe('parseTimestamp', () => {
  it('parses ISO 8601 UTC', () => {
    expect(parseTimestamp('2025-10-26T14:23:50.000Z', 'utc')).toBe(1761488630000);
  });

  it('parses ISO 8601 with timezone offset', () => {
    const utc = parseTimestamp('2025-10-26T14:23:50+00:00', 'utc');
    const ist = parseTimestamp('2025-10-26T14:23:50+03:00', 'utc');
    expect(utc - ist).toBe(3 * 3600_000);
  });

  it('parses Apache CLF format', () => {
    const ms = parseTimestamp('10/Oct/2000:13:55:36 -0700', 'utc');
    expect(ms).toBe(new Date('2000-10-10T20:55:36Z').getTime());
  });

  it('parses Azure APGW 12h format PM', () => {
    const ms = parseTimestamp('10/26/2025, 2:23:50.000 PM', 'utc');
    expect(ms).toBe(Date.UTC(2025, 9, 26, 14, 23, 50));
  });

  it('parses Azure APGW 12h format midnight AM', () => {
    const ms = parseTimestamp('10/26/2025, 12:00:00 AM', 'utc');
    expect(ms).toBe(Date.UTC(2025, 9, 26, 0, 0, 0));
  });

  it('parses Azure APGW 12h format noon PM', () => {
    const ms = parseTimestamp('10/26/2025, 12:00:00 PM', 'utc');
    expect(ms).toBe(Date.UTC(2025, 9, 26, 12, 0, 0));
  });

  it('parses IIS date+time as UTC', () => {
    const ms = parseTimestamp('2025-10-26 14:23:50', 'utc');
    expect(ms).toBe(Date.UTC(2025, 9, 26, 14, 23, 50));
  });

  it('parses Unix epoch ms', () => {
    expect(parseTimestamp('1761488630000', 'utc')).toBe(1761488630000);
  });

  it('parses Unix epoch s', () => {
    expect(parseTimestamp('1761488630', 'utc')).toBe(1761488630000);
  });

  it('returns NaN for empty', () => {
    expect(parseTimestamp('', 'utc')).toBeNaN();
  });

  it('returns NaN for dash', () => {
    expect(parseTimestamp('-', 'utc')).toBeNaN();
  });

  it('returns NaN for garbage', () => {
    expect(parseTimestamp('not a date', 'utc')).toBeNaN();
  });
});

describe('normalizeCell', () => {
  it('normalizes timestamp to epoch ms', () => {
    expect(normalizeCell('2025-10-26T14:23:50Z', 'timestamp', undefined, 'utc'))
      .toBe('1761488630000');
  });

  it('normalizes latency seconds to ms', () => {
    expect(normalizeCell('0.05', 'latency_ms', 's', 'utc')).toBe('50');
  });

  it('normalizes latency ms to ms', () => {
    expect(normalizeCell('150', 'latency_ms', 'ms', 'utc')).toBe('150');
  });

  it('normalizes latency us to ms', () => {
    expect(normalizeCell('150000', 'latency_ms', 'us', 'utc')).toBe('150');
  });

  it('returns empty for empty', () => {
    expect(normalizeCell('', 'timestamp', undefined, 'utc')).toBe('');
  });

  it('returns empty for dash', () => {
    expect(normalizeCell('-', 'latency_ms', 's', 'utc')).toBe('');
  });

  it('passes through status unchanged', () => {
    expect(normalizeCell('200', 'status', undefined, 'utc')).toBe('200');
  });

  it('passes through unknown role unchanged', () => {
    expect(normalizeCell('anything', 'unknown', undefined, 'utc')).toBe('anything');
  });
});

describe('normalizeRow', () => {
  const columns: ColumnDef[] = [
    { key: 'ts', sourceName: 'Time', label: 'Time', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
    { key: 'lat', sourceName: 'Latency', label: 'Latency', role: 'latency_ms', type: 'number', index: 1, nullable: false, confidence: 1, derived: false },
    { key: 'status', sourceName: 'Status', label: 'Status', role: 'status', type: 'int', index: 2, nullable: false, confidence: 1, derived: false },
  ];
  const schema: Schema = {
    format: 'test', label: 'Test',
    bindings: [
      { role: 'timestamp', columnKey: 'ts', priority: 0, multiplicity: 'single' },
      { role: 'latency_ms', columnKey: 'lat', priority: 0, multiplicity: 'single', unit: 's' },
      { role: 'status', columnKey: 'status', priority: 0, multiplicity: 'single' },
    ],
    primary: {},
    timezone: 'utc',
  };

  it('normalizes a full row', () => {
    const raw = ['2025-10-26T14:23:50Z', '0.05', '200'];
    const norm = normalizeRow(raw, columns, schema);
    expect(norm[0]).toBe('1761488630000');
    expect(norm[1]).toBe('50');
    expect(norm[2]).toBe('200');
  });

  it('handles missing cells', () => {
    const raw = ['2025-10-26T14:23:50Z'];
    const norm = normalizeRow(raw, columns, schema);
    expect(norm[0]).toBe('1761488630000');
    expect(norm[1]).toBe('');
    expect(norm[2]).toBe('');
  });
});

describe('normalizeRow — split date+time columns (IIS W3C regression)', () => {
  // IIS W3C binds `date` and `time` as two SEPARATE columns, both role
  // 'timestamp'. Neither parses alone (parseTimestamp requires a combined
  // "YYYY-MM-DD HH:MM:SS" string), so the primary timestamp column used
  // to come back empty on every row — silently breaking sort/timeline/
  // anomaly detection, since nothing downstream threw an error.
  const columns: ColumnDef[] = [
    { key: 'date', sourceName: 'date', label: 'Date', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 0.7, derived: false },
    { key: 'time', sourceName: 'time', label: 'Time', role: 'timestamp', type: 'date', index: 1, nullable: false, confidence: 0.7, derived: false },
    { key: 'sc-status', sourceName: 'sc-status', label: 'SC Status', role: 'status', type: 'int', index: 2, nullable: false, confidence: 0.95, derived: false },
  ];
  const schema: Schema = {
    format: 'iis-w3c', label: 'IIS W3C Extended',
    bindings: [
      { role: 'timestamp', columnKey: 'date', priority: 0, multiplicity: 'single' },
      { role: 'timestamp', columnKey: 'time', priority: 0, multiplicity: 'single' },
      { role: 'status', columnKey: 'sc-status', priority: 0, multiplicity: 'single' },
    ],
    primary: { timestamp: 'date' },
    timezone: 'utc',
  };

  it('combines date + time onto the primary timestamp column', () => {
    const raw = ['2026-07-11', '00:03:35', '200'];
    const norm = normalizeRow(raw, columns, schema);
    expect(norm[0]).toBe(String(Date.UTC(2026, 6, 11, 0, 3, 35)));
  });

  it('leaves the non-primary timestamp column as its own (failed) parse', () => {
    const raw = ['2026-07-11', '00:03:35', '200'];
    const norm = normalizeRow(raw, columns, schema);
    expect(norm[1]).toBe(''); // 'time' alone still doesn't parse — only 'date' (primary) is retried
  });

  it('falls back to the first timestamp column when schema.primary is unset', () => {
    const noPrimary: Schema = { ...schema, primary: {} };
    const raw = ['2026-07-11', '00:03:35', '200'];
    const norm = normalizeRow(raw, columns, noPrimary);
    expect(norm[0]).toBe(String(Date.UTC(2026, 6, 11, 0, 3, 35)));
  });

  it('does not touch single-timestamp-column schemas (e.g. Azure APGW)', () => {
    const singleTsColumns: ColumnDef[] = [
      { key: 'ts', sourceName: 'TimeGenerated [UTC]', label: 'Time', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
    ];
    const singleTsSchema: Schema = {
      format: 'azure-apgw', label: 'Azure Application Gateway',
      bindings: [{ role: 'timestamp', columnKey: 'ts', priority: 0, multiplicity: 'single' }],
      primary: { timestamp: 'ts' },
      timezone: 'utc',
    };
    // A lone date-only value still correctly fails to parse — no sibling to combine with.
    const norm = normalizeRow(['2026-07-11'], singleTsColumns, singleTsSchema);
    expect(norm[0]).toBe('');
  });
});
