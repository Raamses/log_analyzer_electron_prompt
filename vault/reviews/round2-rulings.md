# Review Round 2 — Rulings

Both reviewers: **SHIP WITH CHANGES** (up from REJECT AND REDESIGN in round 1).

R2-tech assessed my 6 rejections: **D1, D3, D4, D5 CORRECT** ·
**D2, D6 MOTIVATED REASONING**.

## The big one: I was talked out of the right design by a wrong number

R1 called the columnar store "CRITICAL over-engineering", claiming
`Array<Record>` at 500k×25 is "~60-80MB, V8 handles this fine". I accepted it,
partly because I had made my own arithmetic error in v1 and over-corrected.

R2-tech then contradicted R1: "~600-900MB, near browser tab limits".

A 10× disagreement between reviewers on the load-bearing number. So I measured it
(`node --expose-gc`, 500k rows × 40 cols, realistic mixed log values):

| Strategy | Heap | Per row |
|---|---|---|
| `Array<Record<string,unknown>>` | **1116 MB** | 2341 B |
| Array-of-Arrays (positional) | 512 MB | 1073 B |
| **Columnar (typed arrays + dict-encoded strings)** | **1 MB** | 2 B |

**Everyone was wrong.** R1 was low by ~14×. R2 was closest but still low. My v1
reasoning was wrong for the wrong reasons. 1116 MB is not "fine" — it is at/over
a browser tab's practical ceiling, before React, before the DOM, before charts.

Why columnar wins so hard here: log data is **massively low-cardinality**.
40 columns × 500k rows, but methods are ~7 distinct values, status ~15, endpoints
~500. Dictionary encoding collapses that to `Int32Array` codes + a tiny dict.
This is not a micro-optimization; it is the difference between working and OOM.

### Ruling: REINSTATE the columnar store

**Overturning my own A1 acceptance.** Behind the same narrow `Dataset` interface,
so it stays swappable — but columnar is the default, justified by measurement
rather than assertion.

**Lesson recorded:** I accepted a criticism because the reviewer was confident and
I was embarrassed about my own error. Confidence is not evidence. When two
reviewers disagree 10× on a number that decides the architecture, measure it —
which costs 2 minutes and settles it permanently.

## ACCEPTED from round 2

### R2-A1. D2 was motivated reasoning — partially conceded
Reviewer is right that `mock_azure_logs.csv` has only **3 data rows** — that
cannot validate robustness, and I implied it could. Also right that "marginal
cost is one registry entry" was false, since no registry exists yet.

Where I still disagree: IIS-only risks a registry shaped entirely by IIS.

**Revised:** build the registry in Phase 1 against **synthetic column-name arrays
for 6 formats** (pure functions, no parsing, ~1 day) — that validates the
abstraction cheaply and honestly. Full end-to-end ingestion in the slice is
**IIS only**. Azure moves to Phase 2, and I will generate a larger APGW fixture
rather than pretend 3 rows is validation.

### R2-A2. D6 was motivated reasoning — conceded
I claimed `Dataset` "will not preclude" diff. Reviewer: it is not
diff-compatible, it is diff-*ignorant*. Correct — there is no `datasetId`, no
alignment key, no collection type.

**Accepted:** add `datasetId: string` and `alignmentKeys?: string[]` to
`DatasetMeta` **now** (cheap, ~2 fields), and state plainly that multi-dataset
diff is v2 scope requiring a `DatasetCollection`. Stop claiming compatibility I
have not designed.

### R2-A3. Adopt KQL subset instead of inventing a DSL ⭐
Best idea in round 2. My hand-rolled `status>=500 AND uri~/api/` was a bespoke
grammar I would then have to teach, parse, and maintain.

KQL instead because:
- SREs already know it (Azure Monitor, Sentinel, ADX) — and this app targets
  Azure APGW logs, so the audience overlap is direct
- `['column name']` bracket-quoting **solves the ugly-column-name problem
  natively** — `['cs(User-Agent)']`, `['TimeGenerated [UTC]']`. This is the
  single hardest UX problem in a generic log tool and KQL already answers it.
- Grammar maintained by someone else; extensible to `summarize` later

### R2-A4. Query errors must never blank the table
Keep last valid results, inline error pill naming the offending token, `Esc`
reverts. Do not re-run until the error clears.

### R2-A5. Autocomplete must be pre-indexed, not linear-scanned
Compute per-column metadata during ingest (name, type, top-20 values,
cardinality) in the worker. Never scan 500k rows on a keystroke.

### R2-A6. Query bar and chips = one AST, two projections
Bidirectional: clicking a chip inserts a clause; typing updates chips. Single
source of truth is the AST. Prevents divergent state.

### R2-A7. Zero-typing path is mandatory
Query-first must not abandon the stressed 3am user. Chips remain a first-class
visual query builder that *writes into* the query bar. Click `status>=500`, click
`uri contains /api/`, Enter — no characters typed.

### R2-A8. Phase 1-5 as specified is a demo, not a product
Both reviewers independently flagged this. An SRE who filters to 500 errors and
cannot export them will not return.

**Accepted:** move **CSV export + one insight** (top-N latency by endpoint) into
the slice. Ship a tool, not a demo.

### R2-A9. Add JSON Lines back as a 4th export
Only lossless round-trip format; feeds jq/logcli. I over-cut.

### R2-A10. Mapping drawer needs inline role editing
An inline `Role: client_ip ▾` per column. If editing needs a modal, the
non-modal drawer is theater. Correct.

### R2-A11. Specify Cmd+K scope now
Palette searches commands **+ columns + saved views**. Scoped to commands only,
it is bloat.

### R2-A12. Memory ceiling in bytes, not just rows
"500k rows" is meaningless at variable width — measured above, 500k × 40 is over
1GB as row-objects. Ceiling must be **bytes-based with a row cap as secondary**.

### R2-A13. Define `TransformId` as an enum
`xff_first | xff_rest | concat | scale_ms | scale_s | scale_us` — not a loose
string. Plus explicit `derivedColumnKey` for `concat`.

## Standing firm

- **D1 (RoleBinding over tag system)** — upheld as CORRECT by round 2
- **D3 (RFC4180 only, no general multi-line)** — upheld; Cloudflare ndjson claim
  independently verified
- **D4 (150-column guard)** — upheld as CORRECT with the perf-test gate
- **D5 (no live permalinks)** — upheld as sound engineering, not dogma
