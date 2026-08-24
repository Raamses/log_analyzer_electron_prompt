import { describe, it, expect } from 'vitest';
import { exportDataset } from '../export';
import type { Dataset } from '../types';

const makeDataset = (): Dataset => ({
  columns: [
    { key: 'ts', sourceName: 'timestamp', label: 'Time', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
    { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 1, nullable: false, confidence: 1, derived: false },
    { key: 'ip', sourceName: 'client_ip', label: 'IP', role: 'client_ip', type: 'ip', index: 2, nullable: false, confidence: 1, derived: false },
    { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'url', index: 3, nullable: false, confidence: 1, derived: false },
  ],
  rows: [
    { ts: '1761488630000', status: '200', ip: '10.0.0.1', uri: '/api/search?token=abc' },
    { ts: '1761488631000', status: '404', ip: '10.0.0.2', uri: '/api/missing' },
  ],
  index: new Uint32Array([0, 1]),
  schema: { format: 'test', label: 'Test', bindings: [], primary: {}, timezone: 'utc' },
  meta: { file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: 2, skipped: 0, warnings: [], sampled: false, datasetId: 'test-1', alignmentKeys: [] },
});

describe('exportDataset', () => {
  it('exports CSV', () => {
    const csv = exportDataset(makeDataset(), { format: 'csv' });
    expect(csv).toContain('Time,Status,IP,URI');
    expect(csv).toContain('200,10.0.0.1');
  });

  it('exports TSV', () => {
    const tsv = exportDataset(makeDataset(), { format: 'tsv' });
    expect(tsv).toContain('Time\tStatus\tIP\tURI');
  });

  it('exports JSON', () => {
    const json = exportDataset(makeDataset(), { format: 'json' });
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toHaveProperty('Status', '200');
  });

  it('exports NDJSON', () => {
    const ndjson = exportDataset(makeDataset(), { format: 'ndjson' });
    const lines = ndjson.split('\n');
    expect(lines).toHaveLength(2);
    JSON.parse(lines[0]); // valid JSON
  });

  it('respects column filter', () => {
    const csv = exportDataset(makeDataset(), { format: 'csv', columns: ['status', 'uri'] });
    expect(csv).toContain('Status,URI');
    expect(csv).not.toContain('IP');
  });

  it('respects row filter', () => {
    const csv = exportDataset(makeDataset(), { format: 'csv', rows: [0] });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2); // header + 1 row
  });

  it('redacts IPs when redact=true', () => {
    const csv = exportDataset(makeDataset(), { format: 'csv', redact: true });
    expect(csv).toContain('10.0.0.x');
    expect(csv).not.toContain('10.0.0.1');
  });

  it('redacts sensitive query params', () => {
    const csv = exportDataset(makeDataset(), { format: 'csv', redact: true });
    expect(csv).toContain('token=[REDACTED]');
    expect(csv).not.toContain('token=abc');
  });

  it('escapes CSV fields with commas', () => {
    const ds = makeDataset();
    ds.rows[0].uri = '/api/search,test';
    const csv = exportDataset(ds, { format: 'csv' });
    expect(csv).toContain('"/api/search,test"');
  });
});
