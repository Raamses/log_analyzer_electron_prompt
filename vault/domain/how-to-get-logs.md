# How to Get Log Samples

## ⚠️ Do NOT send logs over Telegram

**Technical:** Telegram bots cap file downloads at **20MB**. A 100MB log fails
outright. But that is the smaller problem.

**Real problem — logs are PII.** Access logs contain client IPs (personal data
under GDPR), full query strings (which routinely carry session tokens, emails,
password-reset links, API keys), cookies, internal hostnames, and user agents
that fingerprint individuals.

Sending them through Telegram means: copies on Telegram's servers, in the chat
history, on every device signed into that account, and in cloud backups. For
production logs of an Israeli company, that is plausibly a reportable data
transfer. Not worth it for test fixtures.

## ✅ What to do instead

**Sanitize first, then share small.** I do not need 100MB or real values — I need
**real shapes**. 1,000 sanitized lines validate a parser exactly as well as
1,000,000, and I generate the volume synthetically for perf tests.

```
1. Take a small slice     head -2000 u_ex260824.log > sample.log
2. Keep the header!       (the #Fields: line IS the thing I need)
3. Sanitize               scripts/sanitize-logs.mjs sample.log
4. Verify by eye          confirm no IPs/tokens/emails remain
5. Drop into              fixtures/sanitized/   (git-ignored until you approve)
```

`fixtures/real/` is git-ignored — if you ever put real logs there they cannot be
committed by accident.

### What must be scrubbed

| Field | Why | Replace with |
|---|---|---|
| Client IP / XFF | Personal data | Pseudonymous, structure-preserving (`203.0.113.x`) |
| Query strings | Tokens, emails, reset links | Keep param *names*, hash values |
| Cookies / auth headers | Credentials | Drop entirely |
| Hostnames | Internal topology | `example.com` |
| Usernames in paths | Personal data | `/users/{id}` |
| User agents | Fingerprinting | Keep — genuinely needed, low risk |

Preserve **structure**: column count, delimiters, quoting, encoding, timestamp
format, empty-field markers (`-`), and any ragged/truncated lines. Those are what
break parsers. Values matter far less.

I will write `scripts/sanitize-logs.mjs` to do this in one pass — deterministic
IP pseudonymisation (same input → same output, so correlation still works),
query-value hashing, header preservation.

---

## 1. Azure Application Gateway logs

Already have a 3-row fixture (`mock_azure_logs.csv`, TSV, 35 cols) — need more
volume and variety.

### Option A — Portal (easiest)
1. Portal → your **Application Gateway** → **Monitoring → Logs**
2. Query:
   ```kql
   AzureDiagnostics
   | where Category == "ApplicationGatewayAccessLog"
   | project TimeGenerated, clientIP_s, httpMethod_s, requestUri_s,
             httpStatus_d, timeTaken_d, userAgent_s, host_s,
             receivedBytes_d, sentBytes_d, sslProtocol_s, WAFMode_s
   | take 2000
   ```
3. **Export → CSV** (top of results pane)

### Option B — CLI (better, scriptable)
```bash
az monitor log-analytics query \
  --workspace "<workspace-id>" \
  --analytics-query "AzureDiagnostics
    | where Category == 'ApplicationGatewayAccessLog'
    | take 5000" \
  --output tsv > apgw-sample.tsv
```

### Option C — diagnostic settings → storage
If already archiving to a storage account, the raw blobs are JSON-lines under
`insights-logs-applicationgatewayaccesslog/`. **This shape is more useful to me
than the portal CSV** — it is what the service actually emits.

```bash
az storage blob download-batch \
  --account-name <acct> --source insights-logs-applicationgatewayaccesslog \
  --pattern "*/y=2026/m=08/d=24/*" --destination ./apgw-raw/
```

**What I need:** ideally *both* a portal CSV export **and** a raw JSON-lines blob
— they are different dialects of the same data, and supporting both is a real
test of the registry.

---

## 2. Cloudflare logs

**Plan matters.** Research confirms:

| Method | Plans | Output |
|---|---|---|
| **Logpush** | **Enterprise only** | Raw per-request ndjson ✅ what I want |
| GraphQL Analytics API | Business/Enterprise (Free/Pro restricted) | **Aggregated**, not per-request |
| Dashboard sampled logs | All | Small sample, browser only |

