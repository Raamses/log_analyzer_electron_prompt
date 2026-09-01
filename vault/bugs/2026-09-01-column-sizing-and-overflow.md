# Feature/Bug — columns not sized to their data, long values bleed into the next column

Ram asked for a plan to make table columns "adequate to the data they hold" — not too
big, not too small — and for long values to stop overflowing into the neighboring
column. Two separate, related problems in `src/components/GenericTable.tsx`.

## Problem 1: every column started at a flat 140px regardless of content

A 3-character status code and a 200-character query string got the exact same
initial width. There was already a manual "double-click to fit" affordance (canvas
`measureText` over a sample of rows), but nothing ran it automatically, so every
freshly-loaded file looked identically (mis-)sized until the user manually
double-clicked every column header.

**Fix:** extracted the per-column measuring logic out of the double-click handler
into a pure, exported, unit-testable function (`measureColumnWidth`), and run it for
every column when the dataset first loads (inside the `colStates` lazy `useState`
initializer, so it naturally re-runs per file load — `GenericTable` remounts on each
new dataset per `App.tsx`'s `{dataset && <LogAnalyzer .../>}` conditional).
`handleResizeDoubleClick` now calls the same function instead of duplicating the
canvas code.

Initial auto-fit is capped at 320px (`AUTO_FIT_MAX_WIDTH`), deliberately tighter than
the manual double-click's 600px cap — an automatic default shouldn't let one
long-text column (a User-Agent, a query string) dominate the table; a user who
double-clicks is explicitly asking to see more.

## Problem 2 (the actual "bleeds into next column" bug): flex items don't shrink below their content's natural size by default

**Root cause:** every column cell is `<div style={{width: N}}>`, a flex item inside
a `flex items-center` row. CSS flex items have an implicit `min-width: auto`, which
resolves to the content's own minimum size — for `white-space: nowrap` text (as set
by the inner `truncate` span), that's the FULL unwrapped text width. The explicit
`width` style only sets the flex-basis/preferred size; it does not override this
minimum. So a value wider than its column's `width` just keeps growing the box
rather than being clipped — visually "bleeding" into the neighboring column,
regardless of what width was chosen (auto-fit, drag-resized, or the old flat
default — this was never about picking the "right" number).

This is a well-known CSS flexbox pitfall; the spec's own escape hatch is exactly
what fixes it: giving the flex item an explicit `overflow` other than `visible`
makes its automatic minimum size resolve to `0` instead of its content size.

**Fix:** added `min-w-0 overflow-hidden` to all four column-cell wrapper divs
(pinned header, pinned body, scrollable header, scrollable body).

**Secondary fix, same root class of bug:** the cell content itself was a bare
`<span className="truncate">`. A plain inline `<span>` has no width of its own for
`overflow:hidden` + `text-overflow:ellipsis` to act against — with no ellipsis glyph
possible, browsers would have just hard-clipped it at the parent's boundary (once
Problem 2's fix stopped the parent from growing) with no "…" shown. Changed
`renderCell`'s return value from `<span>` to `<div>` — a block-level box takes its
parent's now-fixed width and `truncate` renders the ellipsis correctly. Also added
`title={formatted}` so the full value is always available on hover, and did the same
for header labels (`title={col.label}`) since long humanized/generated labels have
the identical exposure.

## Verification

- `measureColumnWidth` is fully unit tested with a fake `measureText` (proportional
  to string length) — covers: sizes to header label with no data, grows to fit the
  longest sampled value, clamps at both `minWidth` and `maxWidth`, and respects
  `sampleSize` (doesn't scan the whole dataset).
- Component tests assert every header/body cell (via `data-testid="table-header-cell"`
  / `"table-row"`) carries `min-w-0 overflow-hidden`, and that a long value renders in
  a `<div>` (not `<span>`) with `truncate` and a matching `title`.
- Confirmed by reverting `GenericTable.tsx` and re-running: the `min-w-0`/
  `overflow-hidden` test fails against the pre-fix component (the `data-testid`
  it queries didn't even exist yet).

**Still unverified:** the actual visual result on Ram's screen — jsdom doesn't do
real CSS layout, so "does it actually stop bleeding" can only be confirmed by eye.
Auto-sizing specifically can't be observed in a component test at all — jsdom's
`canvas.getContext('2d')` returns `null`, so in tests `computeInitialColumnWidths`
takes its documented fallback path (flat `DEFAULT_WIDTH` for every column, same as
before); the real sizing math is only exercised via the pure `measureColumnWidth`
unit tests, with a fake measurer. Someone needs to actually load a file with a mix
of short (status) and long (URI, User-Agent) columns and eyeball it.

— Claude Code (Windows)
