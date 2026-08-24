# Interview Answers — Impact on Plan

date: 2026-08-24

| Q | Your answer | Impact |
|---|---|---|
| 1. Real logs | You'll supply them | Fixtures unblocked; synthetic only as fallback |
| 2. Scale | **~100MB main, could be more** | **架构-deciding — see below** |
| 3. Fork vs branch | Branch is fine | Staying on `feat/generic-log-analyzer` |
| 4. Hotel logic | Keep, but **separate tab**; create new tabs | Becomes a first-class workspace concept |
| 5. Balancer | **Azure LB** | Needs clarification — see below |
| 6. "What do you mean?" | (re: balancer question) | Answered in reply |
| 7. Backend / desktop | **Prefer no backend; prefer desktop, out of browser** | Tauri (not Electron) — see below |

## Q2 — 100MB settles the storage argument permanently

100MB is not one number, it is a row count that depends on line width:

| File | IIS (~250 B/line) | Azure APGW (~900 B/line, 35 cols) |
|---|---|---|
| 100 MB | ~419,000 rows | ~117,000 rows |
| 500 MB | ~2,097,000 rows | ~583,000 rows |
| 1 GB | ~4,194,000 rows | ~1,165,000 rows |

Against the measured numbers from `bench/storage-memory.mjs`:

| Rows × 40 cols | `Array<Record>` | Columnar |
|---|---|---|
| 400k (≈100MB IIS) | **893 MB** | **0.8 MB** |
| 4M (≈1GB IIS) | **8,930 MB** | **7.6 MB** |

**Row-objects cannot do your stated main case.** 100MB of IIS is ~893MB heap
before React/DOM/charts — at or past a tab's ceiling. At "could be more" it is
categorically impossible.

Columnar does 1GB in ~8MB.

This is now settled by *your requirement* plus measurement, not by reviewer
opinion. Round 1's advice to drop columnar would have made the primary use case
impossible. Recorded in `vault/decisions/2026-08-storage-strategy.md`.

**Consequence:** streaming ingestion is in scope from Phase 3, not deferred.
A 500MB file cannot be `String`-materialised (V8 max string ~512MB) — must be
chunked `ReadableStream` → incremental parse → columnar append.

## Q7 — Desktop without a backend: Tauri, not Electron

You want desktop, no backend. Those are compatible; Electron is not the way.

| | Electron | **Tauri v2** |
|---|---|---|
| Bundle | ~150MB (ships Chromium) | ~10MB (system WebView) |
| Memory | High baseline | Low |
| Backend needed | No | No |
| File access | Node in main proc | Rust commands, scoped |
| **Repo history** | **Deliberately removed** (`8c3ba35 refactor: remove electron and use web apis`); `.cursorrules` line 6 forbids reintroduction | No conflict |

Recommending **Tauri v2**, and it is not merely a wrapper — it unlocks things the
browser cannot do, which matter directly at 100MB+:

1. **True streaming file reads** — no 512MB string cap, no full-file load
2. **Native file dialogs + drag-drop of paths** (browser gets a `File` handle only)
3. **Rust-side decompression** (gzip/zstd) — faster than WASM, no memory doubling
4. **Persistent local storage** for saved views/mappings without `localStorage` limits
5. **Optional Rust parsing** for the hot path if JS proves too slow

**Architecture: single codebase, dual target.** The React app stays a pure SPA and
runs in a browser; Tauri wraps the same build. Platform capabilities go behind an
adapter:

```ts
interface PlatformAdapter {
  openFile(): Promise<FileHandle>;
  readChunks(h: FileHandle, size: number): AsyncIterable<Uint8Array>;
  decompress(s: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array>;
  persist(key: string, v: unknown): Promise<void>;
}
// WebAdapter (File API + fflate) | TauriAdapter (Rust fs + flate2)
```

Browser build keeps working (lower ceiling, ~100-200MB); desktop build handles
GB-scale. No feature is browser-only.

**`.cursorrules` must be amended** — it currently bans reintroducing desktop
packaging. That rule was written to kill Electron specifically. I will update it
to: "No Electron. Tauri v2 permitted via PlatformAdapter; core stays a
platform-agnostic SPA." Recorded as an ADR since it reverses a prior decision.

## Q4 — Tabs / workspaces

You want the hotel logic in a separate tab, plus the ability to create new tabs.
This is a bigger change than "move a plugin": it makes the app **multi-dataset**.

Which is exactly what round 2 caught me on (D6 — I claimed `Dataset` was
diff-compatible when it was diff-*ignorant*). Your answer independently confirms
the reviewer. So:

- `DatasetCollection` + `datasetId` are in the **core model from Phase 1**, not v2
- Each tab = one dataset + its own view state (query, sort, columns)
- Tabs make multi-dataset **diff** and **cross-file request tracing** natural
  later — both previously deferred as v2
- The travel/hotel plugin becomes a *tab type* rather than a mode

Cost: real, but far cheaper now than retrofitted. Deferring it would have been
the painting-into-a-corner the reviewer accused me of.

## Q5 — Azure LB needs disambiguation

"Azure LB" maps to several distinct things, with different shapes:

| Candidate | Format | Has HTTP fields? |
|---|---|---|
| Azure **Load Balancer** health probe logs | JSON (`LoadBalancerProbeHealthStatus`) | No — health state only |
| **NSG flow logs** | Nested JSON, `flowTuples` CSV **strings inside** | No — L3/L4 5-tuple |
| **VNet flow logs** (v4, supersedes NSG) | Nested JSON, same tuple-in-string shape | No — L3/L4 + bytes/packets |
| Azure **Front Door** access logs | JSON | Yes |
| Azure **App Gateway** (already supported) | TSV | Yes |

Important: NSG/VNet flow logs are **not** access logs. They are nested JSON where
the payload is a comma-joined string inside a JSON array:

```
"1663146003599,10.0.0.6,192.0.2.180,23956,443,6,O,B,NX,0,0,0,0"
```

That needs a **dialect that flattens nested JSON then splits an inner CSV
string** — a genuinely new capability, not a registry entry. Roles differ too:
no `status`/`latency`/`uri`; instead `src_ip`/`dst_ip`/`src_port`/`dst_port`/
`protocol`/`action`/`bytes`/`packets`.

I need to know which one you mean before I size it.
