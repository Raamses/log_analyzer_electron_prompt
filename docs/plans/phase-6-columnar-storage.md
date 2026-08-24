# Phase 6 — Columnar Storage & Production Hardening

**Status:** DRAFT — awaiting review (Gemini, then AmosBot)
**Depends on:** Phases 1-5 (merged as <50MB analyzer, see `SCOPE.md`)
**Goal:** lift the file-size ceiling from ~50MB to ~1GB (300-500MB comfortable) and close the gaps AmosBot's and Gemini's reviews found.

---

## 1. Why

The measurement that decides this phase, from `bench/storage-memory.mjs` at 500k rows × 40 cols.

**CORRECTED 2026-08-25.** The original benchmark measured `process.memoryUsage().heapUsed`
only. TypedArray backing stores live in C++ ArrayBuffer memory, tracked under
`arrayBuffers`/`external` — **not** `heapUsed`. The "1 MB" figure was the heap slice
of a strategy whose real footprint is ~96 MB. Gemini's adversarial review caught this;
re-measured with `heapUsed + arrayBuffers`:

| Storage | Total | heap | buffers | vs row-objects |
|---------|------:|-----:|--------:|---------------:|
| `Array<Record>` (current) | 1,116 MB | 1,116 | 0 | 1× |
| Array-of-Arrays | 512 MB | 512 | 0 | 2.2× |
| Columnar + dict (low-cardinality) | **96 MB** | 1 | 95 | **11.6×** |
| Columnar + 3 unique-id columns | **207 MB** | 119 | 88 | **5.4×** |

Log data is mostly **low-cardinality**: 500k rows contain maybe 5 distinct HTTP methods,
40 distinct status codes, a few thousand distinct URIs. Dictionary encoding stores each
distinct string once plus a `Uint32Array` of indices. That is where the 11.6× comes from.

**But** real logs also carry `request_id`/`trace_id` columns that are unique per row and
defeat dict encoding entirely — row D above models three of them and the gain drops to
5.4×. The honest headline number is **5-12× depending on cardinality**, not 1,116×.

**What this means for the ceiling:** at ~200 B/row (low-card) to ~430 B/row (with unique
ids), a browser tab with a ~1.5 GB practical budget holds roughly **3.5M-7M rows**.
A 1 GB log at ~200 B/line is ~5M lines — so 1 GB is reachable but *not* comfortable,
and only with chunked allocation (§3.7) and buffer transfer (§3.8). The claim in the
title of this phase is downgraded from "1GB+" to **"1GB with chunked storage, 300-500MB
comfortable"**.

The current row-object store makes a 100MB file (~500k lines) hit or exceed a tab's
heap budget. The interview named 100MB as the primary use case. That gap is the
reason this phase exists.

**Honest note on process:** the columnar decision was made, then reversed in review
round 1 on a wrong estimate ("60-80MB, fine for V8" — wrong by 14×), then reinstated
in round 2 after measuring. I built Phases 1-5 on row-objects anyway. The measurement
should have decided the architecture and instead became a footnote. Phase 6 corrects that.

---

## 2. Scope

### In scope

1. Columnar storage backend behind the existing `Dataset` interface
2. Streaming decompression (gzip native, zstd WASM)
3. Value-based `inferRole` promotion (unknown formats get real roles)
4. AST→text serializer so filter-chip removal works
5. Bundle code-splitting (manualChunks + lazy insight/export)

### Out of scope (backlog)

- Tauri v2 desktop packaging — separate phase, needs its own plan
- Multi-file / multi-dataset joins
- Server-side or WASM query engine (DuckDB-WASM was considered and rejected: +3MB bundle)
- Time-series charting

---

## 3. Design

### 3.1 Column store

```
ColumnStore (per column, chosen by type)
├── Int32Column      : Int32Array                     // status, bytes
├── Float64Column    : Float64Array                   // latency_ms
├── DateColumn       : Float64Array (UTC epoch ms)    // timestamp
├── BoolColumn       : Uint8Array (bitset)            // flags
└── DictColumn       : Uint32Array + string[]         // uri, method, ua, ip
```

**Dictionary rule.** A string column is dict-encoded only when **both** hold after a
10k-row sample:

```
distinctCount < 10_000   AND   distinct / total < 0.05
```

The original plan said `distinct/total < 0.5`, which is **actively harmful**: at 0.5 a
500k-row column has 250k distinct strings, needing a `Map<string,number>` (~20 MB hash
table) + `string[]` (~15 MB) + `Uint32Array` codes (2 MB) ≈ 37 MB — *worse* than storing
the raw strings, plus it slows ingest. Row D of the benchmark is the empirical version of
this: three unique-id columns cost 111 MB more than the low-cardinality case.

