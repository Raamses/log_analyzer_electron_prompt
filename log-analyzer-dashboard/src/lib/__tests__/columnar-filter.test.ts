// @paths lib/__tests__/columnar-filter.test.ts
import { describe, it, expect } from 'vitest';
import { Int32ColumnStore, Float64ColumnStore, DictColumnStore, StringColumnStore } from '../columnstore';
import { evaluate, toNNF, maskToIndices, type ColumnarExpr } from '../columnar-filter';
import type { ColumnStore } from '../columnstore';

/** Build a resolver from a column keyed map. */
function resolver(cols: Record<string, ColumnStore>) {
  return (name: string): { col: ColumnStore; key: string } | null =>
    cols[name] ? { col: cols[name], key: name } : null;
}

function makeStatus(): Int32ColumnStore {
  const c = new Int32ColumnStore();
  // rows: [200, 500, 404, null(unset), 200, 500]
  c.set(0, 200); c.set(1, 500); c.set(2, 404); c.set(4, 200); c.set(5, 500);
  return c;
}

function makeUri(): DictColumnStore {
  const c = new DictColumnStore();
  c.set(0, '/api/x'); c.set(1, '/api/x'); c.set(2, '/img/a.png');
  c.set(3, '/api/x'); c.set(4, '/api/y'); c.set(5, '/img/b.png');
  return c;
}

describe('evaluate — equality on status column', () => {
  it('matches status = 200', () => {
    const st = makeStatus();
    const m = evaluate(
      { type: 'leaf', leaf: { columnKey: 'st', op: 'eq', value: '200' } },
      resolver({ st }), 6);
    expect(maskToIndices(m)).toEqual([0, 4]);
  });

  it('matches status != 200 (excludes null)', () => {
    const st = makeStatus();
    const m = evaluate(
      { type: 'leaf', leaf: { columnKey: 'st', op: 'neq', value: '200' } },
      resolver({ st }), 6,
    );
    // rows 1(500),2(404),5(500). Row 3 is NULL -> excluded.
    expect(maskToIndices(m)).toEqual([1, 2, 5]);
  });
});

describe('NULL semantics in NOT (3VL)', () => {
  it('NOT (status = 500 AND uri contains /api/) — row with status=200 but NULL uri', () => {
    // status: row0=200, row1=500, row2=200
    // uri:    row0=null(missing), row1=/api/x, row2=/api/y
    const st = new Int32ColumnStore();
    st.set(0, 200); st.set(1, 500); st.set(2, 200);
    const uri = new DictColumnStore();
    uri.set(1, '/api/x'); uri.set(2, '/api/y');

    const inner: ColumnarExpr = {
      type: 'and',
      left: { type: 'leaf', leaf: { columnKey: 'st', op: 'eq', value: '500' } },
      right: { type: 'leaf', leaf: { columnKey: 'uri', op: 'contains', value: '/api' } },
    };
    const notExpr: ColumnarExpr = {
      type: 'not',
      expr: inner,
    };

    const m = evaluate(notExpr, resolver({ st, uri }), 3);
    // row0: st=200 (not 500) -> NOT(inner)=TRUE
    // row1: st=500 AND uri=/api/x -> inner TRUE -> NOT=FALSE
    // row2: st=200 -> inner FALSE -> NOT=TRUE
    expect(maskToIndices(m)).toEqual([0, 2]);
  });
});

describe('boolean precedence (NOT grouped by column would break)', () => {
  it('(A AND B) OR (C AND D) — same columns on both branches', () => {
    const st = new Int32ColumnStore();
    // row0: 500, /api
    // row1: 500, /img
    // row2: 404, /api
    // row3: 404, /img
    st.set(0, 500); st.set(1, 500); st.set(2, 404); st.set(3, 404);
    const uri = new DictColumnStore();
    uri.set(0, '/api/x'); uri.set(1, '/img'); uri.set(2, '/api/x'); uri.set(3, '/img');

    const expr: ColumnarExpr = {
      type: 'or',
      left: {
        type: 'and',
        left: { type: 'leaf', leaf: { columnKey: 'st', op: 'eq', value: '500' } },
        right: { type: 'leaf', leaf: { columnKey: 'uri', op: 'contains', value: '/api' } },
      },
      right: {
        type: 'and',
        left: { type: 'leaf', leaf: { columnKey: 'st', op: 'eq', value: '404' } },
        right: { type: 'leaf', leaf: { columnKey: 'uri', op: 'contains', value: '/img' } },
      },
    };
    const m = evaluate(expr, resolver({ st, uri }), 4);
    // row0: 500 AND /api -> TRUE
    // row1: 500 AND /img -> false branch1; 404?no -> false -> FALSE
    // row2: 404 AND /api -> false branch1; 404 AND /img? no -> FALSE
    // row3: 404 AND /img -> TRUE
    expect(maskToIndices(m)).toEqual([0, 3]);
  });
});

describe('dict-column equality via code', () => {
  it('matches exact dictionary value', () => {
    const uri = new DictColumnStore();
    uri.set(0, '/a'); uri.set(1, '/b'); uri.set(2, '/a');
    const m = evaluate(
      { type: 'leaf', leaf: { columnKey: 'uri', op: 'eq', value: '/a' } },
      resolver({ uri }), 3,
    );
    expect(maskToIndices(m)).toEqual([0, 2]);
  });
});

describe('string contains', () => {
  it('matches substring', () => {
    const ua = new StringColumnStore();
    ua.set(0, 'Mozilla/5.0'); ua.set(1, 'Googlebot'); ua.set(2, 'Mozilla/5.0');
    const m = evaluate(
      { type: 'leaf', leaf: { columnKey: 'ua', op: 'contains', value: 'bot' } },
      resolver({ ua }), 3,
    );
    expect(maskToIndices(m)).toEqual([1]);
  });
});

describe('maskToIndices', () => {
  it('extracts set bit positions across words', () => {
    // rows 0, 3, 33 (word1 bit1)
    const mask = new Uint32Array(2);
    mask[0] = (1 << 0) | (1 << 3);
    mask[1] = (1 << 1);
    expect(maskToIndices(mask)).toEqual([0, 3, 33]);
  });

  it('empty mask', () => {
    expect(maskToIndices(new Uint32Array(2))).toEqual([]);
  });
});

describe('NNF translation', () => {
  it('de-morgans NOT (A AND B) to (NOT A) OR (NOT B)', () => {
    const a = { type: 'leaf' as const, leaf: { columnKey: 'a', op: 'eq' as const, value: '1' } };
    const b = { type: 'leaf' as const, leaf: { columnKey: 'b', op: 'eq' as const, value: '2' } };
    const inner: ColumnarExpr = { type: 'and', left: a, right: b };
    const notExpr: ColumnarExpr = { type: 'not', expr: inner };
    const nnf = toNNF(notExpr);
    expect(nnf.type).toBe('or');
    if (nnf.type !== 'or') return;
    const left2 = nnf.left as ColumnarExpr;
    const right2 = nnf.right as ColumnarExpr;
    expect(left2.type).toBe('leaf');
    expect((left2 as { leaf: { negated?: boolean } }).leaf.negated).toBe(true);
    expect(right2.type).toBe('leaf');
    expect((right2 as { leaf: { negated?: boolean } }).leaf.negated).toBe(true);
  });
});
