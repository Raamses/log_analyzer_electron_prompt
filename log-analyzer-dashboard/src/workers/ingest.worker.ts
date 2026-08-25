// @paths workers/ingest
/**
 * Ingest worker — streaming pipeline from raw bytes to typed Dataset.
 *
 * Streaming: reads in 8MB chunks so 100MB+ files never materialise as one string.
 * Enforces byte + row ceilings (configurable). Partial results on error.
 */

import type { ColumnDef, Schema, DatasetMeta } from '../lib/types';
import {
  detectSchema, applySchema, inferSchema, SCHEMA_REGISTRY,
} from '../lib/schema';
import {
  frame, parseDelimitedLine, detectEncoding, decodeBytes,
} from '../lib/dialect';
import { normalizeRow } from '../lib/normalize';

export interface IngestResult {
  type: 'done';
  columns: ColumnDef[];
  schema: Schema;
  rows: string[][];
  meta: DatasetMeta;
  dictionaries: Record<string, string[]>;
}

export interface IngestProgress {
  type: 'progress';
  stage: 'reading' | 'parsing';
  progress: number;
}

export interface IngestError {
  type: 'error';
  error: string;
}

export type IngestMessage = IngestResult | IngestProgress | IngestError;

export interface IngestOptions {
  maxBytes?: number;
  maxRows?: number;
  sampleRows?: number;
  schemaId?: string;
}

const DEFAULT_MAX_ROWS = 500_000;
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

self.onmessage = async (e: MessageEvent<{ file: File; options?: IngestOptions }>) => {
  const { file, options } = e.data;
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const sampleRows = options?.sampleRows;
  const forceSchemaId = options?.schemaId;

  const warnings: string[] = [];
  let bytesRead = 0;
  let lineCount = 0;
  let skipped = 0;
  let columns: ColumnDef[] = [];
  let schema: Schema | null = null;
  const rows: string[][] = [];
  let leftover = '';
  let formatDetected = false;
  let detectedDelimiter = ','; // preserve across chunks (fixes multi-chunk bug)

  const CHUNK = 8 * 1024 * 1024;

  try {
    while (bytesRead < file.size) {
      if (bytesRead >= maxBytes) {
        warnings.push(`byte ceiling reached at ${maxBytes} bytes`);
        break;
      }

      const end = Math.min(bytesRead + CHUNK, file.size);
      const slice = file.slice(bytesRead, end);
      const buf = new Uint8Array(await slice.arrayBuffer());
      bytesRead += buf.byteLength;

      let text: string;
      if (!formatDetected && columns.length === 0) {
        const enc = detectEncoding(buf);
        text = decodeBytes(buf, enc.encoding);
      } else {
        text = decodeBytes(buf, 'utf-8');
      }

      const raw = leftover + text;
      const nlIndex = raw.lastIndexOf('\n');

      let processable: string;
      if (nlIndex === -1) {
        leftover = raw;
        continue;
      }
      processable = raw.substring(0, nlIndex);
      leftover = raw.substring(nlIndex + 1);

      const lines = processable.replace(/\r\n?/g, '').split('\n');

      // First chunk: detect format and schema
      if (!formatDetected) {
        const headerText = lines.slice(0, 30).join('\n');
        const framed = frame(headerText);

        if (framed.columns.length === 0) {
          warnings.push('no columns detected in first chunk');
          continue;
        }

        detectedDelimiter = framed.format === 'tsv' ? '\t' : ',';

        let entry = forceSchemaId
          ? SCHEMA_REGISTRY.find(s => s.id === forceSchemaId)
          : detectSchema(framed.columns);
        if (!entry) entry = inferSchema(framed.columns);

        const result = applySchema(entry, framed.columns);
        columns = result.columns;
        schema = result.schema;
        formatDetected = true;

        // Process data rows from this chunk (skip header)
        const dataLines = (framed.format === 'tsv' || framed.format === 'csv')
          ? lines.slice(1)
          : lines;
        for (const line of dataLines) {
          if (line.trim() === '' || line.startsWith('#')) continue;
          try {
            const rawCells = parseDelimitedLine(line, detectedDelimiter);
            const normRow = normalizeRow(rawCells, columns, schema);
            rows.push(normRow);
          } catch {
            skipped++;
          }
          if (rows.length >= maxRows || (sampleRows && rows.length >= sampleRows)) break;
        }
        continue;
      }

      // Subsequent chunks: parse using detected delimiter and format
      for (const line of lines) {
        lineCount++;
        if (line.trim() === '' || line.startsWith('#')) continue;
        try {
          const rawCells = parseDelimitedLine(line, detectedDelimiter);
          if (rawCells.length !== columns.length && columns.length > 0) {
            while (rawCells.length < columns.length) rawCells.push('');
            if (rawCells.length > columns.length) rawCells.length = columns.length;
          }
          const normRow = normalizeRow(rawCells, columns, schema!);
          rows.push(normRow);
        } catch {
          skipped++;
        }

        if (rows.length >= maxRows) {
          warnings.push(`row cap reached at ${maxRows}`);
          break;
        }
        if (sampleRows && rows.length >= sampleRows) break;
      }

      const progress = Math.round((bytesRead / file.size) * 100);
      self.postMessage({ type: 'progress', stage: 'parsing', progress } satisfies IngestProgress);

      if (rows.length >= maxRows) break;
    }

    if (!schema) {
      self.postMessage({
        type: 'error',
        error: 'Invalid or unsupported log format.',
      } satisfies IngestError);
      return;
    }

    self.postMessage({
      type: 'done',
      columns,
      schema,
      rows,
      meta: {
        file: file.name,
        bytes: file.size,
        parsedAt: new Date(),
        lineCount,
        skipped,
        warnings,
        sampled: sampleRows !== undefined,
        datasetId: crypto.randomUUID(),
        alignmentKeys: [],
      },
      dictionaries: {},
    } satisfies IngestResult);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error processing file';
    self.postMessage({ type: 'error', error: msg } satisfies IngestError);
  }
};
