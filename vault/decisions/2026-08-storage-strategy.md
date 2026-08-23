# Benchmark — Storage Strategy (measured, not argued)

date: 2026-08-24
why: R1 and R2 disagreed 10× on the number that decides the architecture.
method: `node --expose-gc`, 500k rows × 40 cols, realistic mixed log values
        (ints, floats, path strings, short enums), GC forced before/after.
script: `bench/storage-memory.mjs`

## Results

| Strategy | Heap | Per row | Verdict |
|---|---|---|---|
| `Array<Record<string, unknown>>` | **1116 MB** | 2341 B | Unusable |
| Array-of-Arrays (positional) | 512 MB | 1073 B | Marginal |
| **Columnar: typed arrays + dict-encoded strings** | **1 MB** | 2 B | Ship this |
| `Uint32Array` sort index (all strategies) | 1.9 MB | — | Negligible |

## Why the gap is so extreme

Log data is **low-cardinality by nature**. Across 500k rows:
- HTTP methods: ~7 distinct
- status codes: ~15 distinct
- endpoints: ~500 distinct
- user agents: ~1000s distinct

Dictionary encoding stores each distinct string **once** plus an `Int32Array` of
codes. Row-objects store a full string reference (and V8 shape metadata) per row
per column. At 20M cells the difference compounds to ~1000×.

Secondary win: `Int32Array`/`Float64Array` are contiguous, so scans are
cache-friendly. Sorting/filtering touches packed memory instead of chasing
pointers across 500k scattered objects.

## Claims corrected

| Claim | Source | Actual |
|---|---|---|
| "500k×25 = 12.5M objects, GC death" | my plan v1 | Wrong — it is 500k objects with 25 props |
| "~60-80MB, V8 handles this fine" | reviewer R1 | Wrong by ~14× (measured 1116MB) |
| "~600-900MB, near tab limits" | reviewer R2 | Closest; still low, but the conclusion held |

## Decision

Columnar with dictionary encoding, behind a narrow `Dataset` interface.
Not because it is elegant — because 1116 MB does not fit in a browser tab
alongside React, the DOM, and charts.

## Process lesson

I abandoned the correct design after a confident reviewer asserted a wrong
number, compounded by embarrassment at my own earlier error. Two minutes of
measurement would have settled it before I wrote a revised plan around the wrong
choice.

**Rule adopted:** when reviewers disagree materially on a number that decides
architecture, measure before revising. Confidence is not evidence — and that
applies to my own confidence too.
