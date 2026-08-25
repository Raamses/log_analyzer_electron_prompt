// @paths lib/columnar-filter
/**
 * Columnar query evaluation: recursive bitset walk over ColumnStore.
 *
 * Correctness rules (Phase 6 plan §3.4, hardened by Gemini's review):
 *   - Boolean precedence preserved by a recursive tree walk. We do NOT
 *     group leaf predicates by column — that destroys precedence.
 *   - NULL semantics: a comparison is FALSE for a missing value, so
 *     `NOT (status = 200)` must NOT match rows where status is missing.
 *     Achieved by pushing NOT to leaves (NNF / De Morgan) and masking with
 *     the presence bitset at each leaf.
 *   - Bits are bit-packed (1/row, Uint32Array) not 1 byte/row, to avoid
 *     multi-MB garbage per keystroke.
 *
 * Pure function over a minimal ColumnStore abstraction (unit-testable).
 */

import type { ColumnStore, DictColumn } from './columnstore';

export interface QueryLeaf {
  columnKey: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startswith' | 'matches';
  value: string;
  negated?: boolean;
}

export type ColumnarExpr =
  | { type: 'and'; left: ColumnarExpr; right: ColumnarExpr }
  | { type: 'or'; left: ColumnarExpr; right: ColumnarExpr }
  | { type: 'not'; expr: ColumnarExpr }
  | { type: 'leaf'; leaf: QueryLeaf };

/** Resolves a query field name to a column (or null if unknown). */
export type ColumnResolver = (name: string) => { col: ColumnStore; key: string } | null;

/**
 * Push NOT down to the leaves (Negation Normal Form) so presence-bitset
 * intersection happens at each leaf, not at compound subtrees. This fixes
 * the 3VL bug: NOT (A AND B) with A=false must be TRUE even when B is NULL.
 */
export function toNNF(expr: ColumnarExpr, negate = false): ColumnarExpr {
  switch (expr.type) {
    case 'leaf': {
      if (!negate) return expr;
      // NOT (col op v) -> negated leaf
      return { type: 'leaf', leaf: { ...expr.leaf, negated: !expr.leaf.negated } };
    }
    case 'not': {
      // NOT (X) -> X with negation flag flipped
      return toNNF(expr.expr, !negate);
    }
    case 'and': {
      if (!negate) return { type: 'and', left: toNNF(expr.left), right: toNNF(expr.right) };
      // NOT (A AND B) -> (NOT A) OR (NOT B)
      return { type: 'or', left: toNNF(expr.left, true), right: toNNF(expr.right, true) };
    }
    case 'or': {
      if (!negate) return { type: 'or', left: toNNF(expr.left), right: toNNF(expr.right) };
      // NOT (A OR B) -> (NOT A) AND (NOT B)
      return { type: 'and', left: toNNF(expr.left, true), right: toNNF(expr.right, true) };
    }
  }
}

/**
 * Evaluate an expression into a bitmask (1 bit/row, packed Uint32Array).
 * The expression is first converted to NNF so negation is leaf-local.
 */
export function evaluate(
  expr: ColumnarExpr,
  resolveCol: ColumnResolver,
  rowCount: number,
): Uint32Array {
  const nnf = toNNF(expr);
  const words = Math.max(1, Math.ceil(rowCount / 32));
  const mask = new Uint32Array(words);
  evalNode(nnf, resolveCol, rowCount, mask);
  // Mask off any bits beyond rowCount.
  const tail = rowCount % 32;
  if (tail !== 0) mask[words - 1] &= (1 << tail) - 1;
  return mask;
}

function evalNode(
  expr: ColumnarExpr,
  resolveCol: ColumnResolver,
  rowCount: number,
  out: Uint32Array,
): void {
  switch (expr.type) {
    case 'and':
    case 'or': {
      const l = new Uint32Array(out.length);
      const r = new Uint32Array(out.length);
      evalNode(expr.left, resolveCol, rowCount, l);
      evalNode(expr.right, resolveCol, rowCount, r);
      for (let i = 0; i < out.length; i++) {
        out[i] = expr.type === 'and' ? l[i] & r[i] : l[i] | r[i];
      }
      return;
    }
    case 'not':
      // Not reachable after toNNF; kept for exhaustive switch / safety.
      evalNode(expr.expr, resolveCol, rowCount, out);
      for (let i = 0; i < out.length; i++) out[i] = ~out[i];
      return;
    case 'leaf':
      evalLeaf(expr.leaf, resolveCol, rowCount, out);
      return;
  }
}

