# verify.ps1 report - chore/harness-verify @ 6502185 - 2026-10-07 22:51 (7.2 min)

| Step | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm ci` | 0 | PASS |
| 2 | `npx tsc -b` | 0 | PASS |
| 3 | `npx vitest run --maxWorkers=4` | 1 | BASELINE - only the known baseline failed (1) |
| 4 | `npm run build` | 0 | PASS |
| 5 | `npx tauri build` | 0 | PASS |
| 6 | `cargo test --manifest-path src-tauri\Cargo.toml` | 0 | PASS |

Failing unit tests: 1
- [BASELINE] src/components/__tests__/LogAnalyzer.test.tsx > LogAnalyzer > typing a query into the query bar actually filters the rendered rows

Bundle: D:\GeminiCLIProjects\la-harness-verify\log-analyzer-dashboard\src-tauri\target\release\bundle\msi\log-analyzer_0.1.0_x64_en-US.msi; D:\GeminiCLIProjects\la-harness-verify\log-analyzer-dashboard\src-tauri\target\release\bundle\nsis\log-analyzer_0.1.0_x64-setup.exe
Artifact directory: D:\GeminiCLIProjects\la-harness-verify\verification\2026-10-07-6502185-224431
Tauri shell verified: yes
Overall: PASS (exit 0)

EVIDENCE: scripts/verify.ps1 @ 6502185 -> PASS (exit 0) | 2026-10-07T22:51:45+03:00 | D:\GeminiCLIProjects\la-harness-verify\verification\2026-10-07-6502185-224431
