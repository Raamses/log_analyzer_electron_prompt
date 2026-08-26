// @paths lib/entry-to-dataset
/**
 * Adapter: convert the legacy LogEntry[] (from useLogAnalysis) into a
 * Dataset so the new LogAnalyzer can render it. This is the bridge that
 * makes Phase 5's query-first UI visible without waiting for the new
 * ingest pipeline to land in the live app.
 */

import type { Dataset, ColumnDef, Schema, Row } from './types';

const COLUMNS: ColumnDef[] = [
  { key: 'timestamp', sourceName: 'timestamp', label: 'Timestamp', role: 'timestamp', type: 'date', index: 0, nullable: false, confidence: 1, derived: false },
  { key: 'method', sourceName: 'method', label: 'Method', role: 'method', type: 'string', index: 1, nullable: true, confidence: 1, derived: false },
  { key: 'uri', sourceName: 'uri', label: 'URI', role: 'uri', type: 'string', index: 2, nullable: false, confidence: 1, derived: false },
  { key: 'status', sourceName: 'status', label: 'Status', role: 'status', type: 'int', index: 3, nullable: false, confidence: 1, derived: false },
  { key: 'latency_ms', sourceName: 'latency_ms', label: 'Latency', role: 'latency_ms', type: 'int', index: 4, nullable: false, confidence: 1, derived: false },
  { key: 'client_ip', sourceName: 'client_ip', label: 'Client IP', role: 'client_ip', type: 'ip', index: 5, nullable: false, confidence: 1, derived: false },
  { key: 'user_agent', sourceName: 'user_agent', label: 'User Agent', role: 'user_agent', type: 'string', index: 6, nullable: true, confidence: 1, derived: false },
  { key: 'request_id', sourceName: 'request_id', label: 'Request ID', role: 'request_id', type: 'string', index: 7, nullable: true, confidence: 1, derived: false },
];

const SCHEMA: Schema = {
  format: 'legacy-entry',
  label: 'Legacy LogEntry',
  bindings: [],
  primary: { timestamp: 'timestamp', status: 'status', uri: 'uri', client_ip: 'client_ip' },
  timezone: 'utc',
};

export interface LogEntryLike {
  timestamp: Date;
  uriStem: string;
  statusCode: number;
  timeTaken: number;
  clientIp: string;
  method?: string;
  userAgent?: string;
  requestId?: string;
}

export function entriesToDataset(entries: LogEntryLike[], fileName = 'pasted.log'): Dataset {
  const rows: Row[] = entries.map(e => ({
    timestamp: e.timestamp.getTime(),
    method: e.method ?? null,
    uri: e.uriStem,
    status: e.statusCode,
    latency_ms: e.timeTaken,
    client_ip: e.clientIp,
    user_agent: e.userAgent ?? null,
    request_id: e.requestId ?? null,
  }));

  return {
    columns: COLUMNS,
    rows,
    index: new Uint32Array(rows.length).map((_, i) => i),
    schema: SCHEMA,
    meta: {
      file: fileName,
      bytes: 0,
      parsedAt: new Date(),
      lineCount: entries.length,
      skipped: 0,
      warnings: [],
      sampled: false,
      datasetId: 'legacy-entry-dataset',
      alignmentKeys: [],
    },
  };
}
