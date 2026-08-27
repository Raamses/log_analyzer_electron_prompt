import { describe, it, expect } from 'vitest';
import { parseQuery, filterRows, queryExprToString, removeClauseAt, removeClauseFromQuery } from '../query';

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

describe('queryExprToString', () => {
  it('serializes a simple comparison', () => {
    const q = parseQuery('status >= 500');
    expect(queryExprToString(q.where)).toBe('status >= 500');
  });

  it('serializes a string comparison with quotes', () => {
    const q = parseQuery('uri contains "/api/"');
    expect(queryExprToString(q.where)).toBe('uri contains "/api/"');
  });

  it('serializes an AND expression', () => {
    const q = parseQuery('status >= 400 AND method = GET');
    expect(queryExprToString(q.where)).toBe('status >= 400 AND method = GET');
  });

  it('serializes an OR expression', () => {
    const q = parseQuery('status = 404 OR status = 500');
    expect(queryExprToString(q.where)).toBe('status = 404 OR status = 500');
  });

  it('serializes a NOT expression', () => {
    const q = parseQuery('NOT status = 200');
    expect(queryExprToString(q.where)).toBe('NOT status = 200');
  });

  it('serializes an IN expression', () => {
    const q = parseQuery('status in (404, 500)');
    expect(queryExprToString(q.where)).toBe('status in (404, 500)');
  });

  it('serializes an IN expression with string values', () => {
    const q = parseQuery('method in (GET, POST)');
    expect(queryExprToString(q.where)).toBe('method in ("GET", "POST")');
  });

  it('serializes a bare term', () => {
    const q = parseQuery('api');
    expect(queryExprToString(q.where)).toBe('api');
  });

  it('returns empty string for null', () => {
    expect(queryExprToString(null)).toBe('');
  });
});

describe('removeClauseAt', () => {
  it('removes first clause from AND', () => {
    const q = parseQuery('status >= 400 AND method = GET');
    const result = removeClauseAt(q.where, 0);
    expect(queryExprToString(result)).toBe('method = GET');
  });

  it('removes second clause from AND', () => {
    const q = parseQuery('status >= 400 AND method = GET');
    const result = removeClauseAt(q.where, 1);
    expect(queryExprToString(result)).toBe('status >= 400');
  });

  it('removes first clause from OR', () => {
    const q = parseQuery('status = 404 OR status = 500');
    const result = removeClauseAt(q.where, 0);
    expect(queryExprToString(result)).toBe('status = 500');
  });

  it('removes the only clause (returns null)', () => {
    const q = parseQuery('status >= 500');
    const result = removeClauseAt(q.where, 0);
    expect(result).toBeNull();
  });

  it('removes a clause from a 3-way AND', () => {
    // status >= 400 AND method = GET AND uri contains "/api/"
    // With right-associative parsing: AND(status>=400, AND(method=GET, uri contains))
    // Leaves: [0]=status>=400, [1]=method=GET, [2]=uri contains
    const q = parseQuery('status >= 400 AND method = GET AND uri contains "/api/"');
    const result = removeClauseAt(q.where, 1);
    const str = queryExprToString(result);
    // Should contain status and uri but not method
    expect(str).toContain('status');
    expect(str).toContain('uri');
    expect(str).not.toContain('method');
  });

  it('removes a NOT-wrapped clause', () => {
    const q = parseQuery('NOT status = 200');
    const result = removeClauseAt(q.where, 0);
    expect(result).toBeNull();
  });

  it('removes clause from NOT within AND', () => {
    // status = 200 AND NOT method = POST
    // Leaves: [0]=status=200, [1]=method=POST (inside NOT)
    const q = parseQuery('status = 200 AND NOT method = POST');
    const result = removeClauseAt(q.where, 1);
    expect(queryExprToString(result)).toBe('status = 200');
  });

  it('removes bare term', () => {
    const q = parseQuery('api');
    const result = removeClauseAt(q.where, 0);
    expect(result).toBeNull();
  });

  it('returns null for null input', () => {
    expect(removeClauseAt(null, 0)).toBeNull();
  });
});

describe('removeClauseFromQuery', () => {
  it('removes first clause and preserves sort', () => {
    const query = 'status >= 400 AND method = GET | sort by latency desc';
    const result = removeClauseFromQuery(query, 0);
    expect(result).toBe('method = GET | sort by latency desc');
  });

  it('removes last clause and preserves sort', () => {
    const query = 'status >= 400 AND method = GET | sort by latency desc';
    const result = removeClauseFromQuery(query, 1);
    expect(result).toBe('status >= 400 | sort by latency desc');
  });

  it('removes the only clause, keeps sort', () => {
    const query = 'status >= 500 | sort by latency desc';
    const result = removeClauseFromQuery(query, 0);
    expect(result).toBe('| sort by latency desc');
  });

  it('removes the only clause, no sort', () => {
    const query = 'status >= 500';
    const result = removeClauseFromQuery(query, 0);
    expect(result).toBe('');
  });

  it('does not modify invalid queries', () => {
    const query = 'status >=';
    const result = removeClauseFromQuery(query, 0);
    expect(result).toBe(query);
  });
});
