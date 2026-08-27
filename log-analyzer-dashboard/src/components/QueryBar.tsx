// @paths components
/**
 * QueryBar — the KQL input with autocomplete and inline error display.
 *
 * Features:
 *   - KQL syntax (status >= 500 AND uri contains "/api/")
 *   - Bracket-quoted column names for ugly headers: ['cs(User-Agent)']
 *   - Autocomplete for column names, operators, values
 *   - Inline error display (never blanks the table)
 *   - Esc reverts to last valid query
 *   - Enter applies
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { parseQuery, type ParsedQuery } from '../lib/query';
import type { ColumnDef } from '../lib/types';

interface QueryBarProps {
  columns: ColumnDef[];
  value: string;
  onChange: (value: string) => void;
  onApply: (query: ParsedQuery) => void;
  error?: string;
}

const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', '~=', 'contains', 'startswith', 'matches', 'in'];
const KEYWORDS = ['AND', 'OR', 'NOT'];

export const QueryBar = ({ columns, value, onChange, onApply, error }: QueryBarProps) => {
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [lastValid, setLastValid] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Autocomplete suggestions
  const suggestions = useMemo(() => {
    if (!focused || !showSuggestions) return [];
    const query = value.toLowerCase();

    // Suggest column names
    const colSuggestions = columns.map(c => ({
      type: 'column' as const,
      label: c.label,
      value: c.key,
      detail: `${c.role} (${c.sourceName})`,
    }));

    // Suggest operators
    const opSuggestions = OPERATORS.map(op => ({
      type: 'operator' as const,
      label: op,
      value: ` ${op} `,
      detail: 'operator',
    }));

    // Suggest keywords
    const kwSuggestions = KEYWORDS.map(kw => ({
      type: 'keyword' as const,
      label: kw,
      value: ` ${kw} `,
      detail: 'keyword',
    }));

    // Filter by current text
    const all = [...colSuggestions, ...opSuggestions, ...kwSuggestions];
    if (!query) return all.slice(0, 10);

    return all.filter(s =>
      s.label.toLowerCase().includes(query) ||
      s.detail.toLowerCase().includes(query)
    ).slice(0, 10);
  }, [focused, showSuggestions, columns, value]);

  // Validate on change — use useMemo for derived state, not useEffect+setState
  const validationResult = useMemo(() => {
    if (!value.trim()) return { error: '', valid: true };
    const result = parseQuery(value);
    if (result.errors.length > 0) return { error: result.errors[0], valid: false };
    return { error: '', valid: true };
  }, [value]);

  // Derived: remember the last valid query (for Escape reversion).
  // Calling setState during render is acceptable for derived state.
  if (validationResult.valid && lastValid !== value) {
    setLastValid(value);
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const result = parseQuery(value);
      if (result.errors.length === 0) {
        onApply(result);
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (lastValid) {
        onChange(lastValid);
      } else {
        onChange('');
      }
      setShowSuggestions(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestion(prev => Math.max(prev - 1, 0));
    }
  }, [value, onApply, onChange, lastValid, suggestions]);

  const handleSuggestionClick = useCallback((suggestion: { value: string; label: string }) => {
    // Replace last word with suggestion
    const parts = value.split(/(\s+)/);
    const lastIdx = parts.length - 1;
    if (lastIdx >= 0 && !parts[lastIdx].includes(' ')) {
      parts[lastIdx] = suggestion.value;
    } else {
      parts.push(suggestion.value);
    }
    const newValue = parts.join('');
    onChange(newValue);
    setShowSuggestions(false);
    setSelectedSuggestion(0);
    inputRef.current?.focus();
  }, [value, onChange]);

  const displayError = error || validationResult.error;

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 px-4 py-2 bg-slate-900/60 border-b border-slate-900 ${focused ? 'ring-1 ring-indigo-500/50' : ''}`}>
        <span className="text-indigo-400 text-xs font-mono">❯</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
            setSelectedSuggestion(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setShowSuggestions(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder="status >= 500 AND uri contains &quot;/api/&quot; | sort by latency desc"
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none font-mono"
          spellCheck={false}
          autoComplete="off"
        />
        {value && (
          <button
            onClick={() => { onChange(''); }}
            className="text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {/* Error pill */}
      {displayError && (
        <div className="absolute left-4 top-full mt-1 z-50">
          <span className="inline-block px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded">
            {displayError}
          </span>
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-64 overflow-y-auto bg-slate-900 border border-slate-800 rounded-lg shadow-xl"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.label}`}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-800 cursor-pointer flex justify-between ${i === selectedSuggestion ? 'bg-slate-800' : ''}`}
              onClick={() => handleSuggestionClick(s)}
              onMouseDown={(e) => e.preventDefault()} // prevent blur
            >
              <span className={s.type === 'column' ? 'text-indigo-400' : s.type === 'operator' ? 'text-emerald-400' : 'text-amber-400'}>
                {s.label}
              </span>
              <span className="text-slate-600 text-[10px]">{s.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
