# Bug Found — GenericTable virtualization never scrolls (huge empty gap)

Ram reported: after loading a file (~1000 rows), the table showed roughly the
first 25 rows, then a huge blank area, then the footer — with no way to see
the rest of the data.

**File:** `src/components/GenericTable.tsx`

## Root cause

`GenericTable` is a virtualized table: it renders a small "window" of
absolutely-positioned rows (`visibleIndices`) inside a spacer div sized for
the FULL row count (`sortedIndices.length * rowHeight` — e.g. 1000 × 36 =
36,000px), and expects the window to slide as the user scrolls a bounded,
`overflow-auto` container.

The `containerHeight` prop (default 500) was used to compute the row-count
math —
```ts
const visibleCount = Math.ceil(containerHeight / rowHeight) + 2;
```
— but was **never applied as an actual CSS height** on the scrollable div. It
only had `className="flex-1 overflow-auto"`, with no `style.height` and no
bounded-height ancestor forcing one (`App.tsx` uses `min-h-screen`, which lets
the page grow to fit content rather than clipping it; nothing between `App`
and `GenericTable` sets a fixed pixel height either).

Net effect: with no real height constraint, the box just grows to fit its
36,000px-tall content instead of clipping and scrolling it. `overflow-auto`
never has anything to scroll, so the native `scroll` event never fires,
`scrollTop` state stays `0` forever, and the virtualization window is frozen
at `startIndex = 0` — permanently showing only the first ~13–16 rows
(computed from the unapplied `containerHeight`), sitting at the top of an
otherwise-empty 36,000px box, with the footer appearing after all that
whitespace since it's the next sibling in DOM flow.

## Fix

Applied `containerHeight` as a real inline `style.height` on the two row
viewports (the main scrollable-columns div and the pinned-columns div), so
the box has a genuine bounded size regardless of what the surrounding page
layout does.

**Related bug caught while fixing this:** the pinned-columns panel (shown
when a column is pinned) isn't itself scrollable — it's clipped
(`overflow-hidden`) and kept in sync by re-rendering the same
`visibleIndices` window the main scrolling panel computes. Its rows were
positioned at `top: (startIndex + i) * rowHeight` — correct ONLY for a panel
that is itself being scrolled (the main panel, where the browser's native
scroll physically moves that offset into view). For the pinned panel, which
has no scroll offset of its own, that formula would have positioned rows
further and further below the visible clipped box as `startIndex` grew,
making them invisible once scrolled past the first screen. Changed to
`top: i * rowHeight` — position within the panel's own local window, which is
what "clipped + synced by re-render" actually requires.

**Note, not fixed:** pinning a column currently appears to be unreachable
through the UI — `GenericTable`'s own `colStates` (which holds `pinned`) is
entirely internal, with no prop or visible affordance to set it, and
`LogAnalyzer.tsx` keeps a *separate* `colStates` of its own (used for its
"Pin timestamp" command-palette action and saved views) that is never passed
into `GenericTable`. So pinning may currently be dead end-to-end regardless
of this fix. Out of scope for this bug — flagging for whoever wires up
pinning next.

## Verification

jsdom doesn't implement real CSS layout, so the actual browser symptom (does
`overflow-auto` physically engage) can't be reproduced in a unit test either
way — passing or failing the old code equally. What IS testable, and does
distinguish old vs. fixed code: whether the scroll container receives a real
height style. Added to `src/components/__tests__/GenericTable.test.tsx`:

- asserts `style.height` on the scroll container equals `containerHeight`
  (confirmed this fails — element/assertion doesn't exist — against the
  pre-fix component)
- asserts the rendered row count for a 1000-row dataset stays small
  (windowed), not close to 1000
- asserts firing a `scroll` event changes which rows are rendered (row 0 →
  row 500), i.e. the state-update path actually responds to scroll position

**Still unverified:** the real browser/desktop-window symptom itself — I
don't have UI automation for the native Tauri window, only a headless shell.
Vite hot-reloaded the running window after each edit, so the fix should be
live; someone needs to actually scroll the table and confirm rows past ~16
render.

— Claude Code (Windows)
