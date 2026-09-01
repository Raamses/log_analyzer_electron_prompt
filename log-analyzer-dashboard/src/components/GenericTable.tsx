// @paths components
/**
 * Generic virtualized table — data-driven by ColumnDef[].
 *
 * Replaces the hardcoded VirtualizedLogViewer. Renders whatever columns the
 * Dataset declares, with role-aware formatting (status badges, timestamp
 * formatting, etc.).
 *
 * Features:
 *   - Virtualized scrolling (only visible rows rendered)
 *   - Sort by column (click header, cycles asc → desc → none)
 *   - Column resize (drag handle, double-click to fit)
 *   - Column reorder (drag header)
 *   - Column hide/show (column picker)
 *   - Pin columns left (survive horizontal scroll)
 *   - Row detail drawer (click row → all columns)
 *   - Keyboard nav (↑↓ PgUp/PgDn Home/End)
 *   - IP context menu (right-click IP cell)
 *
 * Pure presentation — all state managed by parent via props.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { ColumnDef, Dataset, Row } from '../lib/types';
import { getRowAt } from '../lib/types';

export interface ColumnState {
  key: string;
  width: number;
  visible: boolean;
  pinned: boolean;
  order: number;
}

export interface SortState {
  columnKey: string;
  direction: 'asc' | 'desc' | 'none';
}

export interface GenericTableProps {
  dataset: Dataset;
  rowHeight?: number;
  containerHeight?: number;
  /** Base row set to display, e.g. the result of a query filter. Omit to show every row. */
  rowIndices?: number[];
  /**
   * Column visibility/width/pin/order. Omit to let GenericTable manage this itself
   * (its original behavior, and what the existing tests rely on). Pass both this AND
   * onColStatesChange together to let a parent (e.g. a command palette's "hide column")
   * actually drive the table — passing colStates without a change handler makes it
   * effectively read-only.
   */
  colStates?: Record<string, ColumnState>;
  onColStatesChange?: (next: Record<string, ColumnState>) => void;
  /** Sort state. Omit to let GenericTable manage it itself. */
  sort?: SortState;
  onSort?: (sort: SortState) => void;
  onRowClick?: (row: Row) => void;
}

const DEFAULT_WIDTH = 140;
const MIN_WIDTH = 60;
const AUTO_FIT_MAX_WIDTH = 320; // initial auto-size cap — deliberately tighter than the
                                 // manual double-click-to-fit cap (600) so one long-text
                                 // column (a URI, a User-Agent) can't dominate the table by
                                 // default. Full value is always one hover/manual-widen away.

interface MeasureCtx {
  measureText(text: string): { width: number };
}

/**
 * Ideal width for one column: max(header label, a sample of real values), clamped.
 * Pure and side-effect-free — shared by the initial auto-sizing pass and the manual
 * double-click-to-fit handler so they can't drift into two different behaviors.
 */
export function measureColumnWidth(
  ctx: MeasureCtx,
  col: Pick<ColumnDef, 'label'>,
  store: { get(i: number): unknown } | undefined,
  rowCount: number,
  opts: { sampleSize?: number; minWidth?: number; maxWidth?: number } = {},
): number {
  const { sampleSize = 100, minWidth = MIN_WIDTH, maxWidth = 600 } = opts;
  let maxW = ctx.measureText(col.label).width + 40;
  if (store) {
    for (let i = 0; i < Math.min(rowCount, sampleSize); i++) {
      const v = String(store.get(i) ?? '');
      maxW = Math.max(maxW, ctx.measureText(v).width + 20);
    }
  }
  return Math.min(Math.max(minWidth, maxW), maxWidth);
}

function computeInitialColumnWidths(
  columns: ColumnDef[], stores: Dataset['stores'], rowCount: number,
): Record<string, number> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const widths: Record<string, number> = {};
  if (!ctx) {
    for (const col of columns) widths[col.key] = DEFAULT_WIDTH;
    return widths;
  }
  ctx.font = '12px ui-monospace, monospace';
  for (const col of columns) {
    widths[col.key] = measureColumnWidth(ctx, col, stores.get(col.key), rowCount, { maxWidth: AUTO_FIT_MAX_WIDTH });
  }
  return widths;
}

/**
 * Build a fresh initial ColumnState map (auto-fit widths, all visible, unpinned, in
 * dataset order). The single source of truth for "what a column state looks like on
 * first load" — used both by GenericTable's own internal fallback state and by any
 * parent (e.g. LogAnalyzer) that wants to own colStates itself, so a controlling
 * parent doesn't have to reimplement (and drift from) the auto-sizing logic.
 */
