import { useState, useRef, useCallback, useEffect } from 'react';
import type { Dataset } from './lib/types';
import { ingestLogs } from './lib/ingest';
import { mergeDatasets } from './lib/merge-datasets';
import { LogAnalyzer } from './components/LogAnalyzer';

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__;
}

function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingFileIndex, setLoadingFileIndex] = useState(0);
  const [loadingFileCount, setLoadingFileCount] = useState(0);
  const [isTauriApp, setIsTauriApp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsTauriApp(isTauri());
  }, []);

  // Ingest one or more already-selected File objects, merging them into a
  // single Dataset if there's more than one (see lib/merge-datasets.ts — the
  // "stitch across time" / "combine across servers" multi-file modes).
  const loadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setIsLoading(true);
    setError(null);
    setLoadingFileCount(files.length);
    try {
      const entries: { dataset: Dataset; label: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        setLoadingFileIndex(i);
        setLoadingProgress(0);
        const parsed = await ingestLogs(files[i], {}, {
          onProgress: (p: number) => setLoadingProgress(p),
        });
        entries.push({ dataset: parsed, label: files[i].name });
      }
      setDataset(entries.length === 1 ? entries[0].dataset : mergeDatasets(entries));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file(s)');
    } finally {
      setIsLoading(false);
      setLoadingFileCount(0);
    }
  }, []);

  // Tauri: read one file via the Rust-side chunked API into a File object
  // the existing browser-side ingest pipeline can consume unchanged.
  const readTauriFile = useCallback(async (path: string, invoke: any, onChunkProgress: (pct: number) => void): Promise<File> => {
    const handle = await invoke('open_file', { path });
    try {
      // file_size is a dedicated upfront call (not derived from the first
      // chunk's response) — lets every chunk, including the first, go through
      // one uniform loop instead of a special-cased "read first chunk" step.
      const total: number = await invoke('file_size', { handle });
      const chunks: BlobPart[] = [];
      let offset = 0;

      while (offset < total) {
        // read_chunk returns the raw bytes directly (fast binary IPC, no JSON
        // wrapper) — EOF is an empty read, not a `done` flag.
        const chunk: any = await invoke('read_chunk', { handle, offset });
        const bytes = new Uint8Array(chunk);
        if (bytes.byteLength === 0) break;
        chunks.push(bytes.buffer);
        offset += bytes.byteLength;
        onChunkProgress(Math.round((offset / total) * 100));
      }

      const blob = new Blob(chunks);
      return new File([blob], path.split('/').pop() || path.split('\\').pop() || 'unknown', { type: 'text/plain' });
    } finally {
      // Always release the Rust-side handle, including on a failed/partial read.
      await invoke('close_file', { handle });
    }
  }, []);

  // Tauri: native multi-select file dialog + chunked reads
  const handleTauriOpen = useCallback(async () => {
    try {
      const { invoke } = (window as any).__TAURI_INTERNALS__;
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: true,
        filters: [
          { name: 'Log Files', extensions: ['log', 'csv', 'tsv', 'json', 'txt', 'gz', 'bz2'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;

      setError(null);
      setIsLoading(true);
      setLoadingFileCount(paths.length);

      const files: File[] = [];
      for (let i = 0; i < paths.length; i++) {
        setLoadingFileIndex(i);
        setLoadingProgress(0);
        files.push(await readTauriFile(paths[i], invoke, setLoadingProgress));
      }
      await loadFiles(files);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || e?.error || 'Failed to open file';
      setError(msg);
      setIsLoading(false);
      setLoadingFileCount(0);
    }
  }, [readTauriFile, loadFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) loadFiles(files);
    e.target.value = ''; // allow re-selecting the same file(s) again later
  }, [loadFiles]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) loadFiles(files);
  }, [loadFiles]);

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
              Upload one or more log files to explore them with query-first analytics.
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
              multiple
              accept=".log,.csv,.tsv,.json,.gz,.zst"
              onChange={handleFileSelect}
              className="hidden"
            />
            {isLoading ? (
              <div>
                <div className="text-indigo-400 text-sm font-semibold mb-2">
                  {loadingFileCount > 1
                    ? `Parsing file ${loadingFileIndex + 1} of ${loadingFileCount}… ${loadingProgress}%`
                    : `Parsing… ${loadingProgress}%`}
                </div>
                <div className="w-48 h-1 bg-slate-800 rounded mx-auto overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all" style={{ width: `${loadingProgress}%` }} />
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-sm">
                <span className="text-indigo-400 font-semibold">
                  {isTauriApp ? 'Click to open file(s)' : 'Click to upload'}
                </span>
                {isTauriApp ? '' : ' or drag & drop log file(s)'}
                <div className="text-xs mt-2 text-slate-500">Supports W3C, CSV, TSV, JSON-lines, Cloudflare, Azure APGW + gzip/zstd</div>
                <div className="text-xs mt-1 text-slate-600">Select multiple same-format files to merge them into one view</div>
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