function evalLeaf(
  leaf: QueryLeaf,
  resolveCol: ColumnResolver,
  rowCount: number,
  out: Uint32Array,
): void {
  const resolved = resolveCol(leaf.columnKey);
  const negated = !!leaf.negated;

  if (!resolved) {
    // Unknown field: every present row satisfies a positive predicate
    // (mirrors filterRows' "unknown field = no filter"). Negated = none.
    if (!negated) {
      for (let i = 0; i < out.length; i++) out[i] = 0xffffffff;
    }
    return;
  }
  const { col } = resolved;

  // Build positive mask first.
  const pos = new Uint32Array(out.length);
  fillPositive(col, leaf, rowCount, pos);

  // Which columns track a presence bitset? int32 does (for null tracking).
  const hasPresence = col.type === 'int32';

  if (!negated) {
    if (hasPresence) {
      const pres = presenceWordMask(col, out.length);
      for (let i = 0; i < out.length; i++) out[i] = pos[i] & pres[i];
    } else {
      out.set(pos);
    }
    return;
  }

  // Negated: NOT (col op v). NULL must be FALSE, so (NOT pos) AND present.
  if (hasPresence) {
    const pres = presenceWordMask(col, out.length);
    for (let i = 0; i < out.length; i++) out[i] = ~pos[i] & pres[i];
  } else {
    for (let i = 0; i < out.length; i++) out[i] = ~pos[i];
  }
}

/** Compute a packed presence word-mask for a column (1 = present). */
function presenceWordMask(col: ColumnStore, words: number): Uint32Array {
  const out = new Uint32Array(words);
  const n = col.length;
  for (let row = 0; row < n; row++) {
    if (col.getValue(row) !== null) {
      out[row >>> 5] |= 1 << (row & 31);
    }
  }
  return out;
}

function fillPositive(
  col: ColumnStore,
  leaf: QueryLeaf,
  rowCount: number,
  out: Uint32Array,
): void {
  const n = Math.min(rowCount, col.length);
  const op = leaf.op;
  const val = leaf.value;

  // Dict columns: resolve the string to a code once, then scan codes.
  if (col.type === 'dict') {
    const dict = col as DictColumn;
    const code = dict.dictionary.indexOf(val);
    for (let row = 0; row < n; row++) {
      const c = dict.getValue(row);
      if (c === null) continue;
      let hit = false;
      switch (op) {
        case 'eq': hit = c === code; break;
        case 'neq': hit = c !== code; break;
        case 'contains': hit = dict.get(row)!.indexOf(val) >= 0; break;
        case 'startswith': hit = dict.get(row)!.startsWith(val); break;
        case 'matches': hit = new RegExp(val).test(dict.get(row)!); break;
        default: hit = false;
      }
      if (hit) out[row >>> 5] |= 1 << (row & 31);
    }
    return;
  }

  for (let row = 0; row < n; row++) {
    const raw = col.get(row);
    if (raw === null || raw === undefined) continue;
    let hit = false;
    switch (op) {
      case 'eq':
      case 'neq': {
        const num = Number(raw);
        const target = Number(val);
        const eq = num === target || String(raw) === val;
        hit = op === 'eq' ? eq : !eq;
        break;
      }
      case 'gt': hit = Number(raw) > Number(val); break;
      case 'gte': hit = Number(raw) >= Number(val); break;
      case 'lt': hit = Number(raw) < Number(val); break;
      case 'lte': hit = Number(raw) <= Number(val); break;
      case 'contains': hit = String(raw).indexOf(val) >= 0; break;
      case 'startswith': hit = String(raw).startsWith(val); break;
      case 'matches': hit = new RegExp(val).test(String(raw)); break;
      default: hit = false;
    }
    if (hit) out[row >>> 5] |= 1 << (row & 31);
  }
}

/** Convert a bitmask to an array of set row indices. */
export function maskToIndices(mask: Uint32Array): number[] {
  const out: number[] = [];
  for (let w = 0; w < mask.length; w++) {
    let bits = mask[w];
    let row = w << 5;
    while (bits) {
      const b = bits & -bits;
      // position of the lowest set bit
      const bit = 31 - Math.clz32(b);
      out.push(row + bit);
      bits &= bits - 1;
    }
  }
  return out;
}
