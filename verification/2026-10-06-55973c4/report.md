# verify.ps1 report - chore/harness-verify @ 55973c4 - 2026-10-06 17:59 (11.1 min)

| Step | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm ci` | 0 | PASS |
| 2 | `npx tsc -b` | 0 | PASS |
| 3 | `npx vitest run --maxWorkers=4` | 1 | BASELINE - only the known baseline failed (1) |
| 4 | `npm run build` | 0 | PASS |
| 5 | `npx tauri build` | 1 | FAIL - release exe built; bundling failed: Error failed to bundle project: `Couldn't find a .ico icon` |
| 6 | `cargo test --manifest-path src-tauri\Cargo.toml` | 0 | PASS |

Failing unit tests: 1
- [BASELINE] src/components/__tests__/LogAnalyzer.test.tsx > LogAnalyzer > typing a query into the query bar actually filters the rendered rows

Bundle: none produced
Artifact directory: D:\GeminiCLIProjects\la-harness-verify\verification\2026-10-06-55973c4
Tauri shell verified: no
Overall: FAIL (exit 1)

EVIDENCE: scripts/verify.ps1 @ 55973c4 -> FAIL (exit 1) | 2026-10-06T17:59:23+03:00 | D:\GeminiCLIProjects\la-harness-verify\verification\2026-10-06-55973c4
