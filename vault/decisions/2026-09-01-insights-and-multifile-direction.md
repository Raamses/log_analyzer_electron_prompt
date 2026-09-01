# Decision — insights & multi-file direction

date: 2026-09-01
status: agreed with Ram, Phase 1 (insights) now in progress

## Context

Ram asked for ideation on (1) what insights the analyzer could surface and where,
and (2) analyzing multiple log files — explicitly "don't go for implementation,"
interview me first. Before ideating, checked what already existed rather than
starting fresh:

- **Insights engine already exists** (`src/lib/insights.ts` + `InsightsRail.tsx`):
  role-driven, evidence-linked, four detectors implemented (error rate — flat
  threshold, slow endpoints by p95, top-talker IPs, cache hit ratio). The
  original design doc (`vault/roadmap/PLAN-part3-ux.md`, "Insight, offered not
  imposed") envisioned more than shipped: error spike **vs rolling baseline**
  (not flat threshold), latency **regression over time**, "suspected scraping"
  (volume + low UA diversity), WAF activity, sudden 404 clustering, off-hours
  anomaly. Roughly half the original list was never built.
- **Multi-file was discussed before, never built.** Ram's own interview
  transcript (`vault/decisions/2026-08-interview-answers.md`, Q4) already asked
  for tabs/workspaces; the response there committed to putting `DatasetCollection`
  + `datasetId` in the core model "from Phase 1" specifically so multi-dataset
  work wouldn't be painful later, and stubbed `DatasetMeta.alignmentKeys: string[]`
  as a join-key placeholder. Neither was ever built — `App.tsx` still holds
  exactly one `Dataset`, no `DatasetCollection` type exists anywhere in `src`,
  `alignmentKeys` is always `[]`. Two earlier planning docs (`PLAN-v2.md`,
  `PLAN-part4-testing-risks.md`) had explicitly marked "multi-dataset diff,"
  "cross-file request tracing," and "multi-file correlation" as v1 non-goals —
  "defensible later."

## Interview outcome

| Question | Answer |
|---|---|
| Insight focus | Security/incident investigation **and** performance/reliability (not primarily business/traffic) |
| What "multiple files" means | All three of: stitch same-server across time, combine different servers/same period, correlate different log types by request/session |
| Shared correlation ID across log types (IIS ↔ Pelecard ↔ app logs)? | "Not that I know of" |
| Can a real checkout/reservation/payment-window log sample be supplied to check? | No, not available |
| Given that, how should cross-log-type correlation rank vs the other two multi-file modes? | Do the two confirmed-feasible modes first (Ram's pick, matching my recommendation) |

**Verified, not assumed:** checked the two real IIS log samples used throughout
this session (`u_ex260711.log`, `u_ex260710.log`) for `ReservationToken`,
`SearchToken`, `TransactionId`, `SessionId`, `ConfirmationNumber` — none present.
Surveyed the actual URI stems instead: both files are almost entirely
settings/config polling traffic (`GetSearchSettings`, `GetReservationSettings`,
`GetSunClubSettings`, `GetPmsSettings`, `GetRoomsSpecialRequests`, query params
`useRedis`/`onlyPublished`/`rootNodeId`) — not real checkout journeys. Consistent
with Ram's own uncertainty: these particular files simply don't carry the
reservation-flow tokens `CLAUDE.md` describes; whether the *checkout* endpoints'
own IIS logs would is a separate, currently unanswerable question, and even if
so, cross-log-type correlation still needs the SAME token present on the other
side (Pelecard/app logs) to actually join on.

## Decision

**Multi-file architecture fork, resolved:** "stitch across time" and "combine
across servers" both want the same shape — several compatible-schema files
**merged into one unified dataset** (one query bar, one table, insights over the
combined set, a `source`/`server` column so origin stays filterable). That's a
different model from "tabs" (separate datasets, switched between, each keeping
its own view state) — tabs is the right model for comparison-mode and for
schema-incompatible sources, which is exactly what cross-log-type correlation
would need. **Merge is the near-term model; tabs is deferred** until a real
comparison or cross-log-type need is confirmed.

**Cross-log-type correlation (mode 3) is deferred**, not abandoned. No evidence
of a shared token yet; the realistic fallback if pursued later is IP+timestamp
proximity matching — noisier, needs to be presented at visibly lower confidence
than an exact join (multiple guests can share a NAT'd IP). Revisit if/when a
real correlation ID is confirmed present in checkout-flow logs specifically.

**Sequencing, agreed with Ram:**
1. **Insights first** (this session, starting now) — additive to an existing,
   already-tested module; no architecture risk; delivers value independent of
   multi-file. Priority: finish the originally-planned-but-unbuilt detectors
   (rolling-baseline error spike, latency regression over time, 404 clustering,
   off-hours anomaly), then add the security-flavored ones the current engine
   has none of (repeated-failure IPs, suspicious paths/methods, scanner UAs).
2. **Multi-file merge** — separate, larger effort (ingest pipeline, `Dataset`
   model, `App.tsx` state, file-selection UI, schema-compatibility checking
   across files). Deserves its own scoping pass before code; not started in
   this session.
3. GeoIP (abandoned WIP in the untracked stash) — revive only if it turns out
   to matter once real incident data is being worked with; not prioritized now.

Noted for later: once merge exists, several insights get *sharper* across
files that are weak on a single one ("new IP that only showed up on day 2,"
"fine on server-17, erroring on server-18," "spike starts exactly at the
day boundary") — insights and multi-file compound rather than being fully
independent tracks.

— Claude Code (Windows)