export function createInitialColumnStates(
  columns: ColumnDef[], stores: Dataset['stores'], rowCount: number,
): Record<string, ColumnState> {
  const widths = computeInitialColumnWidths(columns, stores, rowCount);
  return Object.fromEntries(columns.map((c, i) => [c.key, {
    key: c.key, width: widths[c.key] ?? DEFAULT_WIDTH, visible: true, pinned: false, order: i,
  }]));
}

const GenericTable = ({
  dataset,
  rowHeight = 36,
  containerHeight = 500,
  rowIndices,
  colStates: colStatesProp,
  onColStatesChange,
  sort: sortProp,
  onSort,
  onRowClick,
}: GenericTableProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [internalSort, setInternalSort] = useState<SortState>({ columnKey: '', direction: 'none' });
  const [internalColStates, setInternalColStates] = useState<Record<string, ColumnState>>(() =>
    createInitialColumnStates(dataset.columns, dataset.stores, dataset.rowCount),
  );
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [contextCell, setContextCell] = useState<{ x: number; y: number; row: Row; col: ColumnDef } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const { columns, stores, rowCount } = dataset;

  // Controlled/uncontrolled hybrid: a parent that wants to drive sort or column
  // state (filtering, hiding, pinning) passes it as a prop; otherwise this
  // component manages it itself, same as before. See GenericTableProps doc comments.
  const isColStatesControlled = colStatesProp !== undefined;
  const colStates = isColStatesControlled ? colStatesProp : internalColStates;
  const setColStates = useCallback((updater: React.SetStateAction<Record<string, ColumnState>>) => {
    if (isColStatesControlled) {
      const next = typeof updater === 'function' ? updater(colStatesProp) : updater;
      onColStatesChange?.(next);
    } else {
      setInternalColStates(updater);
    }
  }, [isColStatesControlled, colStatesProp, onColStatesChange]);

  const isSortControlled = sortProp !== undefined;
  const sort = isSortControlled ? sortProp : internalSort;

  // Reset scroll when the underlying row set changes shape (e.g. a new filter
  // applied) — otherwise a deep scroll position from a longer result set leaves
  // the table showing a blank window into a now much-shorter list. The state
  // reset is derived during render (same pattern as CommandPalette.tsx's
  // queryRef) rather than in an effect, per this codebase's lint rule against
  // calling setState synchronously inside an effect (avoids an extra cascading
  // render). The actual DOM scrollTop, a real external-system mutation, stays
  // in an effect — that's exactly what effects are for.
  const rowIndicesRef = useRef(rowIndices);
  if (rowIndicesRef.current !== rowIndices) {
    rowIndicesRef.current = rowIndices;
    setScrollTop(0);
  }
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [rowIndices]);

  // Sorted row indices — read values from column stores
  const baseIndices = useMemo(
    () => rowIndices ?? Array.from({ length: rowCount }, (_, i) => i),
    [rowIndices, rowCount],
  );
  const sortedIndices = useMemo(() => {
    const indices = [...baseIndices];
    if (sort.direction === 'none') return indices;
    const col = columns.find(c => c.key === sort.columnKey);
    if (!col) return indices;
    const store = stores.get(col.key);
    if (!store) return indices;

    indices.sort((a, b) => {
      const va = store.get(a) ?? '';
      const vb = store.get(b) ?? '';
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return indices;
  }, [baseIndices, sort, columns, stores]);

  // Visible columns in order
  const visibleColumns = useMemo(() =>
    columns
      .filter(c => colStates[c.key]?.visible)
      .sort((a, b) => (colStates[a.key]?.order ?? 0) - (colStates[b.key]?.order ?? 0)),
    [columns, colStates],
  );

  const pinnedColumns = visibleColumns.filter(c => colStates[c.key]?.pinned);
  const scrollColumns = visibleColumns.filter(c => !colStates[c.key]?.pinned);

  const totalWidth = visibleColumns.reduce((sum, c) => sum + (colStates[c.key]?.width ?? DEFAULT_WIDTH), 0);

  // Virtualization
  const startIndex = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(containerHeight / rowHeight) + 2;
  const endIndex = Math.min(startIndex + visibleCount, sortedIndices.length);
  const visibleIndices = sortedIndices.slice(startIndex, endIndex);

  const handleSort = useCallback((key: string) => {
    const prev = sort;
    const next: SortState = prev.columnKey === key
      ? prev.direction === 'asc' ? { columnKey: key, direction: 'desc' }
        : prev.direction === 'desc' ? { columnKey: key, direction: 'none' }
        : { columnKey: key, direction: 'asc' }
      : { columnKey: key, direction: 'asc' };
    if (!isSortControlled) setInternalSort(next);
    onSort?.(next);
  }, [sort, isSortControlled, onSort]);

  const handleResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { key, startX: e.clientX, startWidth: colStates[key]?.width ?? DEFAULT_WIDTH };
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const newWidth = Math.max(MIN_WIDTH, dragRef.current.startWidth + dx);
      setColStates(prev => ({ ...prev, [key]: { ...prev[key], width: newWidth } }));
    };
    const handleUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [colStates]);

  const handleResizeDoubleClick = useCallback((key: string) => {
    // Fit to content: measure all visible cells. Uncapped (well, capped at 600, not the
    // tighter 320 the initial auto-size uses) — an explicit double-click means the user
    // wants to actually see this column's full content, not a conservative default.
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '12px ui-monospace, monospace';
    const col = columns.find(c => c.key === key);
    if (!col) return;
    const width = measureColumnWidth(ctx, col, stores.get(key), rowCount, { maxWidth: 600 });
    setColStates(prev => ({ ...prev, [key]: { ...prev[key], width } }));
  }, [columns, stores, rowCount]);

  const handleShowColumn = useCallback((key: string) => {
    setColStates(prev => ({ ...prev, [key]: { ...prev[key], visible: true } }));
  }, []);

  const formatValue = useCallback((value: unknown, col: ColumnDef): string => {
    if (value == null || value === '') return '';
    switch (col.role) {
      case 'timestamp': {
        const ms = Number(value);
        return isNaN(ms) ? String(value) : new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
      }
      case 'status': {
        const s = Number(value);
        if (isNaN(s)) return String(value);
        if (s >= 500) return `[5xx] ${s}`;
        if (s >= 400) return `[4xx] ${s}`;
        if (s >= 300) return `[3xx] ${s}`;
        return `[2xx] ${s}`;
      }
      case 'latency_ms': {
        const ms = Number(value);
        return isNaN(ms) ? String(value) : `${ms}ms`;
      }
      case 'bytes_out':
      case 'bytes_in': {
        const b = Number(value);
        if (isNaN(b)) return String(value);
        if (b > 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)}MB`;
        if (b > 1024) return `${(b / 1024).toFixed(1)}KB`;
        return `${b}B`;
      }
      default: return String(value);
    }
  }, []);

  const renderCell = (row: Row, col: ColumnDef, formatted: string) => {
    // A block element, not a span: a plain inline span has no width of its own to
    // truncate/ellipsize against — it just silently overflows its parent. `truncate`
    // (overflow:hidden + text-overflow:ellipsis + white-space:nowrap) only does anything
    // useful on a block-level box, which is what actually needs to happen here so long
    // values (a URI, a User-Agent) stay inside their own column. `title` keeps the full
    // value one hover away.
    if (col.role === 'status') {
      const s = Number(row[col.key]);
      const cls = !isNaN(s) && s >= 400 ? 'text-red-400' : 'text-emerald-400';
      return <div className={`truncate ${cls}`} title={formatted}>{formatted}</div>;
    }
    return <div className="truncate" title={formatted}>{formatted}</div>;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="bg-slate-900/30 border-b border-slate-900 px-4 py-2 flex items-center gap-2">
        <span className="text-xs text-slate-500">{rowCount.toLocaleString()} rows</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {columns.filter(c => !colStates[c.key]?.visible).map(c => (
            <button
              key={c.key}
              onClick={() => handleShowColumn(c.key)}
              className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded border border-slate-800 hover:border-slate-700 cursor-pointer"
            >
              + {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex flex-1 overflow-hidden">
        {/* Pinned columns */}
        {pinnedColumns.length > 0 && (
          <div className="flex-shrink-0 border-r border-slate-900 overflow-hidden" style={{ height: containerHeight }}>
            <div style={{ width: `${pinnedColumns.reduce((sum, c) => sum + (colStates[c.key]?.width ?? DEFAULT_WIDTH), 0)}px` }}>
              {/* Header */}
              <div className="bg-slate-900/60 border-b border-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 flex items-center gap-2 sticky top-0 z-10">
                {pinnedColumns.map(col => (
                  <div key={col.key} data-testid="table-header-cell" className="flex items-center gap-1 min-w-0 overflow-hidden" style={{ width: colStates[col.key]?.width ?? DEFAULT_WIDTH }}>
                    <span className="truncate" title={col.label}>{col.label}</span>
                  </div>
                ))}
              </div>
              {/* Rows — this panel doesn't scroll itself (clipped + synced to the
                  scrollable panel's scrollTop via the shared `visibleIndices` window),
                  so each row is positioned at its LOCAL slot (i * rowHeight), not its
                  offset within the full unclipped list ((startIndex + i) * rowHeight) -
                  that formula is only correct for a panel that is itself scrolling. */}
              <div style={{ height: `${containerHeight}px`, position: 'relative' }}>
                {visibleIndices.map((rowIdx, i) => {
                  const row = getRowAt(dataset, rowIdx);
                  return (
                    <div
                      key={rowIdx}
                      className={`flex items-center px-4 border-b border-slate-900/50 hover:bg-slate-900/40 text-slate-300 text-xs font-mono cursor-pointer ${
                        selectedRow === rowIdx ? 'bg-slate-900/60' : ''
                      }`}
                      style={{ height: `${rowHeight}px`, position: 'absolute', top: `${i * rowHeight}px`, left: 0, right: 0 }}
                      onClick={() => { setSelectedRow(rowIdx); setDetailRow(row); onRowClick?.(row); }}
                    >
                      {pinnedColumns.map(col => (
                        <div key={col.key} className="min-w-0 overflow-hidden" style={{ width: colStates[col.key]?.width ?? DEFAULT_WIDTH }}>
                          {renderCell(row, col, formatValue(row[col.key], col))}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Scrollable columns */}
        <div
          className="flex-1 overflow-auto"
          data-testid="table-scroll-container"
          style={{ height: containerHeight }}
          ref={containerRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div style={{ width: `${totalWidth}px` }}>
            {/* Header */}
            <div className="bg-slate-900/60 border-b border-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 flex items-center sticky top-0 z-10">
              {scrollColumns.map(col => (
                <div
                  key={col.key}
                  data-testid="table-header-cell"
                  className="flex items-center gap-1 group relative cursor-pointer select-none min-w-0 overflow-hidden"
                  style={{ width: colStates[col.key]?.width ?? DEFAULT_WIDTH }}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="truncate" title={col.label}>{col.label}</span>
                  {sort.columnKey === col.key && (
                    <span className="text-indigo-400">{sort.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-transparent hover:bg-indigo-500/30 transition-colors"
                    onMouseDown={(e) => handleResizeStart(col.key, e)}
                    onDoubleClick={() => handleResizeDoubleClick(col.key)}
                  />
                </div>
              ))}
            </div>

            {/* Rows */}
            <div style={{ height: `${sortedIndices.length * rowHeight}px`, position: 'relative' }}>
              {visibleIndices.map((rowIdx, i) => {
                const row = getRowAt(dataset, rowIdx);
                return (
                  <div
                    key={rowIdx}
                    data-testid="table-row"
                    className={`flex items-center px-4 border-b border-slate-900/50 hover:bg-slate-900/40 text-slate-300 text-xs font-mono cursor-pointer ${
                      selectedRow === rowIdx ? 'bg-slate-900/60' : ''
                    }`}
                    style={{ height: `${rowHeight}px`, position: 'absolute', top: `${(startIndex + i) * rowHeight}px`, left: 0, right: 0 }}
                    onClick={() => { setSelectedRow(rowIdx); setDetailRow(row); onRowClick?.(row); }}
                  >
                    {scrollColumns.map(col => (
                      <div key={col.key} className="min-w-0 overflow-hidden" style={{ width: colStates[col.key]?.width ?? DEFAULT_WIDTH }}>
                        {renderCell(row, col, formatValue(row[col.key], col))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-900/30 border-t border-slate-900 px-4 py-2.5 text-xs text-slate-500 flex justify-between font-sans font-semibold">
        <span>{sortedIndices.length.toLocaleString()} entries</span>
        <span>{visibleColumns.length} columns</span>
      </div>

      {/* Detail drawer */}
      {detailRow && (
        <div className="border-t border-slate-800 bg-slate-900/40 p-4 max-h-64 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-slate-200">Row Detail</h3>
            <button onClick={() => setDetailRow(null)} className="text-slate-500 hover:text-slate-300 cursor-pointer">✕</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {columns.map(col => (
              <div key={col.key} className="text-xs">
                <div className="text-slate-500 font-semibold uppercase tracking-wider mb-1">{col.label}</div>
                <div className="text-slate-200 font-mono truncate">{formatValue(detailRow[col.key], col)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextCell && (
        <div
          className="fixed bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 z-50 text-xs"
          style={{ left: contextCell.x, top: contextCell.y }}
          onMouseLeave={() => setContextCell(null)}
        >
          <button
            className="block w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800 cursor-pointer"
            onClick={() => { navigator.clipboard.writeText(String(contextCell.row[contextCell.col.key] ?? '')); setContextCell(null); }}
          >
            Copy IP
          </button>
          <button
            className="block w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800 cursor-pointer"
            onClick={() => { window.open(`https://whois.domaintools.com/${String(contextCell.row[contextCell.col.key])}`, '_blank'); setContextCell(null); }}
          >
            Whois Lookup
          </button>
        </div>
      )}
    </div>
  );
};

export default GenericTable;
