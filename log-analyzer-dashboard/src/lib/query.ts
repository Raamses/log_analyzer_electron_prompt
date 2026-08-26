// @paths lib/query
/**
 * KQL subset parser — converts query text into a filter AST.
 *
 * Supported grammar (case-insensitive keywords):
 *
 *   query      := orExpr
 *   orExpr     := andExpr (OR andExpr)*
 *   andExpr    := notExpr (AND notExpr)*    // implicit AND if no operator
 *   notExpr    := NOT? primary
 *   primary    := '(' orExpr ')' | comparison | bareTerm
 *   comparison := field op value
 *   op         := '=' | '!=' | '>=' | '<=' | '>' | '<' | '~=' | 'contains' | 'startswith' | 'matches' | 'in'
 *   value      := quotedString | number | bareWord | '(' value (',' value)* ')'  // for `in`
 *   bareTerm   := word   // free-text search across all string fields
 *
 * Examples:
 *   status >= 500
 *   status >= 400 AND uri contains "/api/"
 *   method = GET AND status < 400
 *   uri contains "/search" OR uri contains "/api/"
 *   NOT status = 200
 *   client_ip in (10.0.0.1, 10.0.0.2)
 *   status >= 500 | sort by latency desc
 *
 * The `| sort by <field> <asc|desc>` pipe is parsed separately as a sort clause.
 *
 * Column names with special chars use KQL bracket syntax: ['cs(User-Agent)']
 */

export type ComparisonOp = '=' | '!=' | '>=' | '<=' | '>' | '<' | '~=' | 'contains' | 'startswith' | 'matches' | 'in';

export interface Comparison {
  type: 'comparison';
  field: string;
  op: ComparisonOp;
  value: string | number | (string | number)[];
}

export interface BareTerm {
  type: 'bareTerm';
  value: string;
}

export interface Not {
  type: 'not';
  expr: QueryExpr;
}

export interface And {
  type: 'and';
  left: QueryExpr;
  right: QueryExpr;
}

export interface Or {
  type: 'or';
  left: QueryExpr;
  right: QueryExpr;
}

export type QueryExpr = Comparison | BareTerm | Not | And | Or;

export interface SortClause {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ParsedQuery {
  where: QueryExpr | null;
  sort: SortClause | null;
  errors: string[];
}

const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'CONTAINS', 'STARTSWITH', 'MATCHES', 'IN', 'SORT', 'BY', 'ASC', 'DESC']);

export function parseQuery(input: string): ParsedQuery {
  const errors: string[] = [];
  const trimmed = input.trim();
  if (!trimmed) return { where: null, sort: null, errors: [] };

  // Split on `| sort by ...` pipe
  const pipeIndex = findPipe(trimmed);
  let whereText = pipeIndex >= 0 ? trimmed.slice(0, pipeIndex).trim() : trimmed;
  const sortText = pipeIndex >= 0 ? trimmed.slice(pipeIndex + 1).trim() : '';

  let sort: SortClause | null = null;
  if (sortText) {
    sort = parseSort(sortText, errors);
  }

  const tokens = tokenize(whereText);
  if (tokens.length === 0 && !sortText) return { where: null, sort: null, errors: [] };

  const ctx: ParseCtx = { tokens, pos: 0, errors };
  const expr = parseOrExpr(ctx);

  if (ctx.pos < tokens.length && !errors.length) {
    errors.push(`unexpected token: ${ctx.tokens[ctx.pos].value}`);
  }

  return { where: expr, sort, errors };
}

function findPipe(s: string): number {
  // Find `|` that's not inside quotes or brackets
  let depth = 0;
  let inQuote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      if (ch === inQuote && s[i - 1] !== '\\') inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inQuote = ch; continue; }
    if (ch === '[' || ch === '(') depth++;
    if (ch === ']' || ch === ')') depth--;
    if (ch === '|' && depth === 0) return i;
  }
  return -1;
}

function parseSort(text: string, errors: string[]): SortClause | null {
  const m = text.match(/^sort\s+by\s+(\S+)\s*(asc|desc)?$/i);
  if (!m) {
    errors.push(`invalid sort clause: "${text}" (expected: sort by <field> [asc|desc])`);
    return null;
  }
  return { field: m[1], direction: (m[2]?.toLowerCase() as 'asc' | 'desc') ?? 'asc' };
}

