// @paths lib/types

import type { ColumnStore } from './columnstore';

/**
 * Core type model for the generic log analyzer.
 *
 * Design: the parser never produces a fixed `LogEntry`. It produces a `Dataset`
 * whose columns are tagged with *semantic roles* (timestamp, status, uri...).
 * Analytics ask "is there a role `status`?" not "is there a column `statusCode`?".
 * This is what makes adding a format a registry entry instead of parser surgery.
 */

/** Canonical semantic roles a column can play in analytics. */
export type Role =
  | 'timestamp' | 'status' | 'latency_ms' | 'client_ip' | 'method'
  | 'uri' | 'query' | 'user_agent' | 'bytes_out' | 'bytes_in'
  | 'host' | 'referrer' | 'protocol' | 'edge_location'
  | 'cache_status' | 'backend' | 'request_id' | 'waf_action'
  | 'tls_version' | 'country' | 'category'
  | 'unknown';

export type CellType = 'string' | 'number' | 'int' | 'date' | 'bool' | 'ip' | 'url';

/**
 * A single column in the ingested dataset.
 *
 * `sourceName` is the EXACT original header — never lost, always shown.
 * `key` is a stable slugified id (handles duplicates: `cs-uri-stem` + `_2`).
 */
export interface ColumnDef {
  key: string;
  sourceName: string;
  label: string;
  role: Role;
  type: CellType;
  index: number;
  nullable: boolean;
  confidence: number;       // 0-1, how sure the mapping is
  derived: boolean;         // true if produced by a transform, not raw
}

/** Declared timezone for timestamp columns, per source format. */
export type TimeZoneDecl = 'utc' | 'local' | `offset:${string}` | 'infer';

/**
 * How one source column binds to a role. Many bindings per role allowed;
 * `primary` names the winner. Multi-value fields (XFF chains, ALB status
 * lists) use `multiplicity: 'list'` + `splitter`.
 */
export interface RoleBinding {
  role: Role;
  columnKey: string;
  priority: number;          // higher wins when multiple map to same role
  multiplicity: 'single' | 'list';
  splitter?: RegExp;
  transform?: TransformId;
  unit?: 'ms' | 's' | 'us' | 'bytes';
}

export type TransformId =
  | 'xff_first' | 'xff_rest'
  | 'concat' | 'concat_query'
  | 'scale_ms' | 'scale_s' | 'scale_us';

export interface Schema {
  format: string;
  label: string;
  bindings: RoleBinding[];
  primary: Partial<Record<Role, string>>;   // role -> columnKey (winner)
  timezone: TimeZoneDecl;
}

/** Metadata about the ingestion — NOT the data itself. */
export interface DatasetMeta {
  file: string;
  bytes: number;
  parsedAt: Date;
  lineCount: number;
  skipped: number;
  warnings: string[];
  sampled: boolean;
  datasetId: string;
  alignmentKeys: string[];
}

/**
 * The core data container. Columnar storage + a sort/filter index array.
 */
export interface Dataset {
  columns: ColumnDef[];
  stores: Map<string, ColumnStore>;
  index: Uint32Array;          // sort/filter view over rows
  schema: Schema;
  meta: DatasetMeta;
  rowCount: number;
}

/** Materialize a single row from column stores. */
export function getRowAt(dataset: Dataset, rowIdx: number): Row {
  const row: Row = {};
  for (const col of dataset.columns) {
    const store = dataset.stores.get(col.key);
    if (store) row[col.key] = store.get(rowIdx);
  }
  return row;
}

/** One row: keyed by ColumnDef.key. Values are raw — formatting is UI work. */
export type Row = Record<string, unknown>;
