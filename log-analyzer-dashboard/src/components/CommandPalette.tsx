// @paths components
/**
 * CommandPalette — Cmd+K fuzzy search over commands, columns, saved views.
 *
 * Three layers:
 *   - Commands: sort, export, pin, hide, clear, etc.
 *   - Columns: jump to column, toggle visibility
 *   - Saved views: recall filter/sort/column state
 */

import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';

export interface Command {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  action: () => void;
  category: 'command' | 'column' | 'view';
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export const CommandPalette = ({ isOpen, onClose, commands }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Reset selection when search changes — derive during render to avoid
  // calling setState inside an effect (which the lint rule forbids).
  const queryRef = useRef(query);
  if (queryRef.current !== query) {
    queryRef.current = query;
    setSelectedIndex(0);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[selectedIndex]?.action();
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center pt-24 z-50">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <span className="text-indigo-400 text-sm">⌘K</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
            autoComplete="off"
          />
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs cursor-pointer">
            Esc
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-600">
              No commands found
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-800 cursor-pointer ${i === selectedIndex ? 'bg-slate-800' : ''}`}
                onClick={() => { cmd.action(); onClose(); }}
              >
                <span className={`text-xs px-1.5 py-0.5 rounded ${cmd.category === 'command' ? 'bg-indigo-500/10 text-indigo-400' : cmd.category === 'column' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  {cmd.category === 'command' ? '⌘' : cmd.category === 'column' ? '◫' : '★'}
                </span>
                <div className="flex-1">
                  <div className="text-sm text-slate-200">{cmd.label}</div>
                  {cmd.description && (
                    <div className="text-xs text-slate-500">{cmd.description}</div>
                  )}
                </div>
                {cmd.shortcut && (
                  <span className="text-xs text-slate-600 font-mono">{cmd.shortcut}</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-800 flex items-center gap-4 text-[10px] text-slate-600">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
};