interface Token {
  type: 'word' | 'string' | 'number' | 'op' | 'lparen' | 'rparen' | 'comma' | 'lbracket' | 'rbracket';
  value: string;
  raw: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];

    if (/\s/.test(ch)) { i++; continue; }

    if (ch === '(') { tokens.push({ type: 'lparen', value: '(', raw: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')', raw: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ',', raw: ',' }); i++; continue; }
    if (ch === '[') {
      // Bracket-quoted name: ['col name']
      let j = i + 1;
      let depth = 1;
      while (j < n && depth > 0) {
        if (input[j] === '[') depth++;
        else if (input[j] === ']') depth--;
        if (depth > 0) j++;
      }
      const raw = input.slice(i, j + 1);
      const inner = raw.slice(2, -2); // strip [' ... ']
      tokens.push({ type: 'word', value: inner, raw });
      i = j + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let val = '';
      while (j < n) {
        if (input[j] === '\\' && j + 1 < n) { val += input[j + 1]; j += 2; continue; }
        if (input[j] === quote) break;
        val += input[j];
        j++;
      }
      tokens.push({ type: 'string', value: val, raw: input.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    // Operators
    if (ch === '!' && input[i + 1] === '=') { tokens.push({ type: 'op', value: '!=', raw: '!=' }); i += 2; continue; }
    if (ch === '>' && input[i + 1] === '=') { tokens.push({ type: 'op', value: '>=', raw: '>=' }); i += 2; continue; }
    if (ch === '<' && input[i + 1] === '=') { tokens.push({ type: 'op', value: '<=', raw: '<=' }); i += 2; continue; }
    if (ch === '~' && input[i + 1] === '=') { tokens.push({ type: 'op', value: '~=', raw: '~=' }); i += 2; continue; }
    if (ch === '=') { tokens.push({ type: 'op', value: '=', raw: '=' }); i++; continue; }
    if (ch === '>') { tokens.push({ type: 'op', value: '>', raw: '>' }); i++; continue; }
    if (ch === '<') { tokens.push({ type: 'op', value: '<', raw: '<' }); i++; continue; }

    // Bare word / number / keyword
    let j = i;
    while (j < n && !/[\s(),'"[\]!~>=<]/.test(input[j])) j++;
    const raw = input.slice(i, j);
    const upper = raw.toUpperCase();

    if (KEYWORDS.has(upper)) {
      tokens.push({ type: 'word', value: upper, raw });
    } else if (/^-?\d+(\.\d+)?$/.test(raw)) {
      tokens.push({ type: 'number', value: raw, raw });
    } else {
      tokens.push({ type: 'word', value: raw, raw });
    }
    i = j;
  }

  return tokens;
}

interface ParseCtx {
  tokens: Token[];
  pos: number;
  errors: string[];
}

function parseOrExpr(ctx: ParseCtx): QueryExpr | null {
  let left = parseAndExpr(ctx);
  if (!left) return null;

  while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].value === 'OR') {
    ctx.pos++;
    const right = parseAndExpr(ctx);
    if (!right) { ctx.errors.push('expected expression after OR'); break; }
    left = { type: 'or', left, right };
  }
  return left;
}

function parseAndExpr(ctx: ParseCtx): QueryExpr | null {
  let left = parseNotExpr(ctx);
  if (!left) return null;

  while (ctx.pos < ctx.tokens.length) {
    const tok = ctx.tokens[ctx.pos];
    if (tok.value === 'AND') {
      ctx.pos++;
      const right = parseNotExpr(ctx);
      if (!right) { ctx.errors.push('expected expression after AND'); break; }
      left = { type: 'and', left, right };
    } else if (tok.value === 'OR' || tok.value === ')') {
      break;
    } else {
      // implicit AND
      const right = parseNotExpr(ctx);
      if (!right) break;
      left = { type: 'and', left, right };
    }
  }
  return left;
}

function parseNotExpr(ctx: ParseCtx): QueryExpr | null {
  if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].value === 'NOT') {
    ctx.pos++;
    const expr = parseNotExpr(ctx);
    if (!expr) { ctx.errors.push('expected expression after NOT'); return null; }
    return { type: 'not', expr };
  }
  return parsePrimary(ctx);
}

