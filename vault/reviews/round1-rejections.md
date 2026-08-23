# Review Round 1 — Rejections and Partial Accepts

You gave the reviewers authority to demand changes, and me the duty to push back
where they are wrong. These are defended, not dismissed.

## REJECTED

### D1. "Replace roles with a composable tag system" (R1, CRITICAL)

R1's *problems* are all real:
- XFF carries client_ip (first) + proxy chain (rest) — one column, two roles
- APGW has `HttpStatus` AND `OriginalHttpStatus` — which is "the" status?
- Cloudflare has Edge/Origin/Cache response statuses — three status candidates
- ALB `target_status_code_list` is multi-value
- F5 has client_ip + xff + true_client_ip with vendor-specific precedence

But the proposed cure — `{source, semantic, unit, multiplicity}` tags queried by
"tag intersection" — **is the same model with more indirection**. `semantic:
'timestamp'` *is* a role. R1 renamed the field and added three more, without
resolving which of three status columns analytics should use. Tag intersection
still has to answer that, and now the answer is spread across four dimensions
instead of one.

**Counter-proposal (fixes the real problems, keeps one axis):**

```ts
interface RoleBinding {
  role: Role;
  columnKey: string;
  priority: number;        // resolves multi-candidate: XFF(10) > c-ip(0)
  multiplicity: 'single' | 'list';
  splitter?: RegExp;       // XFF chain, ALB status list
  transform?: TransformId; // declarative, registry-defined
  unit?: 'ms' | 's' | 'us' | 'bytes';
}

interface Schema {
  bindings: RoleBinding[];        // MANY bindings per role allowed
  primary: Partial<Record<Role, string>>; // explicit winner per role
}
```

- Multi-candidate → many bindings, `primary` names the default, **UI exposes the
  choice** ("Status source: EdgeResponseStatus ▾")
- One column → two roles → two bindings on the same `columnKey` + a `transform`
  (`xff_first` → client_ip, `xff_rest` → proxy_chain). Declarative, in the
  registry, no hardcoded priority hack.
- Multi-value → `multiplicity: 'list'` + `splitter`
- `uri` + `query` → a `concat` transform producing a derived `full_uri`

One axis (role), explicit precedence, declarative transforms. Solves every case
R1 raised without a 4-dimensional query language.

### D2. "Cut to IIS-only MVP" (R1) — partially rejected

Vertical-slice discipline: **accepted** (A8). But IIS-*only* would let me build a
role system that accidentally only fits IIS — the exact trap this whole exercise
exists to escape. A single format cannot validate a generic abstraction.

**Counter:** vertical slice with **two structurally dissimilar** formats —
IIS W3C (space-delimited, `#Fields:` directive, ms latency, date+time split
across two columns) and Azure APGW (TSV, first-row header, **seconds** latency,
single timestamp). Different framing, different header discovery, different
units, different timestamp shape. If the abstraction survives both, it is real.
The marginal cost over IIS-only is one registry entry, because I have a real
APGW fixture (`mock_azure_logs.csv`) already in the repo.

### D3. "Multi-line framing is not optional" (R1, HIGH) — deferred, not rejected

The RFC4180 part is right and is **in scope**: quoted fields containing newlines
in CSV/TSV, and the F7 space-splitting bug. Those are correctness issues for the
target formats.

But R1's headline example — Cloudflare emitting 50-line pretty-printed JSON — is
not a thing. Cloudflare Logpush emits **compact JSON-lines**, one object per
line, by design. And Apache *error* logs with stack traces are unstructured,
which is explicitly out of scope (this app targets structured access logs).

→ RFC4180 quoting + balanced-bracket JSON detection: **in**. General
stack-trace/continuation framing: **out of v1**, documented as a limitation.
Building it would mean designing for logs the app does not claim to support.

### D4. ">1000 columns" (R1, MEDIUM) — deferred with a guard

Cloudflare Enterprise can have 100+ fields; that is real. But column
virtualization is genuine complexity, and 100 columns ≠ 1000.

→ v1 handles up to ~150 columns with a searchable/grouped column picker and
default-hide of unmapped columns beyond the first N. Column virtualization
deferred, with a **perf test at 150 columns** so I find the ceiling by
measurement instead of discovering it in front of a user.

### D5. "Live-updating permalink" (R2) — rejected

R2 wants a shareable link that updates in real time for another SRE. That
requires a server, websockets, and shared state — contradicting the
client-side-only, no-upload privacy guarantee, which is a harder requirement than
this convenience. Logs contain PII; I am not shipping them to a backend to make a
link live.

→ Static permalink encoding view state only. Documented as deliberate.

### D6. "Diff/two-file comparison" (R2, L) — accepted as post-v1

Genuinely valuable, correctly identified as a real workflow. But it needs a
multi-dataset store, which changes the core data model. Doing it now would
destabilise the foundation before it is proven. → Roadmapped v2; the `Dataset`
interface will not *preclude* it.

## PARTIALLY ACCEPTED

### P1. Insights rail (R2)
Accepted: show arithmetic, sample size, click-to-reproduce, suppress low-n.
Rejected: "let users modify detection logic" in v1 — that is a plugin/scripting
surface, and a v1 that ships a scripting engine ships nothing else.

### P2. Request-ID tracing (R2, M)
Accepted **within** a dataset (jump between rows sharing a request_id) — cheap
and useful. Cross-file tracing depends on multi-dataset (D6) → v2.

### P3. Perf budgets (R1)
Accepted that mine were invented. But R1's replacements are *also* unmeasured
guesses. → Benchmark harness first; budgets become CI gates only once measured on
this hardware.
