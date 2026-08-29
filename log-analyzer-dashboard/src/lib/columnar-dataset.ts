// @paths lib/columnar-dataset
/**
 * ColumnarDataset — a Dataset implementation backed by ColumnStore, plus the
 * ingest-side builder.
 *
 * This is the additive bridge (Phase 6 plan §3.2 / sequencing): the existing
 * Dataset interface (rows: Row[]) is preserved so all 12 current call sites
 * keep working, while the columnar stores hold the real data. getCellAt /
 * getColumn expose the index-based hot path for the table, filter, and
 * analytics. Once every consumer is migrated to the index-based accessors,
 * `rows` can be deleted (the additive-then-delete step).
 */

import type { ColumnDef, Dataset, DatasetMeta, Row, Schema } from './types';
import { createColumnStore, type ColumnStore, type SerializedColumn } from './columnstore';

export interface ColumnarDataset extends Dataset {
  readonly stores: Map<string, ColumnStore>;
  readonly rowCount: number;
  getCellAt(row: number, colIdx: number): unknown;
  getColumn(colIdx: number): ColumnStore;
  getRow(row: number): Row;
}

/** A single normalized cell value converted to its column-store type. */
export type CellValue = string | number | boolean | null;

/** Describes one column's store for construction. */
export interface ColumnarColumnSpec {
  column: ColumnDef;
  store: ColumnStore;
}

export interface IngestColumnar {
  columns: ColumnDef[];
  schema: Schema;
  meta: DatasetMeta;
  columnData: { [key: string]: (string | number | null)[] };
  rowCount: number;
  index: Uint32Array;
}

/** Build a ColumnStore from raw array values, choosing the right type. */
function columnStoreFromArray(
  values: (string | number | null)[],
  col: ColumnDef,
): ColumnStore {
  const type = columnTypeForType(col);
  const store = createColumnStore(type);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined) store.set(i, v);
  }
  return store;
}

/**
 * Build a ColumnarDataset from a set of raw column values (index-aligned rows).
 * Row i writes value v into store s via set(i, v).
 */
export function buildColumnarDataset(
  columns: ColumnDef[],
  rowsByCol: { [colKey: string]: CellValue[] },
  schema: Schema,
  meta: DatasetMeta,
): ColumnarDataset {
  const stores = new Map<string, ColumnStore>();
  for (const col of columns) {
    const type = columnTypeForType(col);
    const store = createColumnStore(type);
    stores.set(col.key, store);
  }

  const rowCount = rowsByCol[columns[0]?.key]?.length ?? 0;
  for (const col of columns) {
    const store = stores.get(col.key)!;
    const values = rowsByCol[col.key] ?? [];
    for (let i = 0; i < rowCount; i++) {
      const v = values[i];
      if (v !== null && v !== undefined) store.set(i, v);
    }
  }

  const index = new Uint32Array(rowCount);
  for (let i = 0; i < rowCount; i++) index[i] = i;

  return makeColumnarDataset(columns, stores, schema, meta, index);
}

/** Choose a ColumnStore type from a ColumnDef type + role. */
export function columnTypeForType(col: ColumnDef): 'dict' | 'float64' | 'int32' | 'string' {
  switch (col.type) {
    case 'date':
      return 'float64';
    case 'int':
    case 'number':
      return 'int32';
    case 'ip':
    case 'url':
    case 'string':
      // Strings: dict-encode unless role suggests high cardinality.
      if (col.role === 'request_id' || col.role === 'query' || col.role === 'user_agent') {
        return 'string';
      }
      return 'dict';
    default:
      return 'dict';
  }
}

export function makeColumnarDataset(
  columns: ColumnDef[],
  stores: Map<string, ColumnStore>,
  schema: Schema,
  meta: DatasetMeta,
  index: Uint32Array,
): ColumnarDataset {
  return {
    columns,
    index,
    schema,
    meta,
    stores,
    get rowCount(): number {
      return index.length;
    },
    getCellAt(rowIdx: number, colIdx: number): unknown {
      const col = columns[colIdx];
      if (!col) return null;
      const store = stores.get(col.key);
      if (!store) return null;
      return store.get(rowIdx);
    },
    getColumn(colIdx: number): ColumnStore {
      const col = columns[colIdx];
      const store = stores.get(col.key);
      if (!store) throw new Error(`no store for column ${col.key}`);
      return store;
    },
    getRow(rowIdx: number): Row {
      const row: Row = {};
      for (const col of columns) {
        const store = stores.get(col.key);
        if (store) row[col.key] = store.get(rowIdx);
      }
      return row;
    },
  };
}

/** Rehydrate a ColumnarDataset from a transfer DTO (main-thread factory). */
export function rehydrateColumnarDataset(dto: IngestColumnar): ColumnarDataset {
  const stores = new Map<string, ColumnStore>();
  for (const col of dto.columns) {
    const values = dto.columnData[col.key];
    if (values) {
      stores.set(col.key, columnStoreFromArray(values, col));
    }
  }
  return makeColumnarDataset(dto.columns, stores, dto.schema, dto.meta, dto.index);
}

export interface SerializeColumnarResult {
  stores: SerializedColumn[];
  index: Uint32Array;
}

/** Produce the transferable payload from a ColumnarDataset. */
export function serializeColumnarDataset(ds: ColumnarDataset): SerializeColumnarResult {
  const stores: SerializedColumn[] = [];
  for (const col of ds.columns) {
    const store = ds.stores.get(col.key);
    if (store) stores.push(store.toDTO());
  }
  return { stores, index: ds.index };
}