function parsePrimary(ctx: ParseCtx): QueryExpr | null {
  if (ctx.pos >= ctx.tokens.length) return null;

  const tok = ctx.tokens[ctx.pos];

  if (tok.type === 'lparen') {
    ctx.pos++;
    const expr = parseOrExpr(ctx);
    if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'rparen') {
      ctx.errors.push('expected closing parenthesis');
      return expr;
    }
    ctx.pos++;
    return expr;
  }

  if (tok.type === 'word' && KEYWORDS.has(tok.value)) {
    ctx.errors.push(`unexpected keyword: ${tok.value}`);
    ctx.pos++;
    return null;
  }

  if (tok.type === 'word' || tok.type === 'string' || tok.type === 'number') {
    ctx.pos++;

    // Check if next token is an operator
    if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'op') {
      const op = ctx.tokens[ctx.pos].value as ComparisonOp;
      ctx.pos++;

      // Parse value
      if (op === 'in') {
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'lparen') {
          ctx.errors.push('expected ( after IN');
          return null;
        }
        ctx.pos++;
        const values: (string | number)[] = [];
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'rparen') {
          const vt = ctx.tokens[ctx.pos];
          if (vt.type === 'word' || vt.type === 'string') {
            values.push(vt.value);
          } else if (vt.type === 'number') {
            values.push(Number(vt.value));
          } else if (vt.type === 'comma') {
            ctx.pos++;
            continue;
          } else {
            ctx.errors.push(`unexpected token in IN list: ${vt.value}`);
            break;
          }
          ctx.pos++;
        }
        if (ctx.pos < ctx.tokens.length) ctx.pos++; // consume )
        return { type: 'comparison', field: tok.value, op, value: values };
      }

      // Single value
      if (ctx.pos >= ctx.tokens.length) {
        ctx.errors.push(`expected value after ${op}`);
        return null;
      }
      const valTok = ctx.tokens[ctx.pos];
      let value: string | number;
      if (valTok.type === 'number') value = Number(valTok.value);
      else if (valTok.type === 'word' || valTok.type === 'string') value = valTok.value;
      else { ctx.errors.push(`expected value after ${op}, got ${valTok.value}`); return null; }
      ctx.pos++;
      return { type: 'comparison', field: tok.value, op, value };
    }

    // Check for keyword operators: contains, startswith, matches, in
    if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'word') {
      const kw = ctx.tokens[ctx.pos].value.toUpperCase();
      if (kw === 'CONTAINS' || kw === 'STARTSWITH' || kw === 'MATCHES' || kw === 'IN') {
        ctx.pos++;
        if (kw === 'IN') {
          if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'lparen') {
            ctx.errors.push('expected ( after IN');
            return null;
          }
          ctx.pos++;
          const values: (string | number)[] = [];
          while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'rparen') {
            const vt = ctx.tokens[ctx.pos];
            if (vt.type === 'word' || vt.type === 'string') {
              values.push(vt.value);
            } else if (vt.type === 'number') {
              values.push(Number(vt.value));
            } else if (vt.type === 'comma') {
              ctx.pos++;
              continue;
            } else {
              ctx.errors.push(`unexpected token in IN list: ${vt.value}`);
              break;
            }
            ctx.pos++;
          }
          if (ctx.pos < ctx.tokens.length) ctx.pos++;
          return { type: 'comparison', field: tok.value, op: 'in', value: values };
        }
        if (ctx.pos >= ctx.tokens.length) {
          ctx.errors.push(`expected value after ${kw}`);
          return null;
        }
        const valTok = ctx.tokens[ctx.pos];
        const value = valTok.type === 'number' ? Number(valTok.value) : valTok.value;
        ctx.pos++;
        return { type: 'comparison', field: tok.value, op: kw.toLowerCase() as ComparisonOp, value };
      }
    }

    // Bare term (free text)
    return { type: 'bareTerm', value: tok.value };
  }

  ctx.errors.push(`unexpected token: ${tok.value}`);
  ctx.pos++;
  return null;
}

