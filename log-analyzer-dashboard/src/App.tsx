import { useState, useRef, useCallback } from 'react';
import type { Dataset } from './lib/types';
import { ingestLogs } from './lib/ingest';
import { LogAnalyzer } from './components/LogAnalyzer';

function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setLoadingProgress(0);
    try {
      const result = await ingestLogs(file, {}, {
        onProgress: (p: number) => setLoadingProgress(p),
      });
      setDataset(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-100 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
            Log Analyzer
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload a log file to explore it with query-first analytics.
          </p>
        </header>

        {!dataset && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center cursor-pointer hover:border-indigo-500/50 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".log,.csv,.tsv,.json,.gz,.zst"
              onChange={handleFileSelect}
              className="hidden"
            />
            {isLoading ? (
              <div>
                <div className="text-indigo-400 text-sm font-semibold mb-2">Parsing… {loadingProgress}%</div>
                <div className="w-48 h-1 bg-slate-800 rounded mx-auto overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all" style={{ width: `${loadingProgress}%` }} />
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-sm">
                <span className="text-indigo-400 font-semibold">Click to upload</span> or drag & drop a log file
                <div className="text-xs mt-2 text-slate-500">Supports W3C, CSV, TSV, JSON-lines, Cloudflare, Azure APGW + gzip/zstd</div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 text-center text-red-400 bg-red-950/40 border border-red-900/20 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}

        {dataset && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-400">
                {dataset.meta.file} · {dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns
              </div>
              <button
                onClick={() => setDataset(null)}
                className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                Load another file
              </button>
            </div>
            <LogAnalyzer dataset={dataset} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