**Code width scales with cardinality** — no reason to spend 4 bytes on a 5-value column:

| Distinct values | Code array | Bytes/row |
|-----------------|------------|----------:|
| ≤ 256 | `Uint8Array` | 1 |
| ≤ 65,536 | `Uint16Array` | 2 |
| ≤ 10,000,000 | `Uint32Array` | 4 |
| > 10,000 distinct **or** ratio ≥ 0.05 | flat `string[]` | — |

Status codes, methods, cache status, and country all land in `Uint8Array` — a 4×
saving over the benchmark's `Int32Array`, so the real low-cardinality figure should
come out **better** than the measured 96 MB.

**Mid-stream bail-out.** The 10k-row sample can be wrong (a column that looks
low-cardinality in the first chunk may explode later). If distinct count crosses 10,000
during ingest, the column converts to flat `string[]` in place and ingest continues —
no restart, no crash.

**Null handling:** a `Uint32Array` presence bitset (1 bit/row) per nullable column.
Sentinel values are rejected: `-1` is a legitimate latency in some formats and `0` is
a legitimate status in others.

### 3.2 Keeping the interface stable

The whole point of the three-layer design is that this is a backend swap, not a
rewrite. `Dataset` grows **index-based** accessors and `rows` is removed:

```ts
export interface Dataset {
  columns: ColumnDef[];
  readonly rowCount: number;

  /** HOT PATH — numeric column index, no string hashing, monomorphic per column. */
  getCellAt(row: number, colIdx: number): unknown;
  /** Direct column handle for vectorised scans (filter, sort, analytics). */
  getColumn(colIdx: number): ColumnStore;
  /** Convenience only — materialises an object. NEVER call in a loop. */
  getRow(row: number): Row;

  index: Uint32Array;
  schema: Schema;
  meta: DatasetMeta;
}
```

