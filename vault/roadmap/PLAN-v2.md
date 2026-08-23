# Plan v2 — Generic Log Analyzer (post-review)

status: DRAFT — awaiting user approval
supersedes: PLAN.md, PLAN-part2.md, PLAN-part3-ux.md, PLAN-part4-testing-risks.md
review history: `vault/reviews/round1-rulings.md`, `round1-rejections.md`

## What changed from v1, and why

| Change | Driver |
|---|---|
| Columnar store → row-objects + `Uint32Array` indices | My "12.5M objects" claim was arithmetically wrong |
| Timestamps → UTC epoch ms + per-format TZ declaration | Timezones were missing entirely; silently corrupts every temporal metric |
| Encoding detection + gzip + memory ceiling added | Real-world inputs I had not accounted for |
| Phase order: **schema registry FIRST** | v1's "independently shippable" was false; Phase 1 alone yields untyped strings |
| Scope → 2-format vertical slice | 8 phases was a waterfall Gantt in disguise |
| **Query bar becomes core** | Biggest insight of the review: I was dashboard-first, should be query-first |
| Mapping preview → non-modal drawer | A gate trains click-through and gets skipped at 3am |
| 7 export outlets → 3 | Checkbox bloat |
| Roles keep one axis, gain bindings/priority/transforms | Rejected tag-system as renamed indirection; solved the underlying cases directly |

## Posture

**Query-first instrument, not a dashboard.** The table is the product. Filters,
insights, and charts orbit it. An SRE must never find this slower than
`grep | sort | uniq -c`.

## Data model

```ts
// UTC epoch ms — never a locale-dependent Date
type Timestamp = number;

interface Dataset {
  columns: ColumnDef[];
  rows: Row[];                  // Array<Record<string, unknown>>
  index: Uint32Array;           // sort/filter view over rows
  schema: Schema;
  meta: DatasetMeta;            // tz, encoding, dialect, skipped, warnings, sampled
}
```

`Dataset` is a **narrow interface**. If profiling later proves row-objects
insufficient at 1M+ rows, storage can go columnar without touching the table,
filters, or analytics. Optimization stays reversible; it is not baked in.

### Roles with bindings (replaces v1's flat role map)

```ts
interface RoleBinding {
  role: Role; columnKey: string;
  priority: number;                    // XFF(10) beats c-ip(0)
  multiplicity: 'single' | 'list';
  splitter?: RegExp;                   // XFF chain, ALB status list
  transform?: TransformId;             // xff_first | xff_rest | concat | scale
  unit?: 'ms' | 's' | 'us' | 'bytes';
}
interface Schema {
  bindings: RoleBinding[];                   // many per role allowed
  primary: Partial<Record<Role, string>>;    // explicit winner, UI-overridable
  timezone: 'utc' | 'local' | `offset:${string}` | 'infer';
}
```

Handles every case review round 1 raised: three Cloudflare status columns
(bindings + `primary` + UI selector), XFF dual-role (two bindings + transforms),
ALB multi-value (`multiplicity: 'list'`), IIS uri+query (`concat` transform),
unit differences (`unit` + central normalization).

## Phases (reordered — riskiest first)

| Ph | Deliverable | Why here |
|---|---|---|
| **1** | **Schema registry + roles + bindings + inference.** Pure functions over a column-name array. | Load-bearing risk. If the role model fails, everything fails — find out in week 1, not month 3. |
| 2 | Dialect layer: W3C, TSV, CSV (RFC4180), + encoding/BOM/gzip detection | Feeds the registry |
| 3 | Ingest pipeline in worker: TZ normalization, memory ceiling, partial results, honest warnings | Correctness before UI |
| 4 | Generic table: sort, resize, reorder, hide, pin, detail drawer | First visible payoff |
| 5 | **Query bar** + chips + saved views (`Cmd+1..9`) + `Cmd+K` palette + `Cmd+Z` filter undo | The query-first posture |
| 6 | Role-driven analytics + insights (arithmetic + n shown) | Depends on 1 |
| 7 | Export: permalink, TSV clipboard, CSV + redaction | — |
| 8 | +Cloudflare, +Apache CLF, +ALB as registry entries | Proves genericity by addition, not surgery |
| 9 | Travel plugin (existing hotel logic extracted) | Preserves current value, out of core |
| 10 | Perf hardening; columnar only if measured necessary | Evidence-gated |

**Vertical slice target = Phases 1-5 with IIS W3C + Azure APGW.** Two
structurally dissimilar formats (space vs tab, directive vs first-row header, ms
vs seconds, split vs single timestamp). One format cannot validate a generic
abstraction.

## Success criteria (unchanged from your goal, now testable)

1. IIS **with** XFF → XFF wins as client_ip via priority
2. IIS **without** XFF → falls back to c-ip
3. IIS with **custom columns** → ingested, displayed, filterable, frequency stats
4. Azure APGW → TSV, seconds→ms
5. Cloudflare → JSON-lines, multi-status selection
6. Round-trip: export CSV → reimport → same data
7. Perf: measured first, then gated in CI
8. Corrupt/truncated → partial results + honest warning, never blank
9. UTF-16LE IIS log → correct parse
10. Wrong-timezone log → correct absolute times

## Explicit non-goals (v1)

Multi-line/stack-trace framing · column virtualization >150 cols · multi-dataset
diff · cross-file request tracing · live permalinks (violates privacy) ·
user-editable detection logic · live tail · alerting · server-side anything.

Each is defensible later; none is needed to prove "ingest anything, make it
useful", and each would dilute the core.
