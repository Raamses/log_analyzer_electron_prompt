// @paths components
/**
 * SavedViews — bookmarkable filter/sort/column sets with hotkey recall.
 *
 * Cmd+1..9 recalls a saved view. Each view stores:
 *   - query text
 *   - sort state
 *   - hidden columns
 *   - pinned columns
 */

import { useState, useEffect, useCallback } from 'react';
import type { SortState } from './GenericTable';

export interface SavedView {
  id: string;
  name: string;
  query: string;
  sort: SortState;
  hiddenColumns: string[];
  pinnedColumns: string[];
}

interface SavedViewsProps {
  currentQuery: string;
  currentSort: SortState;
  hiddenColumns: string[];
  pinnedColumns: string[];
  onApply: (view: SavedView) => void;
}

const STORAGE_KEY = 'log_analyzer_saved_views';

function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveViews(views: SavedView[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(views)); } catch { /* ignore */ }
}

export const SavedViews = ({
  currentQuery, currentSort, hiddenColumns, pinnedColumns, onApply,
}: SavedViewsProps) => {
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');

  // Hotkey listener: Cmd+1..9
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < views.length) {
          e.preventDefault();
          onApply(views[idx]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [views, onApply]);

  const handleSave = useCallback(() => {
    const name = saveName.trim() || `View ${views.length + 1}`;
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name,
      query: currentQuery,
      sort: currentSort,
      hiddenColumns,
      pinnedColumns,
    };
    const updated = [...views, newView];
    setViews(updated);
    saveViews(updated);
    setShowSave(false);
    setSaveName('');
  }, [saveName, views, currentQuery, currentSort, hiddenColumns, pinnedColumns]);

  return (
    <div className="flex items-center gap-2">
      {/* Saved view buttons */}
      {views.map((view, i) => (
        <button
          key={view.id}
          onClick={() => onApply(view)}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 cursor-pointer transition-colors"
          title={`${view.name} (Cmd+${i + 1})`}
        >
          {i + 1}. {view.name}
        </button>
      ))}

      {/* Save button */}
      {showSave ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="View name..."
            className="px-2 py-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded outline-none w-24"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
          <button onClick={handleSave} className="text-emerald-400 hover:text-emerald-300 text-xs cursor-pointer">✓</button>
          <button onClick={() => setShowSave(false)} className="text-slate-500 hover:text-slate-300 text-xs cursor-pointer">✕</button>
        </div>
      ) : (
        <button
          onClick={() => setShowSave(true)}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded border border-slate-700 cursor-pointer"
          title="Save current view"
        >
          Save
        </button>
      )}
    </div>
  );
};