**Why index-based, not `getCell(row, colKey: string)`** (Gemini's review): the table
renders ~50 visible rows × 40 columns = 2,000 cells per frame. A string-keyed accessor
costs a `Map.get(colKey)` per cell — 2,000 hash lookups per frame — and the polymorphic
return type wrecks V8's inline caches. `getCellAt(row, colIdx)` resolves the column once
per column (not per cell) and stays monomorphic within a column's render loop.

`getRow` stays for the detail drawer and row-click callbacks, where exactly one object
is built per interaction. It is documented as loop-forbidden.

**`rows` is deleted, not deprecated.** A lazy `rows` getter that materialises the array
would silently allocate 1 GB the first time any component, test, or `console.log` touched
it — negating the entire phase. Removed from the interface; a throwing getter stays in
dev builds only to make the migration failure loud:

```ts
get rows(): never {
  throw new Error('Dataset.rows was removed in Phase 6. Use getCellAt/getColumn.');
}
```

**Migration cost (measured by grep):**
- `GenericTable.tsx` — 3 call sites (+ sort path, see §3.6)
- `insights.ts` — 6 call sites (become vectorised column scans, §3.5)
- `export.ts` — 2 call sites (streaming row materialisation is fine here)
- `query.ts` `filterRows` — 1 call site (becomes a bitset scan, §3.4)

### 3.4 Filtering columnar data — recursive bitset evaluation

**The original design in this plan was wrong.** It said "walk the AST, collect leaf
predicates grouped by column, evaluate each leaf, combine masks". Grouping by column
**destroys boolean precedence**. Consider:

```
(status >= 500 AND uri contains "/api/") OR (status == 404 AND uri contains "/img/")
```

Both clauses touch `status` and `uri`. There is no "status mask" and "uri mask" that
can be combined to produce the right answer — the grouping loses which leaf belongs
to which branch. Evaluation must be a **recursive tree walk**.

```
evalNode(node): BitSet
  ├── Leaf     -> scan the column's typed array -> bitset
  ├── AND(l,r) -> evalNode(l) & evalNode(r)
  ├── OR(l,r)  -> evalNode(l) | evalNode(r)
  └── NOT(x)   -> ~evalNode(x) & presenceBits(columns touched by x)
```

**Bit-packed, not byte-per-row.** A `Uint8Array` mask is 500 KB at 500k rows and 5 MB
at 5M rows; a 6-clause query allocating one per leaf plus intermediates churns 30-50 MB
of garbage *per keystroke*. Use `Uint32Array` at 1 bit/row — 62.5 KB at 500k rows,
625 KB at 5M — and draw from a small pool of reusable scratch bitsets keyed by depth,
so a query of depth *d* allocates *d* bitsets total, not one per node.

**NULL semantics in NOT.** `status = 200` must be FALSE for a row where `status` is
missing. A naive `~mask` flips those nulls to TRUE, so `NOT (status = 200)` would match
rows that have no status at all. Inversion must intersect with the presence bitset:

```
maskNot = (~maskExpr) & presenceBits(col)
```

For a NOT over a subtree touching several columns, intersect with the AND of those
columns' presence bitsets — a row missing any column referenced in the subtree cannot
satisfy its negation either.

**Dict-encoded equality is nearly free.** `uri == "/api/x"` resolves the string to one
dictionary code, then scans `codes: Uint32Array` for that integer. No string comparison
in the loop. `uri in ("/a","/b","/c")` builds a small code set and tests membership.

**Bare-term full-text search** (searching a word across all columns) is bounded per
column type:
- `DictColumn` — substring-match the dictionary (K entries, K ≪ N), collect matching
  codes, scan `codes` for membership. One pass over the dictionary, not the rows.
- flat `string[]` columns — genuine O(N) substring scan. Capped: if more than 4 such
  columns exist, bare-term search asks the user to qualify the field rather than
  scanning 20 × 5M strings.

### 3.5 Sorting — off the main thread, on the codes

**Missing from the original plan.** `GenericTable` currently sorts with
`rows.map(...).sort(...)` inside a `useMemo`. Sorting 5M rows through a generic
comparator is ~115M comparisons and freezes the tab for seconds.

- **Numeric / date columns** — sort a `Uint32Array` of row indices comparing directly
  against the `Int32Array`/`Float64Array`. No boxing, no property access.
- **Dict columns** — sort the *dictionary* once (K entries), producing a code→rank map,
  then sort row indices by `rank[codes[row]]`. Comparing integers, never strings.
- **Above 250k rows** — run the sort in the ingest worker and transfer the resulting
  index array back. The main thread keeps rendering the old order until it arrives.

Sort output is always a `Uint32Array` index permutation; the table already renders
through `index`, so nothing else changes.

### 3.6 Vectorised analytics

**Missing from the original plan.** `insights.ts` iterates rows. At 5M rows, 6 insights
× 5M `getCellAt` calls is tens of seconds. Each insight becomes a typed-array scan:

| Insight | Columnar implementation |
|---------|------------------------|
| Error rate | count `status >= 400` in the `Int32Array` — one tight loop, no allocation |
| Slow endpoints p95 | bucket latencies into a fixed histogram, read the percentile off the buckets (no sort, no full materialisation) |
| Top talkers | `counts = new Uint32Array(dict.length)`, then `counts[codes[i]]++` — zero string work; resolve only the top N codes to strings at the end |
| Cache health | count hit/miss codes directly on the dict codes |

The top-talkers case is the clearest win: counting into an array indexed by dictionary
code is a single pass with no `Map`, no string hashing, and no garbage.

### 3.7 Chunked allocation for streaming ingest

**Missing from the original plan.** Row count is unknown while streaming, so columns
cannot be pre-allocated. Growing a flat `Int32Array` by doubling means at 200 MB you
need 200 MB (old) + 400 MB (new) contiguous — V8 fails this with
`ArrayBuffer allocation failed` well before the tab's nominal budget.

Columns are therefore **arrays of fixed 65,536-row blocks**:

```ts
class Int32Column {
  private blocks: Int32Array[] = [];   // each 65_536 entries = 256 KB
  get(row: number) {
    return this.blocks[row >>> 16][row & 0xFFFF];
  }
}
```

Growth appends one 256 KB block — never reallocates or copies existing data. `>>> 16`
and `& 0xFFFF` are single instructions, so the indexing cost is negligible against the
alternative of not being able to allocate at all.

### 3.8 Worker → main thread transfer

**Missing from the original plan.** A default `postMessage(dataset)` structured-clones
every buffer, momentarily doubling peak memory (700 MB → 1.4 GB) and crashing the tab
at exactly the size this phase exists to support.

Every backing `ArrayBuffer` must go in the transfer list:

```ts
const transfer = [
  ...columns.flatMap(c => c.buffers()),   // block + dict-code buffers
  ...columns.map(c => c.presence?.buffer).filter(Boolean),
  index.buffer,
];
self.postMessage(result, transfer);
```

### 3.9 Decompression

```ts
// gzip / deflate — native, streaming, zero bundle cost
stream.pipeThrough(new DecompressionStream('gzip'))
```

- **gzip / deflate:** `DecompressionStream` (Chrome 80+, Firefox 113+, Safari 16.4+)
- **zstd:** `fzstd` WASM, lazy-loaded only when the magic bytes match (~30KB)
- **bzip2:** not supported — sniff `BZh` magic bytes and return a clear user error:
  `"bzip2 (.bz2) compression is not supported in-browser. Please decompress the file
  or re-compress with gzip (.gz) or zstd (.zst)."`

Magic-byte sniffing already exists in the dialect layer; this replaces the "warn and
attempt UTF-8 anyway" path (which produces garbage) with a real decode.

### 3.10 `inferRole` promotion

| Role | Signal |
|------|--------|
| `timestamp` | ISO 8601 / epoch / common log date parses in >90% of samples |
| `status` | integer, 100-599, ≤60 distinct values |
| `latency_ms` | numeric, non-negative, header contains time/duration/latency/elapsed |
| `client_ip` | IPv4/IPv6 regex matches >90% |
| `method` | ≤10 distinct, all in the HTTP verb set |
| `uri` | starts with `/`, high cardinality |
| `bytes_out` | non-negative integer, header contains bytes/size/length |

Confidence = match ratio. Bind only above 0.8, so a wrong guess stays `unknown`
rather than silently mislabelling data and producing a confidently wrong insight.

### 3.11 AST→text serializer

`serializeQuery(ast): string` — the inverse of `parseQuery`. Enables real clause
removal: drop the node, re-serialize, push the text back into the query bar.

Round-trip property test: `parse(serialize(parse(text)))` must equal `parse(text)`
for a corpus of queries. Formatting may differ; the AST must not.

---

## 4. Sequencing

| Step | Work | Tests | Risk | Section |
|------|------|-------|------|---------|
| 6.1 | `ColumnStore` types + chunked builders | ~25 | low | §3.1, §3.7 |
| 6.2 | `bench/` re-run: confirm corrected figures via real ingest | bench | low | §1 |
| 6.3 | Worker→main buffer transfer | ~8 | med | §3.8 |
| 6.4 | `Dataset` interface migration (`getCellAt`/`getColumn`, delete `rows`) | ~15 | **high** | §3.2 |
| 6.5 | Columnar `filterRows` (recursive bitset eval, NULL-safe) | ~20 | med | §3.4 |
| 6.6 | Vectorised analytics | ~18 | med | §3.6 |
| 6.7 | Columnar sort (codes, off-main-thread above 250k) | ~14 | med | §3.5 |
| 6.8 | Decompression (gzip native, zstd lazy WASM) | ~12 | med | §3.9 |
| 6.9 | `inferRole` value sampling | ~18 | low | §3.10 |
| 6.10 | `serializeQuery` + real clause removal | ~14 | low | §3.11 |
| 6.11 | Bundle splitting | build check | low | — |

Step 6.4 is the dangerous one: every consumer changes at once, and the buffer-transfer
change in 6.3 must land first or the worker will start crashing on large files the
moment columnar storage exists. Within 6.4 itself: land `getCellAt`/`getColumn` as
*additions*, migrate consumers one file at a time with tests green after each, then
delete `rows` last. Do **not** do it atomically.

---

## 5. Verification

- **Unit:** ~130 new tests (target ~295 total)
- **Bench:** `bench/storage-memory.mjs` must confirm **total = heapUsed + arrayBuffers**,
  not heapUsed alone. Re-anchored figures: 96 MB (low-card) / 207 MB (with unique ids)
  at 500k×40.
- **Integration:** ingest a real 100MB IIS log, assert heap stays under 500 MB via CDP
  (`Performance.getMetrics` — `JSHeapUsedSize`), and the table stays interactive.
- **Property:** query round-trip `parse(serialize(parse(q))) === parse(q)`.
- **Regression:** all 165 existing tests must pass unchanged.
- **Worker transfer:** assert `buffer.byteLength === 0` after transfer — a silent clone
  fallback is the regression this phase exists to prevent.

---

## 6. Open questions for reviewers (updated after Gemini review)

1. **Dict threshold** — revised to `distinctCount < 10_000 AND ratio < 0.05`. Gemini's
   reasoning is sound: at 0.5, a column with 250k distinct strings costs ~37 MB — more
   than raw storage. 10k/0.05 gives a 5× safety margin below the crossover point.

2. **`rows` deletion** — **not** a deprecated alias. Immediate removal. A lazy getter
   silently allocates 1 GB on first touch and negates the whole phase. A throwing
   dev-only getter keeps the migration failure loud.

3. **`performance.memory`** — **rejected** (Chrome-only, quantized). Use Node
   `process.memoryUsage().heapUsed + arrayBuffers` for benchmarks and CDP
   `Performance.getMetrics` (`JSHeapUsedSize`) for Playwright browser tests.

4. **bzip2** — warn-only. Sniff `BZh` and return a clear user error. No WASM decoder.

5. **Step 6.3 ordering** — **additive-then-delete within 6.4**, but 6.3 (buffer
   transfer) must land *before* 6.4 or the worker crashes on the first large file it
   ingests after the interface swap. 6.4 itself stays additive-then-delete: ~12 call
   sites across 4 files, green after each.
