// @paths lib/merge-datasets
/**
 * mergeDatasets — combine several already-ingested, schema-compatible
 * datasets into one unified Dataset.
 *
 * This is the "stitch same-server across time" and "combine different
 * servers, same period" multi-file modes from the 2026-09-01 decision
 * (vault/decisions/2026-09-01-insights-and-multifile-direction.md): both want
 * the same shape — one query bar, one table, insights over the combined set,
 * with a `source_file` column so origin stays filterable. NOT the tabs model
 * (separate datasets you switch between) — that's for later, for comparison
 * mode and schema-incompatible sources.
 *
 * Deliberately conservative for v1: requires every input dataset to expose
 * the exact same column key set. Throws a clear, actionable error otherwise
 * rather than guessing at a partial union — a merge that silently drops or
 * misaligns columns is worse than one that refuses and says why.
 */

import type { CellValue } from './columnar-dataset';
import { buildColumnarDataset } from './columnar-dataset';
import type { ColumnDef, Dataset } from './types';

export interface MergeEntry {
  dataset: Dataset;
  /** Human-readable origin label for this dataset's rows — typically a
   *  filename. Populates the source_file column and DatasetMeta.sourceFiles. */
  label: string;
}

const SOURCE_FILE_COLUMN_KEY = 'source_file';

/**
 * Verify every dataset has the same set of column keys. Column ORDER may
 * differ (e.g. two IIS files whose #Fields directive listed fields in a
 * different order would still be compatible); the KEY SET must match exactly.
 * Throws with a message naming which files/columns disagree.
 */
function assertCompatible(entries: MergeEntry[]): void {
  const [first, ...rest] = entries;
  const firstKeys = new Set(first.dataset.columns.map(c => c.key));

  for (const entry of rest) {
    const keys = new Set(entry.dataset.columns.map(c => c.key));
    const missing = [...firstKeys].filter(k => !keys.has(k));
    const extra = [...keys].filter(k => !firstKeys.has(k));
    if (missing.length > 0 || extra.length > 0) {
      const parts: string[] = [];
      if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
      if (extra.length > 0) parts.push(`extra: ${extra.join(', ')}`);
      throw new Error(
        `Cannot merge "${entry.label}" with "${first.label}" — different columns (${parts.join('; ')}). ` +
        `Merged files must have the same log format.`,
      );
    }
  }
}

/**
 * Merge 2+ schema-compatible datasets into one, adding a synthetic
 * `source_file` column. Requires at least 2 entries — a single file should
 * never go through this (it would add an unnecessary, unasked-for column to
 * the ordinary single-file load path).
 */
export function mergeDatasets(entries: MergeEntry[]): Dataset {
  if (entries.length < 2) {
    throw new Error(`mergeDatasets requires at least 2 datasets, got ${entries.length}`);
  }
  assertCompatible(entries);

  const first = entries[0].dataset;
  const columns: ColumnDef[] = [
    ...first.columns,
    {
      key: SOURCE_FILE_COLUMN_KEY,
      sourceName: SOURCE_FILE_COLUMN_KEY,
      label: 'Source File',
      role: 'source_file',
      type: 'string',
      index: first.columns.length,
      nullable: false,
      confidence: 1,
      derived: true,
    },
  ];

  const totalRows = entries.reduce((sum, e) => sum + e.dataset.rowCount, 0);
  const rowsByCol: { [colKey: string]: CellValue[] } = {};
  for (const col of first.columns) rowsByCol[col.key] = new Array(totalRows);
  rowsByCol[SOURCE_FILE_COLUMN_KEY] = new Array(totalRows);

  let offset = 0;
  for (const entry of entries) {
    const { dataset, label } = entry;
    for (const col of first.columns) {
      const store = dataset.stores.get(col.key);
      const dest = rowsByCol[col.key];
      for (let i = 0; i < dataset.rowCount; i++) {
        dest[offset + i] = (store ? store.get(i) : null) as CellValue;
      }
    }
    const sourceDest = rowsByCol[SOURCE_FILE_COLUMN_KEY];
    for (let i = 0; i < dataset.rowCount; i++) sourceDest[offset + i] = label;
    offset += dataset.rowCount;
  }

  const mergedWarnings = entries.flatMap(e => e.dataset.meta.warnings.map(w => `[${e.label}] ${w}`));

  return buildColumnarDataset(columns, rowsByCol, first.schema, {
    file: `${entries.length} files merged (${entries.map(e => e.label).join(', ')})`,
    bytes: entries.reduce((sum, e) => sum + e.dataset.meta.bytes, 0),
    parsedAt: new Date(entries[0].dataset.meta.parsedAt),
    lineCount: entries.reduce((sum, e) => sum + e.dataset.meta.lineCount, 0),
    skipped: entries.reduce((sum, e) => sum + e.dataset.meta.skipped, 0),
    warnings: mergedWarnings,
    sampled: entries.some(e => e.dataset.meta.sampled),
    datasetId: `merged-${entries.map(e => e.dataset.meta.datasetId).join('+')}`,
    alignmentKeys: [],
    sourceFiles: entries.map(e => e.label),
  });
}
