// @paths lib/__tests__/columnar-dataset.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildColumnarDataset,
  serializeColumnarDataset,
  rehydrateColumnarDataset,
  type CellValue,
} from '../columnar-dataset';
import type { ColumnDef, Schema, DatasetMeta } from '../types';

const cols: ColumnDef[] = [
  { key: 'status', sourceName: 'sc-status', label: 'Status', role: 'status', type: 'int', index: 0, nullable: true, confidence: 1, derived: false },
  { key: 'uri', sourceName: 'cs-uri-stem', label: 'URI', role: 'uri', type: 'string', index: 1, nullable: true, confidence: 1, derived: false },
  { key: 'latency', sourceName: 'time-taken', label: 'Latency', role: 'latency_ms', type: 'number', index: 2, nullable: true, confidence: 1, derived: false },
];

const schema: Schema = { format: 'w3c', label: 'W3C', bindings: [], primary: {}, timezone: 'utc' };
const meta: DatasetMeta = {
  file: 'test.log', bytes: 100, parsedAt: new Date(), lineCount: 3, skipped: 0,
  warnings: [], sampled: false, datasetId: 't1', alignmentKeys: [],
};

function build() {
  const rowsByCol: { [k: string]: CellValue[] } = {
    status: [200, 500, null],
    uri: ['/api/x', '/api/y', '/img/a.png'],
    latency: [10, 500, null],
  };
  return buildColumnarDataset(cols, rowsByCol, schema, meta);
}

describe('buildColumnarDataset', () => {
  it('builds stores and exposes rowCount', () => {
    const ds = build();
    expect(ds.rowCount).toBe(3);
    expect(ds.columns.length).toBe(3);
  });

  it('getCellAt returns raw values by numeric column index', () => {
    const ds = build();
    expect(ds.getCellAt(0, 0)).toBe(200); // status
    expect(ds.getCellAt(1, 1)).toBe('/api/y'); // uri
  });

  it('getRow materialises an object (compat)', () => {
    const ds = build();
    const row = ds.getRow(0);
    expect(row['status']).toBe(200);
    expect(row['latency']).toBe(10);
  });

  it('rows property still works (compat)', () => {
    const ds = build();
    expect(ds.rows.length).toBe(3);
    expect(ds.rows[0]['uri']).toBe('/api/x');
  });

  it('stores null as missing', () => {
    const ds = build();
    expect(ds.getCellAt(2, 0)).toBeNull();
  });
});

describe('serialize + rehydrate round-trip', () => {
  it('serializes to DTO then rehydrates', () => {
    const ds = build();
    const { stores, index } = serializeColumnarDataset(ds);
    const restored = rehydrateColumnarDataset({
      columns: cols,
      schema,
      meta,
      stores,
      index,
    });
    expect(restored.rowCount).toBe(3);
    expect(restored.getCellAt(0, 1)).toBe('/api/x');
    expect(restored.getCellAt(1, 2)).toBe(500);
    expect(restored.getRow(2)['uri']).toBe('/img/a.png');
  });

  it('produces transferable ArrayBuffers', () => {
    const ds = build();
    const { stores } = serializeColumnarDataset(ds);
    for (const s of stores) {
      for (const b of s.blockBuffers) {
        expect(b).toBeInstanceOf(ArrayBuffer);
      }
    }
  });
});
