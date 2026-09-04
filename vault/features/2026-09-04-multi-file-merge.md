# Feature — multi-file merge (Phase 2 of the 2026-09-01 direction)

Phase 2 of `vault/decisions/2026-09-01-insights-and-multifile-direction.md`:
the two confirmed-feasible multi-file modes — "stitch same-server across time"
and "combine different servers, same period" — both want the same shape:
several compatible-schema files merged into **one unified Dataset**, not the
tabs model (which stays deferred for comparison-mode / schema-incompatible
sources, per that decision).

**Files:** `src/lib/merge-datasets.ts` (new), `src/App.tsx` (rewired for
multi-select), `src/lib/types.ts` (+`source_file` role, +`DatasetMeta.sourceFiles`)

## What was built

**`mergeDatasets(entries: {dataset, label}[]): Dataset`** — the core merge.
Deliberately conservative: requires every input to expose the exact same
column **key set** (order may differ), throwing a clear error naming which
file/columns disagree otherwise — a merge that silently drops or misaligns
columns is worse than one that refuses and says why. Adds one synthetic
column, `source_file` (new `Role: 'source_file'`), populated per-row with the
originating file's label, so origin stays fully filterable/sortable/groupable
through the existing query language and table — no special UI needed, this is
the payoff of the role-driven architecture: a new column just works.

Requires **2+ entries** — throws otherwise. `App.tsx` branches before calling
it: a single selected file skips merge entirely, so the ordinary one-file case
is byte-identical to before (no unasked-for `source_file` column, no behavior
change) — merging a lone file was a real trap worth guarding against
explicitly, not just avoiding by convention.

**Row concatenation approach:** reads each input dataset's stores back out via
`.get(i)` and rebuilds via the existing `buildColumnarDataset` once on the
combined arrays, rather than hand-merging `ColumnStore` internals. Simpler,
reuses already-tested construction code, and the row-count scale here (bounded
by the same per-file limits already established in the storage-strategy
decision) makes the extra read-through pass cheap.

**App.tsx**: Tauri's file dialog now opens with `multiple: true` (was `false`)
— trivial once noticed, `@tauri-apps/plugin-dialog`'s `open()` already
supported it. Same for the browser `<input type="file">` (added the `multiple`
attribute) and drag-and-drop. Extracted the Rust-chunk-reading logic into a
reusable `readTauriFile()` so it can run in a loop per selected path; fixed a
small pre-existing gap while in there — the original code only called
`close_file` on the success path, not on a failed/partial chunk read, leaking
the Rust-side handle. Now in a `finally`. Progress UI shows "Parsing file i of
N… X%" when multiple files are loading, unchanged "Parsing… X%" for one.

## Verification

- 9 new tests in `merge-datasets.test.ts`: row concatenation order, `source_file`
  population, 3+ file merges, the single-file guard rail, the incompatible-schema
  error message, meta field summation, and — the actual point of merging, not
  just data plumbing — that the merged dataset is fully usable by the real query
  engine (`source_file = x` correctly isolates one input file's rows) and by
  `generateInsights` (counts correctly reflect the combined set, not any single
  input file).
- 4 new tests in `App.test.tsx`, mocking `ingestLogs` (it spawns a real Web
  Worker — not meaningfully testable in jsdom, and not what needs verifying
  here) while letting the real `mergeDatasets` run: single file still skips
  merge, multiple files ingest each and merge, an incompatible-schema merge
  surfaces as a visible error rather than a crash, and a failure partway
  through a batch (file 2 of 3) surfaces as an error rather than a silent
  partial dataset.
- **Confirmed by reverting `App.tsx` and re-running**: 3 of the 4 new App
  tests correctly fail against the pre-multi-file version (only the
  single-file case passes either way, as expected) — proves these are real
  regression tests, not incidentally-passing ones.
- Full suite re-run clean after: 221 lib tests + 31 component/App tests, no
  regressions.
- **Real-data verification, and it's a genuinely strong result**: merged the
  two actual IIS log files used throughout this session —
  `u_ex260711.log` (1,965 rows, one server) + `u_ex260710.log` (9,936 rows, a
  *different* server, per its `server-17` path — real cross-server, cross-day
  data, not a contrived same-file duplicate). Merged row count: exactly
  11,901. `source_file` correctly isolates each file's rows (9,936 for one,
  matching exactly). Merged time span correctly spans both days
  (2026-07-10T00:00 → 2026-07-11T23:57). **And the predicted payoff from the
  original ideation showed up immediately**: `top-talker` insights on the
  merged set report *combined* counts across both files — 172.16.16.14 at
  3,534 requests / 29.7% of the merged traffic — a number invisible in either
  file's own insights alone. This is exactly the "insights get sharper once
  merged" effect from `2026-09-01-insights-and-multifile-direction.md`,
  confirmed on real data on the first real test, not just claimed.

**Still unverified:** the real desktop window — same caveat as every prior
fix, no GUI automation available. This one's slightly more exposed than
previous fixes since it touches the actual native multi-select file dialog
(`@tauri-apps/plugin-dialog`'s `open({multiple: true})`), which the verification
script above doesn't exercise at all (it calls the ingest/merge pipeline
directly on real files, bypassing the dialog and Rust chunk-reading path
entirely). Someone needs to actually open the app and multi-select 2+ files
through the real dialog to confirm that specific path works end-to-end.

## Next steps (not started)

Per the original decision doc's sequencing:
- **"Add more files" to an already-loaded dataset** — right now merging only
  happens at initial load (select 2+ files together); there's no way to load
  one file, then add a second later without starting over. Natural follow-up,
  same underlying `mergeDatasets`.
- **Cross-log-type correlation** (mode 3, IIS ↔ Pelecard ↔ app logs) — still
  deferred, no evidence of a shared correlation token yet. Revisit if/when Ram
  has a checkout-window log sample to check.
- **Tabs / comparison mode** — the model this session deliberately did NOT
  build (merge was prioritized instead). Worth building once there's a real
  need to keep datasets separate-but-comparable rather than combined.
- **GeoIP** (abandoned WIP in the untracked stash) — still not prioritized;
  revisit if real incident data starts flowing through this tool.
- Minor UX polish not done: `dataset.meta.file`'s merged-file summary string
  could get unwieldy with many files (currently lists every filename); fine
  for the 2-3 file case tested, worth truncating if someone merges a dozen.

— Claude Code (Windows)
