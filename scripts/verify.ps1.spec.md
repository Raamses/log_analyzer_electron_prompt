# verify.ps1 — SPECIFICATION for claude-win (Windows)
#
# STATUS: IMPLEMENTED in scripts/verify.ps1 by claude-win on 2026-10-06. AmosBot (Pi) authored
# this spec on 2026-10-05; the Pi has no `cargo`/`rustc`, so it cannot run any of this.
#
# Amendments made while implementing (claude-win, 2026-10-06):
# - "Wrong branch" (exit 2) means HEAD does not CONTAIN origin/feat-log-analyzer-electron. A PR
#   branch built on the trunk passes; `main`, or a branch older than the trunk, is refused.
# - The known unit baseline, and only it, counts as passed: the step is reported BASELINE and does
#   not make the run exit 1. Any other failing test, or a different name, is a failure.
# - Extra artifacts beside the required ones: npm-ci.log, tsc.log, build.log, report.md.
# - Step 3 runs `npx vitest run --maxWorkers=4`. With vitest's default (one worker per core, 22 on
#   the Windows box) every worker timed out and no test ran, on both 2026-10-06 runs; with 4 the
#   suite runs (252 passed, 1 failed = the baseline).
# - CI=true, not CI=1: the tauri CLI rejects CI=1.
#
# Deliver it to claude-win via `mailbox --to claude-win`. Do not guess the commands —
# implement exactly what is written here, or amend this spec and say so in the reply.

## Why Windows
`log_analyzer_repo/log-analyzer-dashboard/src-tauri/` is a **Tauri v2** app (Rust backend +
web frontend). IPC, the native file dialog, and the packaged binary only run on a desktop host.
The Pi-side `scripts/verify.sh` is a *sanity* gate (tsc + vitest) and is explicitly NOT the
done signal — see `AGENTS.md`.

## Preconditions
- Windows host with Node 20+ and Rust stable (`cargo --version` succeeds).
- Repo checked out, on branch **`feat-log-analyzer-electron`** (the default branch; NOT `main`).
- Working directory: `log-analyzer-dashboard\`.

## Steps, in order. Run every step; never abort early — the report must list every failure.

1. `npm ci`
2. `npx tsc -b`
3. `npx vitest run`
4. `npm run build`                        # tsc -b && vite build
5. `npx tauri build`                      # produces the release bundle
6. `cargo test --manifest-path src-tauri\Cargo.toml`   # Rust-side unit tests, if any exist

## Exit-code semantics (strict)
- **exit 0** = every step above passed.
- **exit 1** = at least one step failed.
- **exit 2** = harness error (missing toolchain, wrong branch, repo not found). Never use 2 for a
  product/test failure — the caller must be able to tell "broken build" from "broken machine".
- Do not mask a failing step by continuing silently; print the failing step's output verbatim,
  then still run the remaining steps so one run yields the full picture.

## Artifacts — where they land
All under `verification/`, dated, never overwritten:

```
verification/YYYY-MM-DD-<short-sha>/
  verify.log            full transcript of all 6 steps, step banners + exit codes
  tauri-build.log       stdout/stderr of `npx tauri build`
  unit.log              vitest output
  cargo-test.log        cargo test output
  bundle-path.txt       absolute path of the produced installer/exe
```

`<short-sha>` = `git rev-parse --short HEAD` on the tested commit. If `verification/<dir>` already
exists, suffix with the run timestamp — do not clobber a prior run.

## Known baseline (do not report these as new failures)
- Every entry is a known failure **owned by an open bug note**. It is a deferral (rubric R13), not "fine".
- Unit: 1 failure: `src/components/__tests__/LogAnalyzer.test.tsx > typing a query into the query bar
  actually filters the rendered rows`. **This is a live regression of the 2026-09-01 fix** (that note cites
  this test as the proof). Owner: `vault/bugs/2026-10-07-query-bar-filter-regression.md`. It fails on the
  trunk @ 3792a2a and on `fix/wire-3vl-filter`. Report it as BASELINE until the fix lands, then delete this
  entry and the matching entries in verify.ps1 and verify.sh.
- Report the failing-test **count** and the failing-test **names**; do not treat an equal count
  with different names as green.

## Report back
Per step: command, exit code, pass/fail. Then: bundle path, artifact directory, and the explicit
statement "Tauri shell verified: yes/no". A text-only "done" without those is not a verification.