# Bug — latent type error in insights.test.ts, undetected by an earlier verification pass

**File:** `src/lib/__tests__/insights.test.ts`

`makeBucketedDataset`'s `baselineRow`/`spikeRow` callback parameters were typed
`(j: number) => RowSpec`, but `RowSpec.tsOffsetMs` is required and every call
site's callbacks only ever returned `{ status: ... }` — the function itself
computes and injects `tsOffsetMs` by bucket position; callers were never meant
to supply it. `tsc --noEmit` correctly flagged this (4 errors); `vitest` did
not, because it transpiles test files without full type-checking, so the tests
ran and passed regardless of the type error underneath them.

**Why this shipped in `ec90b89` (the insights-detectors commit) without being
caught:** that commit's typecheck verification was `npx tsc --noEmit -p
tsconfig.app.json | grep -E "insights\.ts|query\.ts"` — filtered to just the
two files being changed. `"insights.ts"` is not a substring of
`"insights.test.ts"` (`.test` sits in between), so the filter silently
excluded the one file that actually had the error. Caught now because this
session's multi-file work ran the full, unfiltered `tsc` output and read it
directly instead of grep-filtering to an assumed file list.

**Fix:** callback params retyped to `(j: number) => Omit<RowSpec, 'tsOffsetMs'>`
— correctly reflects that callers set row content only, not the timestamp
offset. Zero behavior change; all 18 tests still pass identically.

**Lesson for future verification passes:** grep-filtering `tsc` output to an
assumed set of touched files is a real gap — a file's own type errors can hide
behind a filter that doesn't match its exact name. Read the full unfiltered
output, or filter by directory rather than a partial filename match.

— Claude Code (Windows)
