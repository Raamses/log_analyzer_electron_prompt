# Plan — Part 2: Architecture & Phases

## 3. Type model

```ts
type Role = 'timestamp' | 'status' | 'latency_ms' | 'client_ip' | 'method'
          | 'uri' | 'query' | 'user_agent' | 'bytes_out' | 'bytes_in'
          | 'host' | 'referrer' | 'protocol' | 'edge_location'
          | 'cache_status' | 'backend' | 'request_id' | 'waf_action'
          | 'tls_version' | 'country' | 'unknown';

type CellType = 'string' | 'number' | 'int' | 'date' | 'bool' | 'ip' | 'url';

interface ColumnDef {
  key: string;          // stable id, slugified
  sourceName: string;   // EXACT original header — never lost
  label: string;        // display
  role: Role;
  type: CellType;
  index: number;        // position in raw row
  nullable: boolean;
  confidence: number;   // 0-1, how sure the mapping is
}

interface Dataset {
  columns: ColumnDef[];
  rows: Row[];          // columnar storage, see below
  dialect: DialectId;
  meta: { file: string; bytes: number; parsedAt: Date;
          skipped: number; warnings: string[] };
}
```

### Columnar, not row-objects

Store as typed arrays per column, not `Array<Record<string, unknown>>`.
For 500k rows × 25 columns, row-objects mean 12.5M JS objects — GC death.
Columnar gives us `Float64Array` for latency, `Int32Array` for status,
interned string dictionaries for low-cardinality columns (method, cache status).

This also makes sort O(n log n) over an index array without touching row data,
and makes filtering a bitmap operation.

**Trade-off accepted:** columnar is more code than row-objects. Justified by the
100k+ row target; I will not pretend it is simpler.

## 4. Dialects (Layer 1)

| Dialect | Framing | Header source |
|---|---|---|
| `w3c-extended` | space-split, respect `"` quoting | `#Fields:` directive |
| `csv` | RFC4180 (quotes, escaped quotes, embedded newlines) | first row |
| `tsv` | tab-split | first row |
| `json-lines` | one JSON object per line | union of keys across sample |
| `clf-combined` | Apache/nginx regex | positional, fixed names |
| `key-value` | `k=v k2="v 2"` (some WAF/LB formats) | discovered keys |

Detection = scored sniff over the first ~64KB, not first-match-wins. Each
dialect returns a confidence; highest wins; ties break by specificity. **The
user can always override** — detection is a suggestion, not a verdict (fixes F6).

## 5. Schema registry (Layer 2)

Declarative, data not code:

```ts
{ id: 'iis-w3c', label: 'IIS W3C',
  match: { anyColumn: ['sc-status','cs-uri-stem'] },
  map: {
    'date': 'timestamp:date-part', 'time': 'timestamp:time-part',
    'cs-uri-stem': 'uri', 'cs-uri-query': 'query',
    'sc-status': 'status', 'time-taken': 'latency_ms',
    'c-ip': 'client_ip', 'X-Forwarded-For': 'client_ip@priority=10',
    'cs-method': 'method', 'cs(User-Agent)': 'user_agent',
    'sc-bytes': 'bytes_out', 'cs-bytes': 'bytes_in',
  } }
```

Adding a format = adding a registry entry. No parser surgery. Ships with:
IIS W3C, Azure APGW, Cloudflare, Apache/nginx combined, AWS ALB, generic CSV.

**Latency units differ per source** (IIS ms, APGW seconds, ALB seconds). The
registry declares the unit; normalization to ms happens once, centrally —
honouring the existing `.cursorrules` rule rather than scattering `*1000`.

### Fallback heuristics

If no schema matches, infer per column from its name + a value sample:
`/^\d{1,3}(\.\d{1,3}){3}$/` -> `client_ip`; `2xx-5xx` integers -> `status`;
parseable dates -> `timestamp`. Confidence recorded and **shown in the UI**, so
a wrong guess is visible and fixable rather than silent.

## 6. Domain plugins (fixes F3/F4/F9)

`parseSearchParams()` and the `/singleHotelSearch` rewrite move out of the
parser into an opt-in plugin:

```ts
interface EnrichmentPlugin {
  id: string; label: string;
  appliesTo(ds: Dataset): boolean;   // e.g. sees hotel-ish query params
  derive(row): Record<string, unknown>;  // adds virtual columns
}
```

Ships with `travel-search` (the existing hotel logic, preserved not deleted) and
`user-agent` (device classification). Derived columns are visually marked as
derived. Nothing hotel-specific remains in the core path.

## 7. Phases

| Ph | Deliverable | Tests |
|---|---|---|
| 0 | Vault + plan + fixtures for all 6 formats | — |
| 1 | Dialect layer + detection scoring | unit: framing, quoting, CRLF, BOM, confidence |
| 2 | Schema registry + role mapping + inference | unit: per-format mapping, unit normalization, fallback |
| 3 | Columnar store + sort/filter engine | unit: sort stability, filter composition, 500k perf bench |
| 4 | Generic virtualized table (sort/resize/reorder/hide/pin) | e2e: render, sort, resize persistence |
| 5 | Filter UX (per-column typed filters, query bar, chips) | e2e: compose + clear filters |
| 6 | Role-driven analytics + insights | unit: metrics correctness, graceful degradation |
| 7 | Share/export (CSV, JSON, clipboard, permalink, PNG) | e2e: round-trip export->reimport |
| 8 | Polish: keyboard nav, a11y, empty/error states, perf | e2e: keyboard-only path |

## 8. Success criteria (from the goal)

1. IIS **with** `X-Forwarded-For` ✅
2. IIS **without** `X-Forwarded-For` ✅
3. IIS with **custom/unknown** columns — must be ingested and shown, not dropped
4. Azure APGW ✅
5. Cloudflare ✅
6. Reimport an exported CSV — round-trip stability
7. 100k rows: parse < 5s, sort < 300ms, filter < 150ms, scroll 60fps
8. Corrupt/truncated file: partial results + honest warning, never a blank crash
