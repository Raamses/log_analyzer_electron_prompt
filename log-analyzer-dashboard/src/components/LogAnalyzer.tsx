// @paths components
/**
 * LogAnalyzer — the orchestrator that ties Phase 5 together.
 *
 * Wires: QueryBar + FilterChips + GenericTable + InsightsRail + ExportMenu +
 *        CommandPalette + SavedViews into a single query-first instrument.
 *
 * State machine:
 *   query text → parseQuery → AST → filterRows → filtered indices → table
 *                                    ↓
 *                              insights (on full dataset)
 *
 * Saved views store: { query, sort, hiddenColumns, pinnedColumns }
 */

import { useState, useCallback, useMemo } from 'react';
import type { Dataset } from '../lib/types';
import type { SortState, ColumnState } from './GenericTable';
import { parseQuery, filterRows, removeClauseFromQuery, type ParsedQuery } from '../lib/query';
import GenericTable from './GenericTable';
import { QueryBar } from './QueryBar';
import { FilterChips } from './FilterChips';
import { InsightsRail } from './InsightsRail';
import { ExportMenu } from './ExportMenu';
import { CommandPalette, type Command } from './CommandPalette';
import { SavedViews, type SavedView } from './SavedViews';

interface LogAnalyzerProps {
  dataset: Dataset;
}

export const LogAnalyzer = ({ dataset }: LogAnalyzerProps) => {
  const [query, setQuery] = useState('');
  const [colStates, setColStates] = useState<Record<string, ColumnState>>(() =>
    Object.fromEntries(dataset.columns.map((c, i) => [c.key, {
      key: c.key, width: 140, visible: true, pinned: false, order: i,
    }])),
  );
  const [sort, setSort] = useState<SortState>({ columnKey: '', direction: 'none' });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Parse query and filter rows
  const parsedQuery = useMemo(() => parseQuery(query), [query]);
  const filteredIndices = useMemo(
    () => filterRows(dataset.rows, dataset.columns, parsedQuery.where),
    [dataset, parsedQuery.where],
  );

  // Visible columns
  const visibleColumnKeys = useMemo(() =>
    dataset.columns.filter(c => colStates[c.key]?.visible).map(c => c.key),
    [dataset.columns, colStates],
  );

  // Hidden/pinned for saved views
  const hiddenColumns = useMemo(() =>
    dataset.columns.filter(c => !colStates[c.key]?.visible).map(c => c.key),
    [dataset.columns, colStates],
  );
  const pinnedColumns = useMemo(() =>
    dataset.columns.filter(c => colStates[c.key]?.pinned).map(c => c.key),
    [dataset.columns, colStates],
  );

  // Commands for the command palette
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      { id: 'clear-query', label: 'Clear query', description: 'Clear the query bar', shortcut: 'Esc', category: 'command', action: () => setQuery('') },
      { id: 'clear-sort', label: 'Clear sort', description: 'Remove sort', category: 'command', action: () => setSort({ columnKey: '', direction: 'none' }) },
      { id: 'show-all', label: 'Show all columns', description: 'Make all columns visible', category: 'command', action: () => {
        setColStates(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, visible: true }])));
      }},
      { id: 'pin-timestamp', label: 'Pin timestamp', description: 'Pin timestamp column to left', category: 'column', action: () => {
        const ts = dataset.columns.find(c => c.role === 'timestamp');
        if (ts) setColStates(prev => ({ ...prev, [ts.key]: { ...prev[ts.key], pinned: true } }));
      }},
    ];

    // Add column hide commands
    for (const col of dataset.columns) {
      cmds.push({
        id: `hide-${col.key}`,
        label: `Hide ${col.label}`,
        description: `Hide ${col.role} column`,
        category: 'column',
        action: () => setColStates(prev => ({ ...prev, [col.key]: { ...prev[col.key], visible: false } })),
      });
    }

    return cmds;
  }, [dataset.columns]);

  // Handlers
  const handleSort = useCallback((newSort: SortState) => setSort(newSort), []);

  const handleQueryApply = useCallback((parsed: ParsedQuery) => {
    // Apply sort from query pipe if present
    if (parsed.sort) {
      setSort({ columnKey: parsed.sort.field, direction: parsed.sort.direction });
    }
  }, []);

  const handleRemoveClause = useCallback((index: number) => {
    setQuery(prev => removeClauseFromQuery(prev, index));
  }, []);

  const handleClearAll = useCallback(() => {
    setQuery('');
  }, []);

  const handleApplyQuery = useCallback((q: string) => {
    setQuery(q);
  }, []);

  const handleSavedViewApply = useCallback((view: SavedView) => {
    setQuery(view.query);
    setSort(view.sort);
    setColStates(prev => {
      const next = { ...prev };
      for (const k of view.hiddenColumns) {
        if (next[k]) next[k] = { ...next[k], visible: false };
      }
      for (const k of view.pinnedColumns) {
        if (next[k]) next[k] = { ...next[k], pinned: true };
      }
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <SavedViews
          currentQuery={query}
          currentSort={sort}
          hiddenColumns={hiddenColumns}
          pinnedColumns={pinnedColumns}
          onApply={handleSavedViewApply}
        />
        <div className="flex items-center gap-2">
          <ExportMenu
            dataset={dataset}
            visibleColumns={visibleColumnKeys}
            filteredRowIndices={filteredIndices}
          />
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 cursor-pointer"
          >
            ⌘K
          </button>
        </div>
      </div>

      {/* Query bar */}
      <QueryBar
        columns={dataset.columns}
        value={query}
        onChange={setQuery}
        onApply={handleQueryApply}
      />

      {/* Filter chips */}
      <FilterChips
        query={query}
        onRemoveClause={handleRemoveClause}
        onClearAll={handleClearAll}
      />

      {/* Main content: table + insights */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <GenericTable
            dataset={dataset}
            rowHeight={36}
            containerHeight={500}
            onSort={handleSort}
          />
        </div>
        <div className="w-72 flex-shrink-0 bg-slate-950 rounded-xl border border-slate-900 overflow-hidden">
          <InsightsRail dataset={dataset} onApplyQuery={handleApplyQuery} />
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />
    </div>
  );
};
