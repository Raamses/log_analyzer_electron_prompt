# AGENTS.md — Log Analyzer (Generic Log Analyzer / Tauri v2)

> ## ⚠️ THE DEFAULT BRANCH IS `feat-log-analyzer-electron` — **NOT `main`**
> The repo's `origin/HEAD` points at `feat-log-analyzer-electron`. `main` does not exist as
> the trunk. Clone/checkout/PPR/review against **`feat-log-analyzer-electron`** or your diff will
> be measured against a stale ancestor and "green" will mean nothing.
>
> **Naming trap:** the branch says *electron*, the app is **Tauri v2** (`src-tauri/`, `@tauri-apps/*`).
> Electron was removed (`refactor/remove-electron-final` exists in history). Trust `src-tauri/`,
> not the branch name.

## Where work happens — the Pi/Windows split
- **Pi (`~/.openclaw/workspace/log_analyzer_repo/`) = orchestration + vault truth.** Board, specs,
  evidence bookkeeping, review triage. Do not try to build the Tauri shell here.
- **Windows = build + test.** The app is a desktop shell; the real build/test/e2e runs on Windows
  via **`claude-win`** (mailbox peer, protocol v2.2). Dispatch with
  `mailbox --to claude-win`, not by SSH.
- To ask for a Windows run, use `scripts/verify.ps1` (exact commands, exit-code semantics, and
  where artifacts land) — see "Verification" below. Never invent a Windows command; the spec is
  the contract.

## Verification — evidence discipline
**Pass = test pass.** Prose "done" is invalid. Evidence = command + result + date.

| Where | Command | Artifact |
|---|---|---|
| Pi (sanity, fast) | `scripts/verify.sh` | stdout + date in the commit |
| Windows (authoritative) | `scripts/verify.ps1` | `verification/<YYYY-MM-DD>-<sha>.{log,png}` |

- All verification artifacts land in **`verification/`**, dated, never overwritten.
- Pi `verify.sh` is a **sanity gate only** (tsc + vitest). It cannot prove the desktop shell,
  the Tauri IPC path, or the real log-file dialog. Green here ≠ done.
- The Windows run is the one that counts for a "done" claim.

## Vault is truth for product decisions
- `vault/` holds decisions, roadmap, bugs, reviews. Source-of-truth order:
  `vault/decisions/` → `vault/roadmap/` → `vault/bugs/` → code.
- Review findings and security work land in `vault/reviews/` and `vault/bugs/` with dates.

## Scope
- **One feature per session.** Anything discovered along the way becomes a new card/note in
  `vault/backlog.md` — never onto the active branch.
- `feat-log-analyzer-electron` is the protected trunk: every change lands via PR with review.
  Never push directly to it.
- Fleet-wide protocols (update/remove, evidence, progress-file discipline, verification-sanity-suite
  spec) live in the harness kit README at `~/.hermes/harness/README.md` — reference it, do not
  duplicate it here.