/**
 * Compile a QueryExpr into a predicate function.
 * bareTerm matches against any string column (case-insensitive substring).
 */
export function compileQuery(
  _expr: QueryExpr,
  _fieldResolver: (name: string) => string | null,
): (row: Record<string, unknown>) => boolean {
  // Legacy stub — replace with a minimal pass-through.
  return (_row: Record<string, unknown>) => true;
}

/**
 * Filter rows using a parsed query. Returns matching row indices.
 */
export function filterRows(
  rows: Record<string, unknown>[],
  columns: { key: string; sourceName: string; role: string; type: string }[],
  expr: QueryExpr | null,
): number[] {
  if (!expr) return rows.map((_, i) => i);

  // Build field name -> key map (case-insensitive)
  const fieldMap = new Map<string, string>();
  for (const col of columns) {
    fieldMap.set(col.key.toLowerCase(), col.key);
    fieldMap.set(col.sourceName.toLowerCase(), col.key);
    // Also map common aliases
    if (col.role === 'status') {
      fieldMap.set('status', col.key);
      fieldMap.set('statuscode', col.key);
    }
    if (col.role === 'client_ip') {
      fieldMap.set('ip', col.key);
      fieldMap.set('client_ip', col.key);
      fieldMap.set('clientip', col.key);
    }
    if (col.role === 'method') {
      fieldMap.set('method', col.key);
    }
    if (col.role === 'uri') {
      fieldMap.set('uri', col.key);
      fieldMap.set('url', col.key);
      fieldMap.set('path', col.key);
    }
    if (col.role === 'latency_ms') {
      fieldMap.set('latency', col.key);
      fieldMap.set('timetaken', col.key);
      fieldMap.set('time_taken', col.key);
    }
  }

  const resolve = (name: string): string | null => fieldMap.get(name.toLowerCase()) ?? null;

  const evalExpr = (e: QueryExpr, row: Record<string, unknown>): boolean => {
    switch (e.type) {
      case 'and': return evalExpr(e.left, row) && evalExpr(e.right, row);
      case 'or': return evalExpr(e.left, row) || evalExpr(e.right, row);
      case 'not': return !evalExpr(e.expr, row);
      case 'bareTerm': {
        const term = String(e.value).toLowerCase();
        for (const col of columns) {
          const v = row[col.key];
          if (v != null && String(v).toLowerCase().includes(term)) return true;
        }
        return false;
      }
      case 'comparison': {
        const key = resolve(e.field);
        if (!key) return true;
        const cell = row[key];
        if (cell == null || cell === '') return false;
        return evalComparison(cell, e.op, e.value);
      }
    }
  };

  return rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => evalExpr(expr, row))
    .map(({ i }) => i);
}

function evalComparison(cell: unknown, op: ComparisonOp, value: string | number | (string | number)[]): boolean {
  if (op === 'in') {
    const arr = value as (string | number)[];
    return arr.some(v => String(cell).toLowerCase() === String(v).toLowerCase());
  }

  // Numeric comparison if both sides are numeric
  const cellNum = Number(cell);
  const valNum = typeof value === 'number' ? value : Number(value);
  const bothNumeric = !isNaN(cellNum) && !isNaN(valNum) && value !== '';

  switch (op) {
    case '=': return bothNumeric ? cellNum === valNum : String(cell).toLowerCase() === String(value).toLowerCase();
    case '!=': return bothNumeric ? cellNum !== valNum : String(cell).toLowerCase() !== String(value).toLowerCase();
    case '>': return bothNumeric ? cellNum > valNum : String(cell) > String(value);
    case '<': return bothNumeric ? cellNum < valNum : String(cell) < String(value);
    case '>=': return bothNumeric ? cellNum >= valNum : String(cell) >= String(value);
    case '<=': return bothNumeric ? cellNum <= valNum : String(cell) <= String(value);
    case 'contains': return String(cell).toLowerCase().includes(String(value).toLowerCase());
    case 'startswith': return String(cell).toLowerCase().startsWith(String(value).toLowerCase());
    case 'matches': {
      try { return new RegExp(String(value), 'i').test(String(cell)); }
      catch { return false; }
    }
    default: return true;
  }
}
