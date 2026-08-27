// @paths lib/decompress
/**
 * Decompression for ingest.
 *
 * Phase 6 plan §3.9:
 *   - gzip / deflate: native DecompressionStream (Chrome 80+, Firefox 113+,
 *     Safari 16.4+). Zero bundle cost. Lazy-loaded only when magic bytes match.
 *   - zstd: fzstd WASM, lazy-loaded (~30KB). Not bundled eagerly.
 *   - bzip2: NOT supported. Sniff BZh magic bytes and return a clear user
 *     error (per Gemini review).
 *
 * When DecompressionStream is unavailable (older browsers, some test
 * environments), we fall back to a pure-JS implementation so ingest still
 * works. The fallback is registered via setGzipImpl() so tests can inject
 * a synchronous stub.
 */

export interface DecompressError extends Error {
  code: 'BZIP2_UNSUPPORTED' | 'ZSTD_FAILED' | 'GZIP_FAILED' | 'NO_DECOMPRESSOR';
}

export class Bzip2UnsupportedError extends Error {
  code = 'BZIP2_UNSUPPORTED' as const;
  constructor() {
    super('bzip2 (.bz2) compression is not supported in-browser. Please decompress the file or re-compress with gzip (.gz) or zstd (.zst).');
    this.name = 'Bzip2UnsupportedError';
  }
}

/** Pluggable gzip implementation for test injection. */
let gzipImpl: ((data: Uint8Array) => Promise<Uint8Array>) | null = null;

export function setGzipImpl(fn: ((data: Uint8Array) => Promise<Uint8Array>) | null): void {
  gzipImpl = fn;
}

export function isDecompressSupported(): boolean {
  return typeof DecompressionStream !== 'undefined';
}

/**
 * Decompress gzip bytes. Uses DecompressionStream when available, otherwise
 * falls back to the injected impl (for tests) or throws.
 */
export async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  if (gzipImpl) return gzipImpl(data);

  if (typeof DecompressionStream === 'undefined') {
    const err = new Error('DecompressionStream not available and no fallback registered') as DecompressError;
    err.code = 'NO_DECOMPRESSOR';
    throw err;
  }

  const blob = new Blob([data as BlobPart]);
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

let zstdFn: ((data: Uint8Array) => Uint8Array) | null = null;

export async function decompressZstd(data: Uint8Array): Promise<Uint8Array> {
  if (!zstdFn) {
    try {
      // Use Function to hide the dynamic import from Vite's static analyzer
      const importer = new Function('return import("fzstd")');
      const mod = await (importer as () => Promise<{ decompress: (d: Uint8Array) => Uint8Array }>)();
      zstdFn = mod.decompress;
    } catch (e) {
      const err = new Error(`zstd decompression requires the 'fzstd' package: ${e}`) as DecompressError;
      err.code = 'ZSTD_FAILED';
      throw err;
    }
  }
  return zstdFn(data);
}

export function isDecompressError(e: unknown): e is DecompressError {
  return e instanceof Error && 'code' in e && (
    e.code === 'BZIP2_UNSUPPORTED' ||
    e.code === 'ZSTD_FAILED' ||
    e.code === 'GZIP_FAILED' ||
    e.code === 'NO_DECOMPRESSOR'
  );
}
