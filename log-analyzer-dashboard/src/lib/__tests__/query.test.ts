import { describe, it, expect } from 'vitest';
import { parseQuery, filterRows } from '../query';

const cols = [
  { key: 'status', sourceName: 'HttpStatus', role: 'status', type: 'int' },
  { key: 'uri', sourceName: 'RequestUri', role: 'uri', type: 'url' },
  { key: 'method', sourceName: 'Method', role: 'method', type: 'string' },
  { key: 'ip', sourceName: 'ClientIp', role: 'client_ip', type: 'ip' },
  { key: 'latency', sourceName: 'TimeTaken', role: 'latency_ms', type: 'int' },
];

const rows = [
  { status: '200', uri: '/api/search', method: 'GET', ip: '10.0.0.1', latency: '50' },
  { status: '404', uri: '/api/missing', method: 'GET', ip: '10.0.0.2', latency: '10' },
  { status: '500', uri: '/api/error', method: 'POST', ip: '10.0.0.3', latency: '5000' },
  { status: '200', uri: '/home', method: 'GET', ip: '10.0.0.4', latency: '100' },
];

describe('parseQuery', () => {
  it('returns null for empty input', () => {
    expect(parseQuery('')).toEqual({ where: null, sort: null, errors: [] });
  });

  it('parses simple comparison', () => {
    const r = parseQuery('status >= 500');
    expect(r.errors).toEqual([]);
    expect(r.where).toEqual({ type: 'comparison', field: 'status', op: '>=', value: 500 });
  });

  it('parses string comparison', () => {
    const r = parseQuery('method = GET');
    expect(r.where).toEqual({ type: 'comparison', field: 'method', op: '=', value: 'GET' });
  });

  it('parses AND', () => {
    const r = parseQuery('status >= 400 AND method = GET');
    expect(r.where?.type).toBe('and');
  });

  it('parses OR', () => {
    const r = parseQuery('status = 404 OR status = 500');
    expect(r.where?.type).toBe('or');
  });

  it('parses NOT', () => {
    const r = parseQuery('NOT status = 200');
    expect(r.where?.type).toBe('not');
  });

  it('parses contains', () => {
    const r = parseQuery('uri contains "/api/"');
    expect(r.where).toEqual({ type: 'comparison', field: 'uri', op: 'contains', value: '/api/' });
  });

  it('parses IN list', () => {
    const r = parseQuery('status in (404, 500)');
    expect(r.where).toEqual({ type: 'comparison', field: 'status', op: 'in', value: [404, 500] });
  });

  it('parses sort clause', () => {
    const r = parseQuery('status >= 500 | sort by latency desc');
    expect(r.sort).toEqual({ field: 'latency', direction: 'desc' });
  });

  it('parses bracket-quoted field names', () => {
    const r = parseQuery("['HttpStatus'] >= 500");
    expect(r.where).toEqual({ type: 'comparison', field: 'HttpStatus', op: '>=', value: 500 });
  });

  it('reports errors for invalid syntax', () => {
    const r = parseQuery('status >=');
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('filterRows', () => {
  it('returns all rows for null expr', () => {
    expect(filterRows(rows, cols, null)).toEqual([0, 1, 2, 3]);
  });

  it('filters by status >= 500', () => {
    const q = parseQuery('status >= 500');
    expect(filterRows(rows, cols, q.where)).toEqual([2]);
  });

  it('filters by method = GET', () => {
    const q = parseQuery('method = GET');
    expect(filterRows(rows, cols, q.where)).toEqual([0, 1, 3]);
  });

  it('filters by uri contains', () => {
    const q = parseQuery('uri contains "/api/"');
    expect(filterRows(rows, cols, q.where)).toEqual([0, 1, 2]);
  });

  it('filters by AND', () => {
    const q = parseQuery('status >= 400 AND method = GET');
    expect(filterRows(rows, cols, q.where)).toEqual([1]);
  });

  it('filters by OR', () => {
    const q = parseQuery('status = 404 OR status = 500');
    expect(filterRows(rows, cols, q.where)).toEqual([1, 2]);
  });

  it('filters by NOT', () => {
    const q = parseQuery('NOT status = 200');
    expect(filterRows(rows, cols, q.where)).toEqual([1, 2]);
  });

  it('filters by IN', () => {
    const q = parseQuery('status in (404, 500)');
    expect(filterRows(rows, cols, q.where)).toEqual([1, 2]);
  });

  it('filters by bare term (free text)', () => {
    const q = parseQuery('api');
    expect(filterRows(rows, cols, q.where)).toEqual([0, 1, 2]);
  });

  it('is case-insensitive', () => {
    const q = parseQuery('METHOD = get');
    expect(filterRows(rows, cols, q.where)).toEqual([0, 1, 3]);
  });
});
