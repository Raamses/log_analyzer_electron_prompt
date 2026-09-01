# Bug Found — query filter and command-palette "hide column" did nothing

Ram reported: typing a query into the query bar doesn't filter the table, and
choosing "Hide Time" from the command palette (⌘K) doesn't hide the column.

**File:** `src/components/LogAnalyzer.tsx` / `src/components/GenericTable.tsx`

## Root cause — the same one, for both symptoms

`GenericTable.tsx`'s own doc comment says: *"Pure presentation — all state
managed by parent via props."* It doesn't actually do that. It manages
`colStates` (visibility/width/pin/order) and the row set entirely internally,
and only exposes an `onSort` OUT-callback — there was never a way for a parent
to feed it a filtered row list, externally-driven column visibility, or a
controlled sort.

Meanwhile `LogAnalyzer.tsx` — the component whose own doc comment describes
it as *"the orchestrator that ties [everything] together"* — computed exactly
the state `GenericTable` needed and then never passed it down:

```tsx
const filteredIndices = useMemo(() => filterRows(dataset, parsedQuery.where), ...);
const [colStates, setColStates] = useState<Record<string, ColumnState>>(...); // its OWN copy

<GenericTable
  dataset={dataset}
  rowHeight={36}
  containerHeight={500}
  onSort={handleSort}
  {/* filteredIndices? colStates? Never passed. */}
/>
```

`filteredIndices` was only ever read by `ExportMenu` (so exporting a filtered
CSV worked correctly — this is precisely why the bug wasn't obvious from
export behavior). The command-palette's "Hide X", "Show all columns", "Pin
timestamp", and `SavedViews`' hidden/pinned restore all mutated
`LogAnalyzer`'s *own* `colStates` — a completely separate object from the one
`GenericTable` renders from internally. Every one of those actions "worked"
in the sense that `LogAnalyzer`'s state updated correctly; none of them had
any visible effect, because `GenericTable` never saw the update. (Same root
cause as the pinning gap flagged-but-not-fixed in
`2026-09-01-generictable-virtualization-unbounded-height.md` — this is that
"whoever wires up pinning next" turning out to be the very next bug report.)

## Fix — make GenericTable actually match its own contract

Converted `colStates` and `sort` to a **controlled/uncontrolled hybrid**:
`GenericTable` accepts optional `colStates`/`onColStatesChange` and `sort`
props; when given, they're the source of truth and every internal mutation
(drag-resize, double-click-to-fit, sort-by-header-click, the "+ show column"
button) routes through `onColStatesChange`/`onSort` instead of local state.
Omit them and it falls back to managing its own state exactly as before —
this keeps the existing standalone tests and any other future usage working
unchanged. Added a new `rowIndices?: number[]` prop as the base row set
(defaults to every row); `LogAnalyzer` now passes its `filteredIndices` here.

`LogAnalyzer.tsx` now passes `rowIndices={filteredIndices} colStates={colStates}
onColStatesChange={setColStates} sort={sort}` into `<GenericTable>`. Also
fixed a bonus regression this would otherwise have caused: `LogAnalyzer`'s own
`colStates` initializer built a flat `width: 140` for every column (the exact
thing `2026-09-01-column-sizing-and-overflow.md` fixed *inside* GenericTable)
— since LogAnalyzer is now the state owner, its initializer needed the same
auto-fit logic. Exported `createInitialColumnStates()` from `GenericTable.tsx`
as the one shared factory both components call, instead of `LogAnalyzer`
reimplementing (and silently regressing) it.

**Secondary, not-reported, same-root-cause bug also fixed while in here:**
sort applied via a query pipe (`... | sort by latency desc`) had the identical
problem — `LogAnalyzer.handleQueryApply` set its own `sort` state, which
`GenericTable` never received either. Now fixed by the same `sort` prop.

**Also fixed:** a scroll-position bug this surfaced during testing — when a
filter shrinks the row set, a deep previous scroll position left the table
rendering nothing (scrolled past the new, shorter content). Reset on
`rowIndices` change; the state part is derived during render rather than in
an effect (this codebase's `react-hooks/set-state-in-effect` lint rule
forbids the latter — same pattern already used in `CommandPalette.tsx`'s
`queryRef`), the actual DOM `scrollTop` mutation stays in an effect.

## Verification

The critical thing: **`GenericTable`'s own tests could never have caught
this class of bug** — they always render `GenericTable` directly with
whatever props the test hands it; the bug was entirely in whether
`LogAnalyzer` handed it the right props. Added
`src/components/__tests__/LogAnalyzer.test.tsx` — a real integration test
that renders the actual `LogAnalyzer` (not `GenericTable` in isolation),
types into the real query bar, opens the real command palette, and asserts
against the rendered table. Confirmed 4 of 5 new tests fail against the
pre-fix components (typing a filter does nothing; hide does nothing; show-all
does nothing) — only the "renders unfiltered by default" baseline passes
either way, as expected. Also added `GenericTable`-level tests for the new
`rowIndices`/`colStates`/`sort` props directly (defense in depth, independent
of `LogAnalyzer`'s wiring).

**Still unverified:** the real desktop window — same limitation as every
other fix this session, no GUI automation available, verified via automated
tests reproducing the exact reported symptoms with synthetic data instead.
The root cause is pure component-wiring, not data-dependent, so it should
behave identically on any file — Ram's offered `u_ex260710.log` wasn't
needed for this one specifically, but is worth using for an eyeball check
in the live app regardless.

— Claude Code (Windows)
