// @paths lib/query-serialize
/**
 * serializeQuery — the inverse of parseQuery.
 *
 * Converts a QueryExpr AST back into query text. This is what enables
 * filter-chip removal: drop the node, re-serialize, push the new text
 * into the query bar. Round-trip property (tested): parse(serialize(ast))
 * must produce the same AST as parse(text).
 *
 * Formatting may differ from the original input (whitespace, quote style),
 * but the AST must be identical.
 */

import type { QueryExpr, ComparisonOp, SortClause, ParsedQuery } from './query';

const PRECEDENCE: Record<string, number> = {
  or: 0,
  and: 1,
  not: 2,
  comparison: 3,
  bareTerm: 3,
};

export function serializeQuery(parsed: ParsedQuery): string {
  const parts: string[] = [];
  if (parsed.where) {
    parts.push(serializeExpr(parsed.where, 0));
  }
  if (parsed.sort) {
    parts.push(serializeSort(parsed.sort));
  }
  return parts.join(' ');
}

function serializeSort(sort: SortClause): string {
  return `| sort by ${sort.field} ${sort.direction}`;
}

function serializeExpr(expr: QueryExpr, parentPrec: number): string {
  switch (expr.type) {
    case 'comparison': {
      const s = serializeComparison(expr);
      return parentPrec > PRECEDENCE.comparison ? `(${s})` : s;
    }
    case 'bareTerm': {
      const s = serializeBareTerm(expr.value);
      return parentPrec > PRECEDENCE.bareTerm ? `(${s})` : s;
    }
    case 'not': {
      const s = `NOT ${serializeExpr(expr.expr, PRECEDENCE.not)}`;
      return parentPrec > PRECEDENCE.not ? `(${s})` : s;
    }
    case 'and': {
      const s = `${serializeExpr(expr.left, PRECEDENCE.and)} AND ${serializeExpr(expr.right, PRECEDENCE.and)}`;
      return parentPrec > PRECEDENCE.and ? `(${s})` : s;
    }
    case 'or': {
      const s = `${serializeExpr(expr.left, PRECEDENCE.or)} OR ${serializeExpr(expr.right, PRECEDENCE.or)}`;
      return parentPrec > PRECEDENCE.or ? `(${s})` : s;
    }
  }
}

function serializeComparison(expr: { field: string; op: ComparisonOp; value: string | number | (string | number)[] }): string {
  const field = quoteFieldIfNeeded(expr.field);
  const op = expr.op;
  if (op === 'in') {
    const arr = expr.value as (string | number)[];
    return `${field} in (${arr.map(v => serializeValue(v)).join(', ')})`;
  }
  return `${field} ${op} ${serializeValue(expr.value)}`;
}

function serializeBareTerm(value: string): string {
  // bareTerm with spaces needs quoting
  if (/\s/.test(value)) return `"${value}"`;
  return value;
}

function serializeValue(value: string | number | (string | number)[]): string {
  if (Array.isArray(value)) return `(${value.map(serializeValue).join(', ')})`;
  if (typeof value === 'number') return String(value);
  // Quote if it contains spaces, parens, quotes, or special chars
  if (/[\s()"'|,]/.test(value)) return `"${value}"`;
  return value;
}

function quoteFieldIfNeeded(field: string): string {
  // KQL bracket syntax for fields with special characters
  if (/[^a-zA-Z0-9_-]/.test(field)) return `['${field}']`;
  return field;
}
