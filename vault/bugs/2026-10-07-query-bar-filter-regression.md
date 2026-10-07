# Bug: the query bar no longer filters the rendered rows (regression of 2026-09-01)

**Status:** OPEN · regression · owned by fleet-board card **c6f5e3ef**, "log-analyzer: query bar filter regression". It starts after PR #23 merges, because it also removes the baseline entries.
**Found:** 2026-10-07, by the gate's review of PR #23 (finding F1.1), from the verify.ps1 evidence on that PR
**Test:** `log-analyzer-dashboard/src/components/__tests__/LogAnalyzer.test.tsx` › `LogAnalyzer` › *typing a query into the query bar actually filters the rendered rows*

## Symptom

The test fails on the trunk (`feat-log-analyzer-electron` @ 3792a2a) and on every branch built from it. It types a filter into the real query bar and expects the rendered table to change. The row the filter should remove (text `/api/missing`) is not found where the test expects the filtered result: see `verification/2026-10-07-6502185-224431/unit.log`.

## Why this is a regression, not a "baseline"

`vault/bugs/2026-09-01-filter-and-hide-column-not-wired.md` records this test as the **proof that the user-reported bug was fixed**: "Confirmed 4 of 5 new tests fail against the pre-fix components". So the query bar is broken again for users. Between then and the trunk tip, the query path changed: the 3VL bitset filter was wired into the live query path, with the `in` / dict-column / `~=` routing commits.

## How the harness treats it until fixed

`scripts/verify.ps1` and `scripts/verify.sh` list this test, by file and exact name, as the one known failure, and they point here. Any other failing test, or this one under a different name, still fails the run. When the fix lands, remove the entry from both scripts and from `scripts/verify.ps1.spec.md` ("Known baseline"), and close this note with the fixing commit.

## Next

The owning card bisects the trunk between the 2026-09-01 fix and 3792a2a, fixes the wiring, and keeps the integration test unchanged (rubric R5: never weaken the test that proves the fix).
