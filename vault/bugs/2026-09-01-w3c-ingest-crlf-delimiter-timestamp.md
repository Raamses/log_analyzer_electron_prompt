# Bugs Found — W3C ingest on Windows (CRLF, delimiter, split timestamp)

Found testing the Tauri desktop build against a real IIS W3C log
(`u_ex260711.log`, CRLF line endings) on Windows. Symptom: loading the file
showed "0 rows, 2 columns" with garbage column names. Three separate bugs,
all in the streaming ingest path — fixed and verified against the real file
(1965/1965 data rows, correct columns, correct timestamps).

Commits: `056c63a` (unrelated Tauri dialog-plugin fix, same session),
`5c3e0df` (these three bugs), `32795b6` (tests).

## Bug 1 (root cause): CRLF got deleted, not normalized

**File:** `src/workers/ingest.worker.ts`

**Symptom:** any CRLF-terminated file (virtually all Windows-originated
logs — IIS included) produced 0 rows, no error.

**Root cause:**
```ts
const lines = processable.replace(/\r\n?/g, '').split('\n');
```
Replaces every `\r\n` with an **empty string** instead of `\n`. On a CRLF
file this glues every line together into one giant string. That string
starts with `#` (from `#Software: ...`), so the worker's own
`line.startsWith('#')` comment-skip guard silently discarded the entire
file as "a comment line" — no exception, no warning.

Separately, `src/lib/dialect.ts`'s `frame()` already normalized line
endings correctly (`.replace(/\r\n/g,'\n').replace(/\r/g,'\n')`). The
worker had reimplemented the same job on its own, and the two
implementations diverged — classic duplicated-logic bug.

**Fix:** extracted `normalizeLineEndings()` into `dialect.ts` as the single
implementation; both `frame()` and the worker now call it.

## Bug 2: delimiter selection never handled `'w3c'` format

**File:** `src/workers/ingest.worker.ts`

**Symptom:** once Bug 1 was fixed, W3C data lines still parsed as a single
cell each instead of splitting into 15 fields.

**Root cause:**
```ts
detectedDelimiter = framed.format === 'tsv' ? '\t' : ',';
```
Only branches tsv vs. everything else. W3C is space-delimited; this
defaulted it to comma, and IIS log lines don't contain commas.

**Fix:** extracted `delimiterForFormat()` into `dialect.ts`
(`tsv → '\t'`, `w3c → ' '`, else `','`), used by the worker instead of the
inline ternary.

## Bug 3 (found while verifying Bugs 1–2): W3C date+time never combines into one timestamp

**File:** `src/lib/normalize.ts`

**Symptom:** rows parsed correctly (after Bugs 1–2), but every row's
timestamp column was silently empty. No error — sort-by-time, the
timeline, and anomaly detection all just quietly had nothing to show.

**Root cause:** `src/lib/schema.ts`'s `iis-w3c` entry binds W3C's separate
`date` and `time` columns **both** to `role: 'timestamp'`. But
`parseTimestamp()` requires one combined `"YYYY-MM-DD HH:MM:SS"` string —
neither `"2026-07-11"` nor `"00:03:35"` alone matches any of its patterns,
so both come back `NaN` → `''`. The FIRST timestamp-role column
(`date`) is what every downstream consumer actually uses
(`LogAnalyzer.tsx:74`: `dataset.columns.find(c => c.role === 'timestamp')`),
and it was always empty.

**Fix:** `normalizeRow()` now retries the *primary* timestamp column when
its own value fails to parse and there is more than one timestamp-role
column: it joins every timestamp-role raw cell in column order
(`"date time"` for W3C) and reparses. Generic, not IIS-specific — formats
with a single timestamp column (Azure APGW, Cloudflare) see zero behavior
change (`timestampCols.length > 1` is false for them).

## Verification

Wrote a throwaway script (not committed) that imports the real
`dialect.ts` / `schema.ts` / `normalize.ts` and replicates the worker's
first-chunk logic against the actual 234KB / 1985-line log file:
- format correctly detected as `w3c`
- 10 real columns bound (date/time/method/uri/query/client_ip/user_agent/
  referrer/status/latency_ms)
- 1965 rows parsed, 0 skipped
- primary timestamp round-trips to `2026-07-11T00:03:35.000Z`, matching
  the source line exactly

Unit tests for all three (`dialect.test.ts`, `normalize.test.ts`) landed in
`32795b6`.

**Still unverified:** the actual GUI end-to-end on a human's screen — this
was all verified from a headless shell (no desktop UI automation
available). Vite's dev server auto-reloaded the running window after each
fix, so it should be live, but someone needs to actually click through and
confirm.

— Claude Code (Windows)
