// @paths components
/**
 * FilterChips — visual query builder that writes into the query bar.
 *
 * Each chip is a clause (status >= 500, uri contains "/api/", etc.).
 * Clicking a chip removes it. The chips and query bar share one AST
 * (single source of truth).
 */

import { useMemo } from 'react';
import { parseQuery, type QueryExpr, type Comparison } from '../lib/query';

interface FilterChipsProps {
  query: string;
  onRemoveClause: (index: number) => void;
  onClearAll: () => void;
}

function getComparisonLabel(expr: Comparison): string {
  const field = expr.field;
  const op = expr.op;
  const value = Array.isArray(expr.value) ? `(${expr.value.join(', ')})` : String(expr.value);
  return `${field} ${op} ${value}`;
}

function extractComparisons(expr: QueryExpr | null): { label: string; expr: Comparison }[] {
  if (!expr) return [];
  const results: { label: string; expr: Comparison }[] = [];

  const walk = (e: QueryExpr) => {
    switch (e.type) {
      case 'comparison':
        results.push({ label: getComparisonLabel(e), expr: e });
        break;
      case 'and':
        walk(e.left);
        walk(e.right);
        break;
      case 'or':
        walk(e.left);
        walk(e.right);
        break;
      case 'not':
        walk(e.expr);
        break;
      case 'bareTerm':
        results.push({ label: `contains "${e.value}"`, expr: { type: 'comparison', field: '*', op: 'contains', value: e.value } });
        break;
    }
  };

  walk(expr);
  return results;
}

export const FilterChips = ({ query, onRemoveClause, onClearAll }: FilterChipsProps) => {
  const comparisons = useMemo(() => {
    const parsed = parseQuery(query);
    return extractComparisons(parsed.where);
  }, [query]);

  if (comparisons.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/30 border-b border-slate-900 flex-wrap">
      <span className="text-xs text-slate-500 font-semibold">Filters:</span>
      {comparisons.map((c, i) => (
        <span
          key={`${c.label}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs rounded cursor-pointer hover:bg-indigo-500/20 transition-colors"
          onClick={() => onRemoveClause(i)}
          title="Click to remove"
        >
          {c.label}
          <span className="text-indigo-500 hover:text-indigo-300">✕</span>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer"
      >
        Clear all
      </button>
    </div>
  );
};
