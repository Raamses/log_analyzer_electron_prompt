# Review Round 1 — Rulings

Two parallel reviewers: R1 (hostile staff engineer, technical) and R2 (product
designer + UX researcher). R1 verdict: REJECT AND REDESIGN. R2 verdict:
architecture sound, UX insufficient.

## Direct contradiction between reviewers

**Columnar store.** R1 calls it CRITICAL over-engineering. R2 calls it "correct
technical decision" in passing.

**Ruling: R1 wins.** R2 was reviewing UX and asserted this without engaging the
numbers; R1 did the arithmetic. Deferring to the reviewer who actually did the
work on that specific question.

## ACCEPTED — I was wrong

### A1. Columnar store is YAGNI (R1, CRITICAL)
My claim "500k × 25 = 12.5M JS objects — GC death" was **wrong**. It is 500k
objects with 25 properties each, not 12.5M objects. ~60-80MB heap, which V8
handles fine. I inflated the number to justify the design.

→ `Array<Record<string, unknown>>` + `Uint32Array` sort indices. Columnar only
if profiling proves failure at 1M+. Behind a narrow `Dataset` interface so it
*can* be swapped later without touching consumers.

### A2. Timezone handling missing entirely (R1, CRITICAL)
Genuine hole. I did not mention timezones once. `new Date(str)` assumes local TZ
for ambiguous input — silently shifts every temporal metric. An IIS log from a
UTC-5 server viewed in UTC+3 puts the error spike 8 hours off.

→ Registry declares TZ per format (`utc` | `local` | `offset:±HHMM` |
`infer-from-field`). Store as UTC epoch ms (number, not `Date`). Display in
local TZ with an explicit indicator. Overridable in UI.

### A3. Encoding detection missing (R1, HIGH)
IIS logs on Windows are frequently UTF-16LE. `TextDecoder('utf-8')` yields
mojibake and then "invalid format". Real, common, ~1 day of work.

→ BOM sniff + null-byte heuristic; user override.

### A4. Gzip input missing (R1, HIGH)
Log files arrive compressed. → magic-byte detect, `fflate` stream-decompress.

### A5. Memory ceiling / OOM missing (R1, CRITICAL)
No cap means a 2GB file crashes the tab with zero output.
→ Hard row cap (500k v1), stratified sampling offer, honest warning.

### A6. Detection must be iterative (R1, HIGH)
`#Fields:` is a directive, not positional — IIS preambles can exceed 64KB.
JSON array vs JSON-lines both start with `{`/`[`.
→ Escalate 4KB → 64KB → 256KB while confidence <0.7. Scan `#Fields:` anywhere
in 256KB. Bracket-balance check for JSON. Format dropdown visible, not hidden
behind "Adjust…".

### A7. Phase ordering wrong; "independently shippable" was a convenient lie (R1, HIGH)
Phase 1 (dialect only) yields untyped strings — no numeric sort, no insights.
Useless alone. And Phase 3 changing `Dataset.rows` would invalidate Phases 1-2.
→ **Schema registry first** (it is the load-bearing risk), then dialect, then
optimization. Testable immediately by handing it a column-name array.

### A8. Scope is unrealistic for one developer (R1, HIGH)
→ Vertical slice: ONE format (IIS W3C + XFF) end-to-end — ingest → generic table
→ filter → CSV export. Then formats become registry entries. Tests: 30
critical-path unit, 4 happy-path e2e, grown as formats land.

### A9. Perf budgets were invented (R1, MEDIUM)
I asserted them with no measurement. → Benchmark the worker path first, then set
budgets from data. State them as *hypotheses* until measured.

### A10. Query-first, not dashboard-first (R2, verdict-level)
This is the most valuable single point from either review. My plan optimised the
*ingestion* moment and under-served the *analysis* moment. SREs think in
queries; a GUI filter builder is slower than the terminal they already have.

→ **Query bar is now a core feature, not polish.** `status>=500 AND uri~/api/
ORDER BY latency DESC`. Filter sidebar demoted to a discoverability aid that
*writes into* the query bar.

### A11. Mapping preview must not gate (R2, HIGH)
A modal step trains click-through and gets muscle-memory-skipped at 3am — trust
theater, not trust. → Non-modal drawer, auto-applies best mapping, editable
inline. Returning users get a one-line "Using last mapping" toast.

### A12. Scroll position, selection, and filter undo (R2, HIGH)
I would have shipped this bug. Refilter → clear → you are at row 1 with no way
back to row 45,000. → Preserve scroll anchor + selection across refilter; filter
history stack with `Cmd+Z`; no shimmer under 300ms.

### A13. No column should be dumb (R2, MEDIUM)
Two-tier UX makes the app feel broken on exactly the custom formats it claims to
serve. → Every column, including `unknown`, gets frequency distribution + top
values + type-aware sort. Inferred roles get a dashed-underline cue, not
second-class treatment.

### A14. Cut 7 export outlets to 3 (R2, MEDIUM)
→ Permalink, TSV clipboard, CSV download. The rest was checkbox bloat.

### A15. Table is the primary view (R2, HIGH)
→ Table ≥60% width. Insights = bottom drawer, closed by default. Filters = top
chip row. Charts = secondary tab.

### A16. Insights must show their arithmetic (R2, HIGH)
→ Plain-text aggregation + sample size on every insight
("p95 = 420ms for /api/search, n=847, up from 210ms"). Low-n insights suppressed.

### A17. Saved views + Cmd+1..9 (R2, cheapest high-impact)
→ Accepted. ~50 LOC, daily-use value.

### A18. Command palette Cmd+K (R2, S)
→ Accepted.

### A19. Duplicate column names (R1, MEDIUM)
→ `key = sourceName + '_' + index`; registry maps name → indices[].
