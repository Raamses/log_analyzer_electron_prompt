# Plan — Generic Log Analyzer

status: DRAFT — awaiting user approval
branch: `feat/generic-log-analyzer`
created: 2026-08-24

## 1. What I found in the existing code

Read before proposing anything: `parser.ts` (449 LOC), `VirtualizedLogViewer.tsx`
(197), `analytics.ts` (464), `useLogAnalysis.ts` (398), `App.tsx` (617).

### The real blocker is not the table

The table being non-generic is a *symptom*. The actual constraint is the
`LogEntry` interface in `parser.ts:3-19`:

```ts
export interface LogEntry {
    timestamp: Date; uriStem: string; statusCode: number;
    timeTaken: number; clientIp: string;
    method?: string; userAgent?: string; deviceCategory?: DeviceCategory;
    scBytes?: number; csBytes?: number;
    hotelCode?: string | null;      // <-- domain-specific
    composition?: string | null;    // <-- domain-specific
    stayDuration?: number | null;   // <-- domain-specific
    totalGuests?: number | null;    // <-- domain-specific
    childrenPresent?: boolean | null; // <-- domain-specific
}
```

Every unknown column is **discarded**. `parseLogs()` reads `#Fields:`, maps ~10
known names to fixed slots, and throws the rest away. So no amount of table work
makes it generic — the data never survives ingestion.

### Findings

| # | Finding | Evidence |
|---|---|---|
| F1 | Fixed 5-required-field shape; unknown columns dropped | `parser.ts:3-19`, `:288-305` |
| F2 | Table columns hardcoded as 12-col grid | `VirtualizedLogViewer.tsx:71-78` + row at `:96-131` |
| F3 | Hotel/travel domain logic in the generic parser | `parseSearchParams()` `:105-270`, 165 LOC |
| F4 | URI rewriting to `/singleHotelSearch` inside the parser | `:357-364` |
| F5 | Only 2 formats, detected by hardcoded sniffing | `:285-336` |
| F6 | Azure detection needs BOTH literal strings present | `:309` |
| F7 | IIS split on `' '` — breaks on quoted fields w/ spaces | `:347` |
| F8 | No CSV support despite `mock_azure_logs.csv` existing (it is TSV) | repo root |
| F9 | Domain coupling spread across 6 files | grep: parser, analytics, useLogAnalysis, worker, 2 tests |
| F10 | No sort, no column resize/reorder/hide, no export | absent from viewer |
| F11 | 23 unit tests, 0 real e2e (`verify_dashboard.py` is a screenshot script) | `src/test/`, `verification/` |
| F12 | Timestamp `new Date(...)` per row — slow + locale-fragile | `:377-379` |

### What is worth keeping

- Web Worker parsing (`logParser.worker.ts`) — right call, keeps UI responsive
- Virtualized rendering — right call, needed for 100k+ rows
- `classifyUserAgent()` — genuinely generic, reusable as an enrichment
- `ipUtils` + `ContextMenu` (IP tooling) — good UX, format-agnostic
- Tailwind v4 + React 19 + Vite 7 + strict TS — stack is current, keep it
- `.cursorrules` — has real constraints (no Electron, no `any`, ms latency)

## 2. Design decision

**Reject** "add more format branches to `parseLogs()`" — that is F5/F6 repeated
per format, and it keeps the fixed-shape problem.

**Adopt** a three-layer split:

```
Layer 1  DIALECT     bytes -> rows of raw string cells + column names
         (framing: W3C, CSV, TSV, JSON-lines, combined/CLF regex)

Layer 2  SCHEMA      raw columns -> typed, semantically-tagged fields
         (registry maps source column names -> canonical roles)

Layer 3  ANALYTICS   typed fields -> metrics, driven by ROLES not names
         + PLUGINS   domain extras (hotel/travel) live here, opt-in
```

The key idea is **semantic roles**. Analytics must not ask "is there a
`statusCode` field"; it asks "is there a field with role `status`". Then a
Cloudflare `EdgeResponseStatus`, an IIS `sc-status`, and an APGW `HttpStatus`
all light up the same widgets without special-casing.

### Canonical roles (initial set)

`timestamp` · `status` · `latency_ms` · `client_ip` · `method` · `uri`
`query` · `user_agent` · `bytes_out` · `bytes_in` · `host` · `referrer`
`protocol` · `edge_location` · `cache_status` · `backend` · `request_id`
`waf_action` · `tls_version` · `country` · `unknown`

Anything unmapped keeps role `unknown` — **still ingested, still displayed,
still filterable**. That is the difference from today.
