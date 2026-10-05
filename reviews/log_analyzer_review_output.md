# Code Review & Unit Test Plan: Tauri v2 Log Analyzer

## 1. Security Review (Tauri Backend & IPC)

* **Arbitrary Sensitive File Disclosure via Extension Whitelist**: [`validate_path`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L30-L55) permits any file matching `.log`, `.txt`, `.json`, `.csv`. The renderer can pass arbitrary system paths (e.g. `/var/log/auth.log`, `~/.config/gcloud/*.json`, or Windows cloud credentials).
  * *Action*: Restrict `open_file` to paths explicitly returned by the native file picker dialog or enforce path canonicalization against an allowed base directory scope.
* **Symlink TOCTOU & Parent Symlink Traversal**: [`validate_path`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L50-L53) checks `std::fs::symlink_metadata(&path)` before [`File::open`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L61). This leaves a race window where the path can be swapped. Moreover, `symlink_metadata` only checks the leaf element, not parent directory symlinks.
  * *Action*: On Unix, open with `O_NOFOLLOW` (via `std::os::unix::fs::OpenOptionsExt::custom_flags(libc::O_NOFOLLOW)`) or use `file.metadata()?.file_type().is_symlink()`.
* **Disabled Content Security Policy (CSP)**: `tauri.conf.json` sets `"csp": null`. If an unsanitized log entry triggers XSS, an attacker can execute arbitrary Tauri IPC calls.
  * *Action*: Define a strict CSP: `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'`.
* **File Descriptor Exhaustion (DoS)**: [`FileRegistry`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L16-L26) holds open file handles without TTL, capacity limit, or cleanup on window unmount. Unhandled client crashes or rapid reloads leak OS file handles.
  * *Action*: Enforce a max open file ceiling (e.g., 20 handles) and auto-evict stale handles.

---

## 2. Missing Rust Unit Tests

Add a `#[cfg(test)]` module in [`main.rs`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs) covering:

1. **[`validate_path`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L30)**:
   * Rejects non-existent paths, directories, and disallowed extensions (`.sh`, `.exe`, no extension).
   * Accepts allowed extensions case-insensitively (`.LOG`, `.JSON`).
   * Detects and blocks symlinks and broken symlinks.
2. **[`open_file`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L58) & Registry**:
   * Valid file returns UUID; registry stores entry.
   * Invalid file returns `Err` without polluting registry.
3. **[`read_chunk`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L73) & Boundaries**:
   * Sequential offset reading reconstructs binary content exactly.
   * Reading beyond file size returns empty `Vec<u8>`.
   * Seeking to mid-file offset reads expected slice without offset drift.
   * Expired/invalid `handle.id` returns expected error message.
4. **[`close_file`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L100) & [`file_size`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L110)**:
   * `file_size` on 0-byte file returns `0`; matches disk metadata.
   * `close_file` frees entry; subsequent `read_chunk` or `close_file` calls fail gracefully.

---

## 3. Integration Tests Plan

1. **End-to-End File Read & Ingest Flow**:
   * Mock IPC calls (`open_file`, `file_size`, `read_chunk`, `close_file`) in Vitest.
   * Verify [`readTauriFile`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/App.tsx#L54) streams multi-chunk files (>16 MB) into a `Blob` and feeds into `ingestLogs`.
2. **Handle Cleanup on IPC / Network Failure**:
   * Simulate a mid-read error in `read_chunk`. Assert [`close_file`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L100) is triggered by the `finally` block in [`App.tsx`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/App.tsx#L77-L80).
3. **Multi-File Batch Concurrency**:
   * Exercise [`handleTauriOpen`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/App.tsx#L84) with 5 simultaneous files to verify no deadlock or handle collisions.
4. **Binary & Encoding Fidelity**:
   * Run raw byte test vectors (compressed `.gz`, multi-byte UTF-8, CRLF/LF mix) through IPC to verify zero byte alteration or JSON framing artifacts.

---

## 4. Performance: Chunked Reading Approach

* **Redundant In-Memory Double Materialization**:
  In [`readTauriFile`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/App.tsx#L61-L76), chunks are accumulated into `BlobPart[]`, reassembled into a single `Blob`, converted to a `File`, and then the [`ingest.worker.ts`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/workers/ingest.worker.ts#L80-L81) re-slices the file in 8 MB chunks via `file.slice()`. This duplicates the entire file in JS memory (2x–3x heap overhead), defeating desktop streaming.
  * *Fix*: Stream chunks directly from Tauri into the worker via `ReadableStream` or message transfer, bypassing main-thread `Blob` reassembly.
* **Stop-and-Wait Sequential IPC**:
  Each 8 MB chunk awaits roundtrip IPC. For a 500 MB file, 63 sequential roundtrips occur with zero prefetching.
* **Repeated Buffer Allocation in Rust**:
  [`read_chunk`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src-tauri/src/main.rs#L89) executes `vec![0u8; CHUNK_SIZE]` on every call, allocating and zeroing 8 MB of memory each time.

---

## 5. Web Worker Architecture Review

* **Critical Data Loss in [`StringColumnStore.toDTO`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/lib/columnstore.ts#L390-L404)**:
  `StringColumnStore.toDTO()` returns `blockBuffers: []` without string values. Deserialization via `fromDTO()` creates an empty store with only `rowCount`. Any non-dictionary string column passed through DTO is wiped.
* **Main-Thread Freeze from Plain Object IPC**:
  [`ingest.worker.ts`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/workers/ingest.worker.ts#L193-L210) posts `columnData: { [key: string]: (string | number | null)[] }`. For 500k rows × 10 columns, structured cloning copies 5M items on the main thread.
  * *Fix*: Build [`ColumnStore`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/lib/columnstore.ts#L25) directly inside the worker and transfer underlying `ArrayBuffer`s as `Transferable`s (`postMessage(msg, transferList)`).
* **Multi-byte UTF-8 Boundary Corruption**:
  [`ingest.worker.ts`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/workers/ingest.worker.ts#L87-L90) decodes sliced chunks independently (`decodeBytes(buf, 'utf-8')`). If a multi-byte UTF-8 code point is split across an 8 MB boundary, it produces replacement characters (`\uFFFD`).
  * *Fix*: Use `TextDecoder` in streaming mode: `new TextDecoder('utf-8', { fatal: false }).decode(buf, { stream: true })`.
* **Per-Row Regex Compilation**:
  In [`columnar-filter.ts`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/lib/columnar-filter.ts#L193), [`fillPositive`](file:///home/ramamos/.gemini/antigravity-cli/scratch/scratch/repo/log-analyzer-dashboard/src/lib/columnar-filter.ts#L170) compiles `new RegExp(val)` on every single row inside the scan loop.
  * *Fix*: Compile `const rx = new RegExp(val);` once before iterating rows.
