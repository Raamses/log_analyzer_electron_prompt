# Plan — Part 3: UX / UI

You asked for special note on usability, UX, smoothness, finesse. This is that
section, and it is where I will spend disproportionate effort.

## Guiding stance

The current app is a *dashboard* — it shows you what it decided is interesting.
For arbitrary log formats that stance breaks: we cannot know what matters. So the
app becomes an **instrument**: fast, honest, and steerable, with insight offered
rather than imposed.

## The ingestion moment (highest-stakes screen)

This is where trust is won or lost. On drop, before committing, show a
**preview + mapping** step:

```
┌──────────────────────────────────────────────────────────┐
│  u_ex260824.log · 2.4 MB · 18,432 lines                  │
│  Detected: IIS W3C Extended          confidence 0.94  ▾  │  <- overridable
├──────────────────────────────────────────────────────────┤
│  COLUMN            ROLE            SAMPLE                │
│  date + time    →  Timestamp   ●   2026-08-24 14:22:01   │
│  cs-uri-stem    →  URI         ●   /api/search           │
│  sc-status      →  Status      ●   200                   │
│  X-Forwarded-For→  Client IP   ●   203.0.113.42          │
│  cs-host        →  Host        ◐   www.example.com       │  <- inferred
│  x-custom-tag   →  (unmapped)  ○   checkout-v2           │  <- kept!
├──────────────────────────────────────────────────────────┤
│  3 columns unmapped — they stay browsable & filterable    │
│                            [ Adjust… ]  [ Analyze → ]    │
└──────────────────────────────────────────────────────────┘
```

- `●` high / `◐` inferred / `○` unmapped confidence — legible at a glance
- Unmapped columns framed as **kept**, not as an error. Removes the fear that
  data was silently dropped (the exact failure mode of the current parser).
- Skippable: remember the choice per-fingerprint so returning users go straight
  through. Power users should not be taxed by a wizard.

## Table finesse — the details that decide whether it feels good

| Concern | Decision | Why |
|---|---|---|
| Sort feedback | Optimistic arrow immediately; if >50k rows, sort in worker with a subtle progress shimmer | Never a frozen click |
| Column resize | Drag handle, 8px hit area (bigger than the 1px border), double-click = fit-to-content | 1px targets are a classic usability failure |
| Reorder | Drag header with a live insertion marker | — |
| Pin | Pin timestamp/status left so context survives horizontal scroll | Wide log tables are unusable without this |
| Row height | Compact / comfortable toggle | Density preference is personal |
| Cell overflow | Truncate + full value on hover; click to expand row into a detail panel | Long URIs and UAs are the norm, not the exception |
| Horizontal scroll | Sticky header AND sticky first column; shadow gradient at the scroll edge | Signals more content exists |
| Selection | Click row = detail drawer; shift-click range; `Cmd/Ctrl+C` copies as TSV | Paste into a ticket should just work |
| Keyboard | `↑↓` rows, `PgUp/PgDn`, `Home/End`, `/` focus search, `Esc` clear, `?` shortcuts | Log triage is keyboard work |
| Zebra striping | No. Use hover + subtle row separators | Striping fights status colour coding |
| Monospace | Only for values (IP, URI, latency); UI chrome stays sans | Current code gets this right |

## Smoothness (measurable, not vibes)

- Virtualization with overscan tuned to avoid blank flashes on fast scroll
- `content-visibility: auto` on rows; `transform: translate3d` for the viewport
- Sort/filter above threshold -> worker; UI shows *stale-but-interactive* data
  with a shimmer rather than blocking
- Debounce free-text search 120ms; per-column filters apply instantly (cheap)
- `prefers-reduced-motion` respected throughout
- Perf budget enforced in CI: parse 100k < 5s, sort < 300ms, filter < 150ms

## Honest empty & error states

Four distinct states, never a blank panel:
1. **No file** — dropzone + "try a sample" (IIS / APGW / Cloudflare)
2. **Parsed, 0 rows** — show *why*: "18,432 lines read, 0 matched. First
   unparsed line: `…`" with a Change mapping action
3. **Partial** — "17,900 of 18,432 parsed. 532 skipped." + inspect skipped
4. **Filtered to nothing** — "No rows match" + one-click Clear filters

State 2 and 3 are direct answers to the current parser's opaque
`'Successfully parsed, but no valid log entries were found.'` — which tells the
user nothing actionable.

## Insight, offered not imposed

An **Insights** rail that runs role-driven detectors and surfaces only what
fires, each stating its evidence and linking to the filtered rows:

- Error spike: 5xx rate vs rolling baseline
- Latency regression: p95 shift by endpoint
- Slowest endpoints by p95 (not mean — mean hides tails)
- Suspected scraping: high-volume single IP, low UA diversity
- Cache health: hit ratio by path (when `cache_status` role present)
- WAF activity (when `waf_action` present)
- Sudden 404 cluster (broken deploy / bad link)
- Off-hours traffic anomaly

Every insight must be **falsifiable and traceable**: "p95 for `/api/search` rose
340ms vs the first hour (n=1,240)" + a link that applies that exact filter. No
unexplained scores.

## Sharing ("multiple outlets")

| Outlet | Detail |
|---|---|
| CSV / TSV | Current view — respects filters, sort, column order/visibility |
| JSON / NDJSON | Same, for piping onward |
| Clipboard | TSV, pastes cleanly into Sheets/Excel/Slack |
| Permalink | URL-encoded view state (filters/sort/columns). Data stays local. |
| Session file | `.logview.json` — mapping + view state, no raw data |
| PNG | Chart/table snapshot for tickets |
| Markdown | Table + insight summary for PRs/incident docs |

**Privacy is a hard requirement here.** Logs contain PII (IPs, tokens in query
strings). Everything stays client-side — no upload, no telemetry. Permalinks
encode *view state only*, never rows. I will add an optional
**redact-on-export** (mask IP octets, strip declared-sensitive query params),
and state the guarantee visibly in the UI.
