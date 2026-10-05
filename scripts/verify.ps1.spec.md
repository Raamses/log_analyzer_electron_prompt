# verify.ps1 — SPECIFICATION for claude-win (Windows)
#
# STATUS: SPEC ONLY — not implemented. AmosBot (Pi) authored this on 2026-10-05; the
# implementation belongs to claude-win, which owns the Windows toolchain. Pi has no
# `cargo`/`rustc` (verified 2026-10-05), so it cannot run any of this.
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
- Unit: 1 pre-existing failure —
  `src/components/__tests__/LogAnalyzer.test.tsx > typing a query into the query bar actually
  filters the rendered rows`. Verified byte-identical on `fix/wire-3vl-filter` and on
  `feat-log-analyzer-electron` @ `10aba18` (2026-10-05). Report it as BASELINE, not a regression.
- Report the failing-test **count** and the failing-test **names**; do not treat an equal count
  with different names as green.

## Report back
Per step: command, exit code, pass/fail. Then: bundle path, artifact directory, and the explicit
statement "Tauri shell verified: yes/no". A text-only "done" without those is not a verification.