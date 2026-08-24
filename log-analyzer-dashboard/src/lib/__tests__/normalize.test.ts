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
