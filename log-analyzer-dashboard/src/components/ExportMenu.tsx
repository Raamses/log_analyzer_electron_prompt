// @paths components
/**
 * ExportMenu — dropdown with export options and privacy controls.
 */

import { useState } from 'react';
import { exportDataset, copyToClipboard, downloadFile, type ExportOptions } from '../lib/export';
import type { Dataset } from '../lib/types';

interface ExportMenuProps {
  dataset: Dataset;
  visibleColumns: string[];
  filteredRowIndices: number[];
}

export const ExportMenu = ({ dataset, visibleColumns, filteredRowIndices }: ExportMenuProps) => {
  const [open, setOpen] = useState(false);
  const [redact, setRedact] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleExport = async (format: ExportOptions['format']) => {
    const opts: ExportOptions = {
      format,
      columns: visibleColumns,
      rows: filteredRowIndices,
      redact,
    };
    const content = exportDataset(dataset, opts);

    if (format === 'csv') {
      // Copy to clipboard for CSV (most common)
      await copyToClipboard(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      // Download for others
      const ext = format === 'ndjson' ? 'jsonl' : format;
      downloadFile(content, `export.${ext}`, 'text/plain');
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 cursor-pointer transition-colors"
      >
        Export ▾
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-300">Export</span>
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={redact}
                onChange={(e) => setRedact(e.target.checked)}
                className="rounded border-slate-600"
              />
              Redact PII
            </label>
          </div>

          <div className="space-y-1">
            <button
              onClick={() => handleExport('csv')}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded cursor-pointer"
            >
              {copied ? '✓ Copied to clipboard' : 'Copy as CSV (clipboard)'}
            </button>
            <button
              onClick={() => handleExport('tsv')}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded cursor-pointer"
            >
              Download as TSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded cursor-pointer"
            >
              Download as JSON
            </button>
            <button
              onClick={() => handleExport('ndjson')}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded cursor-pointer"
            >
              Download as NDJSON
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800 text-[10px] text-slate-600">
            Exports {filteredRowIndices.length.toLocaleString()} rows × {visibleColumns.length} columns
          </div>
        </div>
      )}
    </div>
  );
};
