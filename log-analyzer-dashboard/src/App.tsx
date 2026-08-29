import { useState, useRef, useCallback, useEffect } from 'react';
import type { Dataset } from './lib/types';
import { ingestLogs } from './lib/ingest';
import { LogAnalyzer } from './components/LogAnalyzer';

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__;
}

function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isTauriApp, setIsTauriApp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsTauriApp(isTauri());
  }, []);

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

  // Tauri: use native file dialog + chunked reads
  const handleTauriOpen = useCallback(async () => {
    try {
      const { invoke } = (window as any).__TAURI_INTERNALS__;
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Log Files', extensions: ['log', 'csv', 'tsv', 'json', 'txt', 'gz', 'bz2'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;

      setError(null);
      setIsLoading(true);
      setLoadingProgress(0);

      // Open file via Rust (returns opaque handle)
      const handle = await invoke('open_file', { path: selected });

      // Read file in chunks and build a Blob for the ingest pipeline
      const chunks: BlobPart[] = [];
      let offset = 0;
      let total = 0;

      // Read first chunk to get total size
      const firstChunk: any = await invoke('read_chunk', { handle, offset: 0 });
      const firstBytes = new Uint8Array(firstChunk.data);
      chunks.push(firstBytes.buffer);
      total = firstChunk.total;
      offset += firstBytes.byteLength;
      setLoadingProgress(Math.round((offset / total) * 100));

      // Read remaining chunks
      while (offset < total) {
        const chunk: any = await invoke('read_chunk', { handle, offset });
        const bytes = new Uint8Array(chunk.data);
        chunks.push(bytes.buffer);
        offset += bytes.byteLength;
        setLoadingProgress(Math.round((offset / total) * 100));
        if (chunk.done) break;
      }

      // Close handle
      await invoke('close_file', { handle });

      // Reconstruct a File object for the existing ingest pipeline
      const blob = new Blob(chunks);
      const file = new File([blob], selected.split('/').pop() || selected.split('\\').pop() || 'unknown', { type: 'text/plain' });
      await handleFile(file);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || e?.error || 'Failed to open file';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleOpen = isTauriApp ? handleTauriOpen : () => fileInputRef.current?.click();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-100 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
              Log Analyzer
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Upload a log file to explore it with query-first analytics.
            </p>
          </div>
          {isTauriApp && (
            <span className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-900/20 px-2 py-1 rounded-full">
              Desktop
            </span>
          )}
        </header>

        {!dataset && (
          <div
            onClick={handleOpen}
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
                <span className="text-indigo-400 font-semibold">
                  {isTauriApp ? 'Click to open file' : 'Click to upload'}
                </span>
                {isTauriApp ? '' : ' or drag & drop a log file'}
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
                {dataset.meta.file} · {dataset.rowCount.toLocaleString()} rows · {dataset.columns.length} columns
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
