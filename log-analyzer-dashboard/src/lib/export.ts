// @paths lib/export
/**
 * Export utilities — CSV, JSON, TSV, clipboard.
 *
 * Privacy: export is the one place data leaves the app. We provide
 * redaction-on-export (mask IP octets, strip declared-sensitive query params).
 */

import type { Dataset, ColumnDef } from './types';

export type ExportFormat = 'csv' | 'tsv' | 'json' | 'ndjson';

export interface ExportOptions {
  format: ExportFormat;
  /** Column keys to include (in order). undefined = all visible. */
  columns?: string[];
  /** Row indices to export. undefined = all. */
  rows?: number[];
  /** Redact PII (IPs, query params). */
  redact?: boolean;
  /** Query param names to strip values for. */
  sensitiveParams?: string[];
}

const DEFAULT_SENSITIVE = ['token', 'key', 'secret', 'password', 'auth', 'session', 'cookie'];

/** Escape a CSV field per RFC4180. */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function tsvEscape(value: string): string {
  return value.replace(/\t/g, ' ').replace(/\n/g, ' ');
}

function maskIp(ip: string): string {
  // Mask last octet of IPv4, last 2 groups of IPv6
  if (ip.includes('.')) {
    const parts = ip.split('.');
    parts[parts.length - 1] = 'x';
    return parts.join('.');
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    parts[parts.length - 1] = 'xxxx';
    parts[parts.length - 2] = 'xxxx';
    return parts.join(':');
  }
  return ip;
}

function redactValue(value: string, col: ColumnDef, sensitive: Set<string>): string {
  if (col.role === 'client_ip') return maskIp(value);
  if (col.role === 'query') {
    return redactQueryString(value, sensitive);
  }
  if (col.role === 'uri') {
    // Also redact query params embedded in URIs
    const qIdx = value.indexOf('?');
    if (qIdx >= 0) {
      const base = value.slice(0, qIdx);
      const query = value.slice(qIdx + 1);
      return base + '?' + redactQueryString(query, sensitive);
    }
  }
  return value;
}

function redactQueryString(query: string, sensitive: Set<string>): string {
  try {
    const params = query.split('&');
    return params.map(p => {
      const [k] = p.split('=');
      if (k && sensitive.has(k.toLowerCase())) return `${k}=[REDACTED]`;
      return p;
    }).join('&');
  } catch { return query; }
}

export function exportDataset(dataset: Dataset, options: ExportOptions): string {
  const { format, redact = false, sensitiveParams = DEFAULT_SENSITIVE } = options;
  const sensitive = new Set(sensitiveParams);

  const columns = options.columns
    ? dataset.columns.filter(c => options.columns!.includes(c.key))
    : dataset.columns;

  const rowIndices = options.rows ?? Array.from({ length: dataset.rowCount }, (_, i) => i);

  const getVal = (rowIdx: number, col: ColumnDef): string => {
    const store = dataset.stores.get(col.key);
    const raw = String(store ? store.get(rowIdx) : '');
    return redact ? redactValue(raw, col, sensitive) : raw;
  };

  switch (format) {
    case 'csv': {
      const header = columns.map((c: ColumnDef) => csvEscape(c.label)).join(',');
      const lines = rowIndices.map((i: number) =>
        columns.map((c: ColumnDef) => csvEscape(getVal(i, c))).join(','),
      );
      return [header, ...lines].join('\n');
    }
    case 'tsv': {
      const header = columns.map((c: ColumnDef) => tsvEscape(c.label)).join('\t');
      const lines = rowIndices.map((i: number) =>
        columns.map((c: ColumnDef) => tsvEscape(getVal(i, c))).join('\t'),
      );
      return [header, ...lines].join('\n');
    }
    case 'json': {
      const data = rowIndices.map((i: number) => {
        const obj: Record<string, string> = {};
        for (const c of columns) obj[c.label] = getVal(i, c);
        return obj;
      });
      return JSON.stringify(data, null, 2);
    }
    case 'ndjson': {
      return rowIndices.map((i: number) => {
        const obj: Record<string, string> = {};
        for (const c of columns) obj[c.label] = getVal(i, c);
        return JSON.stringify(obj);
      }).join('\n');
    }
  }
}

/** Copy text to clipboard. */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

/** Download text as a file. */
export function downloadFile(content: string, filename: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Generate a permalink encoding view state in the URL hash. */
export function generatePermalink(state: {
  query?: string;
  sort?: { columnKey: string; direction: string };
  hiddenColumns?: string[];
}): string {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.sort && state.sort.direction !== 'none') {
    params.set('sort', `${state.sort.columnKey}:${state.sort.direction}`);
  }
  if (state.hiddenColumns?.length) {
    params.set('hide', state.hiddenColumns.join(','));
  }
  return `${window.location.origin}${window.location.pathname}#${params.toString()}`;
}

/** Parse a permalink back into view state. */
export function parsePermalink(hash: string): { query?: string; sort?: { columnKey: string; direction: string }; hiddenColumns?: string[] } {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const result: { query?: string; sort?: { columnKey: string; direction: string }; hiddenColumns?: string[] } = {};

  const q = params.get('q');
  if (q) result.query = q;

  const sort = params.get('sort');
  if (sort) {
    const [col, dir] = sort.split(':');
    result.sort = { columnKey: col, direction: dir };
  }

  const hide = params.get('hide');
  if (hide) result.hiddenColumns = hide.split(',');

  return result;
}
