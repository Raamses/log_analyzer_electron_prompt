// @paths lib/__tests__/query-serialize.test.ts
import { describe, it, expect } from 'vitest';
import { serializeQuery } from '../query-serialize';
import { parseQuery } from '../query';

describe('serializeQuery', () => {
  it('serializes a simple comparison', () => {
    const q = parseQuery('status = 200');
    expect(serializeQuery(q)).toBe('status = 200');
  });

  it('serializes AND', () => {
    const q = parseQuery('status = 200 AND method = GET');
    const s = serializeQuery(q);
    expect(s).toContain('AND');
    expect(s).toContain('status = 200');
    expect(s).toContain('method = GET');
  });

  it('serializes NOT', () => {
    const q = parseQuery('NOT status = 200');
    expect(serializeQuery(q)).toBe('NOT status = 200');
  });

  it('serializes sort clause', () => {
    const q = parseQuery('status >= 500 | sort by latency desc');
    expect(serializeQuery(q)).toContain('status >= 500');
    expect(serializeQuery(q)).toContain('| sort by latency desc');
  });

  it('round-trips: parse(serialize(parse(text))) === parse(text)', () => {
    const texts = [
      'status >= 500',
      'status = 200 AND method = GET',
      'NOT status = 200',
      'uri contains "/api/" OR uri contains "/img/"',
      'status >= 400 AND uri contains "/api/" | sort by latency desc',
      'client_ip in (10.0.0.1, 10.0.0.2)',
    ];
    for (const text of texts) {
      const first = parseQuery(text);
      const serialized = serializeQuery(first);
      const second = parseQuery(serialized);
      expect(second).toEqual(first);
    }
  });

  it('quotes fields with special chars using bracket syntax', () => {
    // Field with parens needs bracket syntax
    const q = parseQuery("['cs(User-Agent)'] = 'Mozilla/5.0'");
    const s = serializeQuery(q);
    expect(s).toContain("['cs(User-Agent)']");
  });

  it('quotes values with spaces', () => {
    const q = parseQuery('uri contains "/search query"');
    const s = serializeQuery(q);
    expect(s).toContain('"/search query"');
  });
});

describe('removeClause', () => {
  it('removes a leaf from an AND expression', () => {
    const q = parseQuery('status = 200 AND method = GET');
    if (!q.where || q.where.type !== 'and') throw new Error('expected and');
    // Drop the left leaf, re-serialize the right
    const remaining = serializeQuery({ ...q, where: q.where.right });
    expect(remaining).toBe('method = GET');
  });
});
