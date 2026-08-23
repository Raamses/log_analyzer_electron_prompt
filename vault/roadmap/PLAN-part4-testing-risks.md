# Plan — Part 4: Testing, Risks, Open Questions

## Testing strategy

You asked for both unit and e2e. Currently: 23 unit tests, 0 real e2e
(`verification/verify_dashboard.py` takes a screenshot — that is a smoke check,
not a test).

### Unit (Vitest) — target ~120 tests

| Area | Cases |
|---|---|
| Dialect framing | quoted fields w/ spaces (fixes F7), embedded commas/newlines, CRLF, BOM, ragged rows, blank lines, comments |
| Detection scoring | each format wins on its own fixture; ambiguous input yields low confidence not a wrong verdict |
| Schema mapping | every shipped format maps to expected roles; XFF priority over c-ip; XFF absent -> c-ip |
| Unit normalization | IIS ms, APGW s, ALB s all -> ms |
| Type inference | ip/status/date/number/bool detection + confidence |
| Columnar store | build, sort stability, multi-sort, null ordering |
| Filter engine | per-type predicates, composition, negation, empty result |
| Analytics | p50/p95/p99 correctness incl. edge n=0,1,2; graceful skip when role absent |
| Plugins | travel-search parity with existing `parseSearchParams` behaviour |
| Export | CSV escaping, round-trip fidelity, redaction |

**Regression guard:** the existing 23 tests must keep passing, or I must state
explicitly why a behaviour intentionally changed. The travel plugin exists
precisely so the hotel tests remain meaningful.

### E2E (Playwright)

| Spec | Asserts |
|---|---|
| `ingest-iis-xff` | mapping preview shows XFF as client_ip; table renders |
| `ingest-iis-no-xff` | falls back to c-ip |
| `ingest-iis-custom-cols` | unknown column present, browsable, filterable — the core promise |
| `ingest-azure-apgw` | TSV framing, latency s->ms |
| `ingest-cloudflare` | JSON-lines path |
| `ingest-apache-clf` | regex path |
| `table-interactions` | sort asc/desc/none, resize, reorder, hide, pin |
| `filtering` | per-column + free text + chips + clear |
| `sharing` | CSV/JSON/clipboard/permalink restore |
| `keyboard-a11y` | full keyboard-only journey; axe scan, 0 criticals |
| `error-states` | corrupt file -> partial + warning, never blank |
| `perf-smoke` | 100k rows within budget |

Config from the outset: `workers: 3`, `retries: 1`, single-frame geometry
assertions, no assertions on animating elements. (Carrying forward what I learned
the hard way on the other repo — flaky-by-construction tests cost more than they
save.)

### Fixtures

Real logs where available (`mock_azure_logs.csv` is real APGW TSV — reuse it).
Synthetic generators for the rest, seeded for determinism:
`fixtures/gen.ts --format=cloudflare --rows=100000 --seed=42`.
Fixtures include deliberately nasty cases: quoted spaces, embedded newlines,
missing trailing columns, mixed encodings, a truncated final line.

## Risks I want to name up front

| Risk | Mitigation |
|---|---|
| **Scope is large.** This is a rewrite of the data layer, not a tweak. | Phased; each phase independently shippable. Phase 1-3 alone already beat today's parser. |
| Columnar store adds real complexity | Confined behind a narrow interface; heavily unit-tested. I will not claim it is simple. |
| Generic ⇒ blander insights than bespoke | Role-driven detectors + opt-in plugins keep depth where roles are known |
| Detection will sometimes be wrong | Always overridable + confidence surfaced. Never silently wrong. |
| Perf regression vs today's fixed parser | CI perf budget; benchmark each phase |
| Existing hotel value lost | Preserved as a plugin, covered by the current tests |
| I do not have real Cloudflare/ALB samples | Synthesizing from documented schemas — **this is a known weakness**, flagged below |

## Open questions for you

I would rather ask than guess. Answers change the plan materially:

1. **Real samples** — can you provide sanitized Cloudflare / APGW / LB / access
   log samples? I can synthesize from public schemas, but real logs always
   contain surprises (odd encodings, vendor quirks) and my fixtures would be
   fiction. This is the single biggest quality lever.

2. **Scale** — biggest file you realistically open? 10MB / 100MB / 1GB+?
   Under ~50MB, in-memory columnar is fine. Beyond that I should plan streaming
   + chunked ingestion now rather than retrofit it.

3. **Fork vs branch** — I created branch `feat/generic-log-analyzer` on the
   existing repo as the safer default. Say the word if you want a separate fork
   instead.

4. **Keep the hotel/travel logic?** My plan preserves it as an opt-in plugin.
   Confirm — or if it is dead weight, deleting simplifies things.

5. **Backend, ever?** I assume 100% client-side (privacy, and matches the
   existing no-Electron SPA stance). If server-side ingestion is ever wanted,
   the layering should anticipate it.

6. **"Balancer logs"** — which specifically? F5 BIG-IP, HAProxy, nginx,
   AWS ALB/NLB, Azure LB? Each has a distinct format; naming them lets me ship
   registry entries rather than guess.

7. **Priority order** — if you want value fastest, I would do
   Phases 1-3 (ingest anything + generic table) before analytics polish.
   Prefer that, or breadth-first across all phases?

## Deliberately NOT in scope (v1)

Live tailing · multi-file correlation · alerting · saved dashboards ·
auth/multi-user · server-side storage. All are defensible later; none are needed
to prove "ingest anything and make it useful", and each would dilute the core.
