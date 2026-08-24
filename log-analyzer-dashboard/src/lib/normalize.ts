// @paths lib/normalize
/**
 * Pure normalization functions for ingest.
 *
 * Extracted from the worker so they can be unit tested without a Worker
 * context. The worker imports these; they have no side effects.
 */

import type { ColumnDef, Schema, Role } from '../types';

/* ───────────────────────── timestamp parsing (TZ-safe) ─────────────────────── */

/**
 * Parse a timestamp cell to UTC epoch ms.
 *
 * Avoids `new Date(string)` because it assumes local timezone for ambiguous
 * inputs (e.g. "2025-10-26 14:23:50" → local, not UTC). Each format is
 * handled explicitly instead.
 */
export function parseTimestamp(raw: string, timezone: string): number {
  if (!raw || raw === '-') return NaN;

  // Unix epoch ms
  if (/^\d{13}$/.test(raw)) return parseInt(raw, 10);
  // Unix epoch s
  if (/^\d{10}$/.test(raw)) return parseInt(raw, 10) * 1000;

  // ISO 8601: 2025-10-26T14:23:50.000Z or 2025-10-26T14:23:50+03:00
  const iso = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (iso) {
    const [, y, mo, d, h, mi, s, tz] = iso;
    const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    if (!tz || tz === 'Z') return ms;
    const sign = tz[0] === '+' ? 1 : -1;
    const [oh, om] = tz.slice(1).split(':');
    return ms - sign * (+oh * 60 + +om) * 60_000;
  }

  // Apache CLF: 10/Oct/2000:13:55:36 -0700
  const clf = raw.match(
    /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/,
  );
  if (clf) {
    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const [, d, mo, y, h, mi, s, off] = clf;
    const ms = Date.UTC(+y, months[mo], +d, +h, +mi, +s);
    const sign = off[0] === '+' ? 1 : -1;
    return ms - sign * (+off.slice(1, 3) * 60 + +off.slice(3, 5)) * 60_000;
  }

  // Azure APGW: "10/26/2025, 2:23:50.000 PM" (en-US, 12h)
  const az = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(AM|PM)$/i,
  );
  if (az) {
    const [, mo, d, y, h, mi, s, ampm] = az;
    let hours = +h;
    if (ampm?.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm?.toUpperCase() === 'AM' && hours === 12) hours = 0;
    return Date.UTC(+y, +mo - 1, +d, hours, +mi, +s);
  }

  // IIS: "2025-10-26 14:23:50" (treat as UTC per W3C spec)
  const iis = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/);
  if (iis) {
    const [, y, mo, d, h, mi, s] = iis;
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  }

  return NaN;
}

/* ───────────────────────── cell normalization ───────────────────────── */

export function normalizeCell(
  raw: string,
  role: Role,
  unit: 'ms' | 's' | 'us' | 'bytes' | undefined,
  timezone: string,
): string {
  if (!raw || raw === '-') return '';

  switch (role) {
    case 'timestamp': {
      const ms = parseTimestamp(raw, timezone);
      return isNaN(ms) ? '' : String(ms);
    }
    case 'latency_ms': {
      const v = parseFloat(raw);
      if (isNaN(v)) return '';
      if (unit === 's') return String(Math.round(v * 1000));
      if (unit === 'us') return String(Math.round(v / 1000));
      return String(Math.round(v));
    }
    default:
      return raw;
  }
}

/** Normalize one raw row against the schema. */
export function normalizeRow(
  rawCells: string[],
  columns: ColumnDef[],
  schema: Schema,
): string[] {
  const normRow: string[] = new Array(columns.length).fill('');
  for (const col of columns) {
    const raw = rawCells[col.index] ?? '';
    const bind = schema.bindings.find(b => b.columnKey === col.key);
    normRow[col.index] = normalizeCell(raw, col.role, bind?.unit, schema.timezone);
  }
  return normRow;
}
