// @paths lib/ingest
/**
 * Ingest wrapper — runs the ingest worker and returns a Dataset.
 *
 * This is the main-thread entry point for loading a log file. It spawns
 * the ingest worker, streams progress, and resolves with the parsed Dataset.
 */

import type { Dataset } from './types';
import type { IngestMessage, IngestOptions } from '../workers/ingest.worker';

export interface IngestCallbacks {
  onProgress?: (progress: number) => void;
}

/**
 * Parse a log file into a Dataset using the ingest worker.
 * Resolves with the parsed dataset, or rejects with an Error.
 */
export function ingestLogs(file: File, options: IngestOptions = {}, callbacks: IngestCallbacks = {}): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/ingest.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<IngestMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        callbacks.onProgress?.(msg.progress);
      } else if (msg.type === 'done') {
        const dataset: Dataset = {
          columns: msg.columns,
          rows: msg.rows.map((row) => {
            const obj: Record<string, unknown> = {};
            msg.columns.forEach((col, i) => { obj[col.key] = row[i]; });
            return obj;
          }),
          index: new Uint32Array(msg.rows.length).map((_, i) => i),
          schema: msg.schema,
          meta: msg.meta,
        };
        worker.terminate();
        resolve(dataset);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Worker error'));
    };

    worker.postMessage({ file, options });
  });
}
