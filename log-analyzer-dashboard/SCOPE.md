# Log Analyzer — Scope & Known Limits

**Branch:** `feat/generic-log-analyzer`
**Status:** Phases 1-5 complete. Ships as a **<50MB analyzer**. Columnar backend is Phase 6.

---

## What this PR delivers

A 100% client-side SPA that ingests structured logs of many formats and gives you
a query-first table with role-driven insights. Nothing leaves the browser.

| Layer | What it does |
|-------|--------------|
| **Dialect** | Framing: W3C, TSV, CSV (RFC4180), JSON-lines, Apache CLF, key-value. Encoding detection (BOM, UTF-16, UTF-8). |
| **Schema** | Semantic roles (`timestamp`, `status`, `latency_ms`, `client_ip`, `uri`...). Registry-driven format matching. |
| **Normalize** | TZ-safe timestamp parsing, unit scaling (s→ms), type coercion. |
| **Table** | Data-driven virtualized grid: sort, resize, reorder, hide, pin, detail drawer. |
| **Query** | KQL subset: `status >= 500 AND uri contains "/api/" \| sort by latency desc` |
| **Insights** | Error rate, slow endpoints (p95), top talkers, cache health — each with a reproduction query. |
| **Export** | CSV / TSV / JSON / NDJSON, with optional redaction of IPs and sensitive query params. |

**165 unit tests. `tsc --noEmit` clean.**

---

## Hard limits — read this before using it

### 1. File size: **<50MB comfortable, ~80MB hard ceiling**

The `Dataset` interface stores rows as `Record<string, unknown>` objects. This is
the single biggest constraint in the app and it is **measured, not guessed**:

| Storage | 500k rows × 40 cols | Notes |
|---------|--------------------:|-------|
| `Array<Record>` (current) | **1,116 MB** | V8 object header + hidden class + boxed values per cell |
| Array-of-Arrays | 512 MB | Removes per-cell key overhead |
| Columnar + dict-encoded strings | **1 MB** | Log data is low-cardinality → dict encoding wins ~1000× |

Benchmark: `bench/storage-memory.mjs`.

**Consequence:** a 100MB access log (~500k lines) will approach or exceed a browser
tab's heap budget and can OOM. The ingest worker enforces a byte-based memory
ceiling and will stop early with a warning rather than crash — but the practical
working limit is **<50MB**.

**Phase 6 fixes this.** See `docs/plans/phase-6-columnar-storage.md`.

### 2. Compressed files are detected but **not decompressed**

The dialect layer sniffs gzip / zstd / bzip2 magic bytes and emits a warning, then
attempts a UTF-8 decode of the compressed bytes — which produces garbage. Decompress
before loading:

```bash
gunzip -c access.log.gz > access.log
zstd -d access.log.zst -o access.log
```

Phase 6 adds `DecompressionStream('gzip')` (native, streaming) and a WASM zstd path.

### 3. Filter-chip removal clears the whole query

`handleRemoveClause` in `LogAnalyzer.tsx` is a stub: clicking a chip's × resets the
query to empty instead of removing that one clause. Real clause removal needs an
AST→text serializer, which lands in Phase 6.

**Workaround:** edit the query text directly — the query bar is the source of truth.

### 4. Unknown formats degrade to strings

`detectSchema` matches known formats by header signature. When nothing matches,
`inferSchema` currently assigns `role: 'unknown'` and `type: 'string'` to every
column. `inferRole` (value-based heuristics: does this column look like an IP? a
status code? an ISO date?) exists but is only wired into a narrow fallback path.

**Consequence:** for a format not in the registry, the table works (you see all your
data, sortable) but **insights stay empty** because no roles are bound.

Phase 6 promotes `inferRole` to a real value-sampling pass.

### 5. Web app only — no Tauri/Electron packaging

The interview concluded Tauri v2 is the right desktop path (native file dialogs,
no 2GB browser heap cap, real filesystem streaming). Nothing is wired up yet.
This runs in a browser tab today.

### 6. Bundle: 705KB JS (no code-splitting)

Single chunk, over Vite's 500KB warning. Phase 6 adds `manualChunks` and lazy-loads
the insight/export paths.

---

## What is NOT a limit (verified)

- **RFC4180 quoting** — embedded commas, quotes, and newlines inside quoted fields parse correctly (46 dialect tests).
- **Timezone correctness** — no `new Date(ambiguousString)` anywhere. Every format declares its TZ; parsing is explicit and stored as UTC epoch ms (22 normalize tests).
- **Original headers preserved** — `sourceName` keeps the exact source header. Nothing is renamed or dropped, including columns with no role.
- **Duplicate headers** — deduped into stable keys (`cs-uri-stem`, `cs-uri-stem_2`).
- **Partial/corrupt files** — malformed lines are skipped and counted; you get partial results plus a warning, not a hard failure.
- **PII on export** — redaction masks IP octets and strips sensitive query params.

---

## Success criteria coverage

| Criterion | Status |
|-----------|--------|
| IIS W3C with `X-Forwarded-For` | ✅ registry priority picks XFF over `c-ip` |
| IIS W3C without XFF | ✅ falls back to `c-ip` |
| IIS with custom columns | ✅ `role: 'unknown'`, still displayed and sortable |
| Azure Application Gateway | ✅ TSV framing, seconds→ms scaling |
| Cloudflare | ✅ JSON-lines, 3 status columns, priority resolves |
| 100MB+ files | ⚠️ **streams, but heap-bound — see limit #1** |
| Corrupt files | ✅ partial results + warning list |
| Compressed files | ❌ **limit #2** |

---

## Recommendation

Merge as a **<50MB analyzer** with these limits documented, then land Phase 6
(columnar storage + decompression + `inferRole` + clause removal) as a follow-up PR.

Rationale: Phases 1-5 are independently useful and fully tested. The three-layer
architecture is what makes Phase 6 a backend swap behind the `Dataset` interface
rather than a rewrite. Holding the whole thing back until columnar lands means
nobody can use a working <50MB tool in the meantime.
