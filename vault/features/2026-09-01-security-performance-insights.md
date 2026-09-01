# Feature — 7 new insight detectors (security + performance)

Phase 1 of the direction agreed in `vault/decisions/2026-09-01-insights-and-multifile-direction.md`:
finish the originally-planned-but-unbuilt detectors first, then add the security-flavored
ones the engine had none of. All additive — the existing 4 detectors
(elevated error rate, slow endpoints, top talkers, cache health) are untouched.

**File:** `src/lib/insights.ts` (+ two small, safe additions to `src/lib/query.ts`)

## What was built

**Shared machinery** (`bucketizeByTime`, `detectRateSpike`): splits the dataset's own
time span into buckets and compares each bucket's rate for some predicate against
the dataset's own overall baseline rate — the "rolling baseline" idea from the
original design doc, as opposed to a flat global threshold. One shared
implementation, used by two detectors, so they can't drift into different
statistics.

1. **`error-rate-spike`** — a time window where the error rate is well above the
   dataset's own baseline (not "errors exist," but "errors are unusually
   concentrated right here"). A service that's normally 0.5% errors and jumps to
   3% for ten minutes is a materially different signal than one that's always at
   3%, and the old flat-threshold insight couldn't tell them apart.
2. **`404-cluster`** — same mechanism, narrowed to exactly 404 with a stricter
   threshold (broken-deploy/bad-link signature, distinct from a general error spike).
3. **`latency-regression`** — per endpoint, p95 in the first half of the time span
   vs the second half. The existing `slow-endpoint` insight is a snapshot ("this is
   slow"); this is a trend ("this got slower").
4. **`off-hours-concentration`** — a quiet hour-of-day (relative to *this dataset's
   own* volume curve — not an assumed "night time," which would be wrong for a
   file that happens to only cover business hours) where one IP dominates the
   traffic. Brute-force/scanning shape, not a UX pattern.
5. **`repeated-failures-ip`** — an IP with real volume AND a high failure rate.
   Deliberately distinct from `top-talker` (which fires on volume alone,
   regardless of success/failure) — a busy, healthy client and a busy, failing
   client are different problems.
6. **`suspicious-path`** — known probe/attack signatures in the URI (`.env`,
   `wp-login`, `.git/`, `../` traversal, SQL-injection/XSS patterns, admin-panel
   probes).
7. **`scanner-user-agent`** — known scanner/tool User-Agent signatures (sqlmap,
   nikto, nmap, masscan, curl, python-requests, etc.).

**Not built this pass, deliberately:** an "empty/missing User-Agent" insight was
drafted and dropped — the query engine's `filterRows` treats an empty cell as an
automatic non-match for *every* comparison operator (`if (cell == null || cell
=== '') return false`), so there is currently no way to write a query that
matches "this field is empty." An insight whose evidence link can never actually
reproduce its own claim violates the "falsifiable and traceable" rule the
original design doc sets for this whole feature, so it was cut rather than
shipped with a decorative-only evidence link. Worth fixing in `query.ts`
separately if this is wanted later — noted, not fixed here (changes core
matching semantics, deserves its own review).

## query.ts: two small alias additions, needed for correct evidence queries

- `user_agent` role alias — didn't exist. Without it, an evidence query like
  `user_agent contains "sqlmap"` silently fails to resolve for any format whose
  actual column key/sourceName isn't literally "user_agent" (e.g. IIS's
  `cs-user-agent`) — the query engine's unresolved-field behavior is "match
  everything," which would have made the insight's evidence link return the
  *whole dataset*, not the flagged rows. Fixed by aliasing on `col.role ===
  'user_agent'`, the same pattern already used for `status`/`client_ip`/`uri`/
  `method`/`latency_ms`.
- `timestamp` alias — same problem, trickier: some formats (IIS W3C) bind BOTH a
  `date` and a `time` column to the `timestamp` role, and only the one named in
  `schema.primary.timestamp` holds a real combined value (see the split-timestamp
  fix from earlier this session). A naive per-column alias in the loop would have
  the *last-processed* timestamp-role column silently win — for IIS that's `time`,
  the one that's always empty. Aliased against `dataset.schema.primary.timestamp`
  specifically, resolved once after the per-column loop, not inside it.

## Verification

- 18 new tests in `insights.test.ts`: one per detector's firing condition, using a
  purpose-built time-series fixture generator (the existing `makeDataset` fixture
  spans 1 second total — useless for bucket-based detectors). Each detector also
  has a negative case (uniform data, a control endpoint, a healthy high-volume
  IP) confirming it does NOT fire when it shouldn't, not just that it fires when
  it should.
- **The traceability guarantee is directly tested**, not assumed: one test runs
  every insight's `evidenceQuery` through the real `parseQuery`/`filterRows`
  and asserts it parses cleanly and returns at least one row. This is exactly
  the class of bug that would otherwise ship silently — an evidence link that
  looks right in a code review but resolves to nothing or to everything.
- 4 new tests in `query.test.ts` for the alias additions, including the specific
  split-timestamp trap (asserts `timestamp` resolves to the primary column, not
  whichever one the loop processed last) and the deliberate no-guess case (when
  `schema.primary.timestamp` is unset, `timestamp` doesn't alias to anything,
  rather than silently picking a plausible-looking column).
- Full `src/lib/__tests__/` suite re-run after: 212 tests, all passing, no
  regressions in anything untouched.
- Ran against both real IIS log files used throughout this session
  (`u_ex260711.log`, `u_ex260710.log`) via a throwaway script (not committed):
  both are pure internal settings-polling traffic, 100% status 200, no errors,
  no scanner-looking User-Agents. The new detectors correctly found **nothing**
  on both — confirmed this is genuine absence-of-signal (verified timestamps
  resolved, 1965/9936 valid, full-day spans) rather than a silent failure, not a
  bug. The existing detectors (slow-endpoint, top-talker) did fire correctly on
  both, including a real, severe finding: `GetExDiscounts` p95 = 59.6s.

**Still unverified:** the new detectors firing on data that actually contains
the anomalies they're built for — neither sample file has any errors or
attack traffic, so there's no real-world positive case in hand yet. Confidence
comes from the synthetic tests (deterministic, known-correct by construction)
plus the real-data negative cases (no false positives). If/when Ram has a log
window that actually includes an incident, worth re-running against it.

— Claude Code (Windows)
