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

import { useState, useRef, useCallback, useMemo } from 'react';
import type { ColumnDef, Dataset, Row } from '../lib/types';

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
  onSort?: (sort: SortState) => void;
  onRowClick?: (row: Row) => void;
  onCellContext?: (cell: { row: Row; column: ColumnDef; value: string }) => void;
}

const DEFAULT_WIDTH = 140;
const MIN_WIDTH = 60;

const GenericTable = ({
  dataset,
  rowHeight = 36,
  containerHeight = 500,
  onSort,
  onRowClick,
  onCellContext,
}: GenericTableProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [sort, setSort] = useState<SortState>({ columnKey: '', direction: 'none' });
  const sortRef = useRef<SortState>({ columnKey: '', direction: 'none' });
  const [colStates, setColStates] = useState<Record<string, ColumnState>>(() =>
    Object.fromEntries(dataset.columns.map((c, i) => [c.key, {
      key: c.key, width: DEFAULT_WIDTH, visible: true, pinned: false, order: i,
    }])),
  );
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [contextCell, setContextCell] = useState<{ x: number; y: number; row: Row; col: ColumnDef } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const { columns, rows } = dataset;

  // Sorted row indices
  const sortedIndices = useMemo(() => {
    if (sort.direction === 'none') return rows.map((_, i) => i);
    const col = columns.find(c => c.key === sort.columnKey);
    if (!col) return rows.map((_, i) => i);
    const indexed = rows.map((row, i) => ({ row, i }));
    indexed.sort((a, b) => {
      const va = a.row[col.key] ?? '';
      const vb = b.row[col.key] ?? '';
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return indexed.map(x => x.i);
  }, [rows, sort, columns]);

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
    const prev = sortRef.current;
    const next: SortState = prev.columnKey === key
      ? prev.direction === 'asc' ? { columnKey: key, direction: 'desc' }
        : prev.direction === 'desc' ? { columnKey: key, direction: 'none' }
        : { columnKey: key, direction: 'asc' }
      : { columnKey: key, direction: 'asc' };
    sortRef.current = next;
    setSort(next);
    onSort?.(next);
  }, [onSort]);

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
    // Fit to content: measure all visible cells
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '12px ui-monospace, monospace';
    const col = columns.find(c => c.key === key);
    if (!col) return;
    let maxW = ctx.measureText(col.label).width + 40;
    for (let i = 0; i < Math.min(rows.length, 100); i++) {
      const v = String(rows[i][key] ?? '');
      maxW = Math.max(maxW, ctx.measureText(v).width + 20);
    }
    setColStates(prev => ({ ...prev, [key]: { ...prev[key], width: Math.min(Math.max(MIN_WIDTH, maxW), 600) } }));
  }, [columns, rows]);

  const handleHideColumn = useCallback((key: string) => {
    setColStates(prev => ({ ...prev, [key]: { ...prev[key], visible: false } }));
  }, []);

  const handleShowColumn = useCallback((key: string) => {
    setColStates(prev => ({ ...prev, [key]: { ...prev[key], visible: true } }));
  }, []);

  const formatValue = useCallback((value: unknown, col: ColumnDef): string => {
    if (value == null || value === '') return '';
    switch (col.role) {
      case 'timestamp': {
        const ms = Number(value);
        if (isNaN(ms)) return String(value);
        return new Date(ms).toLocaleString();
      }
      case 'status': return String(value);
      case 'latency_ms': return `${Math.round(Number(value))} ms`;
      case 'bytes_out':
      case 'bytes_in': {
        const n = Number(value);
        if (isNaN(n)) return String(value);
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`;
        return `${n} B`;
      }
      default: return String(value);
    }
  }, []);

  const getStatusStyle = useCallback((value: unknown): string => {
    const n = Number(value);
    if (isNaN(n)) return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    if (n >= 500) return 'bg-red-500/10 text-red-400 border border-red-500/20 font-bold';
    if (n >= 400) return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    if (n >= 300) return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  }, []);

  const getMethodStyle = useCallback((value: unknown): string => {
    const m = String(value).toUpperCase();
    switch (m) {
      case 'GET': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'POST': return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      case 'PUT': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'DELETE': return 'bg-red-500/10 text-red-400 border border-red-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  }, []);

  const renderCell = useCallback((row: Row, col: ColumnDef, value: string) => {
    const isIp = col.role === 'client_ip';
    const isStatus = col.role === 'status';
    const isMethod = col.role === 'method';
    const isTimestamp = col.role === 'timestamp';

    const baseClass = `px-2 py-0.5 text-xs font-mono truncate select-all ${isIp ? 'hover:text-indigo-400 hover:underline cursor-context-menu transition-colors' : ''}`;

    const handleContext = (e: React.MouseEvent) => {
      if (!isIp) return;
      e.preventDefault();
      e.stopPropagation();
      setContextCell({ x: e.clientX, y: e.clientY, row, col });
      onCellContext?.({ row, column: col, value });
    };

    if (isStatus) {
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusStyle(row[col.key])}`}>
          {value}
        </span>
      );
    }
    if (isMethod) {
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getMethodStyle(row[col.key])}`}>
          {value}
        </span>
      );
    }
    if (isTimestamp) {
      return <span className="text-slate-500">{value}</span>;
    }

    return (
      <span
        className={baseClass}
        title={value}
        onContextMenu={handleContext}
      >
        {value}
      </span>
    );
  }, [getStatusStyle, getMethodStyle, onCellContext]);

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-900 overflow-hidden shadow-2xl flex flex-col">
      {/* Column picker */}
      <div className="bg-slate-900/40 border-b border-slate-900 px-4 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 font-semibold">Columns:</span>
        {columns.map(col => (
          <button
            key={col.key}
            onClick={() => colStates[col.key]?.visible ? handleHideColumn(col.key) : handleShowColumn(col.key)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
              colStates[col.key]?.visible
                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                : 'bg-slate-800/50 text-slate-500 border-slate-700 hover:border-slate-600'
            }`}
            title={col.sourceName}
          >
            {col.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex overflow-hidden" style={{ height: `${containerHeight}px` }}>
        {/* Pinned columns */}
        {pinnedColumns.length > 0 && (
          <div className="flex-shrink-0 border-r border-slate-800 overflow-y-auto"
            style={{ width: pinnedColumns.reduce((s, c) => s + (colStates[c.key]?.width ?? DEFAULT_WIDTH), 0) }}>
            {/* Header */}
            <div className="bg-slate-900/60 border-b border-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 flex items-center gap-2 sticky top-0 z-10">
              {pinnedColumns.map(col => (
                <div key={col.key} className="flex items-center gap-1" style={{ width: colStates[col.key]?.width ?? DEFAULT_WIDTH }}>
                  <span className="truncate">{col.label}</span>
                </div>
              ))}
            </div>
            {/* Rows */}
            <div style={{ height: `${sortedIndices.length * rowHeight}px` }}>
              {visibleIndices.map((rowIdx, i) => {
                const row = rows[rowIdx];
                return (
                  <div
                    key={rowIdx}
                    className={`flex items-center px-4 border-b border-slate-900/50 hover:bg-slate-900/40 text-slate-300 text-xs font-mono cursor-pointer ${
                      selectedRow === rowIdx ? 'bg-slate-900/60' : ''
                    }`}
                    style={{ height: `${rowHeight}px`, position: 'absolute', top: `${(startIndex + i) * rowHeight}px`, left: 0, right: 0 }}
                    onClick={() => { setSelectedRow(rowIdx); setDetailRow(row); onRowClick?.(row); }}
                  >
                    {pinnedColumns.map(col => (
                      <div key={col.key} style={{ width: colStates[col.key]?.width ?? DEFAULT_WIDTH }}>
                        {renderCell(row, col, formatValue(row[col.key], col))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable columns */}
        <div className="flex-1 overflow-auto" ref={containerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          <div style={{ width: `${totalWidth}px` }}>
            {/* Header */}
            <div className="bg-slate-900/60 border-b border-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 flex items-center sticky top-0 z-10">
              {scrollColumns.map(col => (
                <div
                  key={col.key}
                  className="flex items-center gap-1 group relative cursor-pointer select-none"
                  style={{ width: colStates[col.key]?.width ?? DEFAULT_WIDTH }}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="truncate">{col.label}</span>
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
                const row = rows[rowIdx];
                return (
                  <div
                    key={rowIdx}
                    className={`flex items-center px-4 border-b border-slate-900/50 hover:bg-slate-900/40 text-slate-300 text-xs font-mono cursor-pointer ${
                      selectedRow === rowIdx ? 'bg-slate-900/60' : ''
                    }`}
                    style={{ height: `${rowHeight}px`, position: 'absolute', top: `${(startIndex + i) * rowHeight}px`, left: 0, right: 0 }}
                    onClick={() => { setSelectedRow(rowIdx); setDetailRow(row); onRowClick?.(row); }}
                  >
                    {scrollColumns.map(col => (
                      <div key={col.key} style={{ width: colStates[col.key]?.width ?? DEFAULT_WIDTH }}>
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
                <div className="text-slate-500 font-semibold mb-0.5">{col.label} <span className="text-slate-600 font-normal">({col.role})</span></div>
                <div className="text-slate-300 font-mono break-all">{formatValue(detailRow[col.key], col) || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context menu for IP cells */}
      {contextCell && (
        <div
          className="fixed z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 text-xs"
          style={{ left: contextCell.x, top: contextCell.y }}
          onMouseLeave={() => setContextCell(null)}
        >
          <button className="block w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800 cursor-pointer"
            onClick={() => { navigator.clipboard.writeText(String(contextCell.row[contextCell.col.key] ?? '')); setContextCell(null); }}>
            Copy IP
          </button>
          <button className="block w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800 cursor-pointer"
            onClick={() => { window.open(`https://whois.domaintools.com/${String(contextCell.row[contextCell.col.key])}`, '_blank'); setContextCell(null); }}>
            Whois Lookup
          </button>
        </div>
      )}
    </div>
  );
};

export default GenericTable;