### If Enterprise — Logpush (best)
Dashboard → **Analytics & Logs → Logpush** → Create job → choose HTTP requests →
select fields (take **all** of them; more columns is a better test) → destination
R2/S3/GCS. Output is **ndjson**, one compact JSON object per line.

Or via API:
```bash
curl "https://api.cloudflare.com/client/v4/zones/{zone_id}/logpush/jobs" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  --data '{"destination_conf":"r2://bucket/logs?...","dataset":"http_requests",
           "output_options":{"field_names":["EdgeStartTimestamp","ClientIP",
             "ClientRequestHost","ClientRequestMethod","ClientRequestURI",
             "EdgeResponseStatus","OriginResponseStatus","CacheCacheStatus",
             "EdgeTimeToFirstByteMs","ClientCountry","ClientRequestUserAgent",
             "RayID","WAFAction","EdgeResponseBytes"],
             "timestamp_format":"rfc3339"}}'
```

### If NOT Enterprise
GraphQL gives **aggregates**, which will not exercise a row-level parser. In that
case say so and I will build the Cloudflare fixture from the documented field
schema — and mark it clearly as synthetic in the vault so we both know it is
unvalidated against reality.

**Note the three status fields** — `EdgeResponseStatus`, `OriginResponseStatus`,
`CacheCacheStatus`. This is exactly the multi-candidate case that drove the
`RoleBinding` + `primary` design. Real Cloudflare data is the best test of it.

---

## 3. Azure "LB" logs — I still need you to pick

This is what I was asking about. Four different things share that name:

| # | Product | Format | HTTP fields? | Useful here? |
|---|---|---|---|---|
| **A** | **Load Balancer** health probe logs | JSON | ❌ health state only | Low |
| **B** | **NSG flow logs** | Nested JSON, CSV **string inside** | ❌ L3/L4 5-tuple | High but new dialect |
| **C** | **VNet flow logs** (v4, supersedes NSG) | Same nested shape | ❌ L3/L4 + bytes/packets | High but new dialect |
| **D** | **Front Door** access logs | JSON | ✅ yes | Easy, drop-in |

### Why B/C are a bigger deal
They are **not access logs**. The payload is a comma-joined string nested inside
a JSON array:

```json
{"records":[{"time":"2022-09-14T09:00:52Z","flowRecords":{"flows":[
  {"flowGroups":[{"rule":"AllowInternetOutBound","flowTuples":[
    "1663146003599,10.0.0.6,192.0.2.180,23956,443,6,O,B,NX,0,0,0,0"
  ]}]}]}}]}
```

Tuple = `time, srcIP, dstIP, srcPort, dstPort, protocol, direction, state,
encryption, packetsOut, bytesOut, packetsIn, bytesIn`.

Two consequences:
1. **New dialect** — flatten nested JSON, *then* split an inner CSV string. Not a
   registry entry; genuine new capability.
2. **New role family** — no `status`/`latency`/`uri`. Needs `src_ip`, `dst_ip`,
   `src_port`, `dst_port`, `protocol`, `action`, `bytes_in/out`,
   `packets_in/out`. Insights differ too: talkers, denied-flow spikes,
   port scans — not error rates and p95.

**That is worth building** — it makes the app cover network *and* application
logs. But it is Phase 8+ work, not a freebie. I would rather scope it honestly
than surprise you.

### Getting them
```bash
# A — health probes
az monitor diagnostic-settings create --name lb-diag \
  --resource "<lb-resource-id>" \
  --logs '[{"category":"LoadBalancerProbeHealthStatus","enabled":true}]' \
  --storage-account "<acct>"

# B/C — flow logs (Network Watcher → Flow logs), then:
az storage blob download-batch --account-name <acct> \
  --source insights-logs-flowlogflowevent --destination ./flow-raw/
```

---

## Priority — if you only get one thing

1. **APGW raw JSON-lines from storage** — you have it, and it is a different
   dialect from the CSV I already hold. Best value per effort.
2. **Cloudflare ndjson** (if Enterprise) — the 3-status case is the hardest thing
   in my design; real data is the only honest test.
3. **Which Azure LB** — a *decision*, not a file. Answer costs you nothing and
   unblocks scoping.
4. IIS with custom columns — your own logs, ideally with something non-standard
   in `#Fields:`, since "custom columns survive" is a stated success criterion.

Volume: **1,000-5,000 lines each is plenty.** I will synthesize the 100MB+ perf
fixtures myself.
