// @paths lib/insights
/**
 * Insights engine — role-driven anomaly detection.
 *
 * Produces human-readable, evidence-backed insights. Each insight states:
 *   - what was detected
 *   - the numbers (n, percentage, threshold)
 *   - a link to the filtered rows that evidence it
 *
 * Insights only fire when roles are present. No role = no insight (graceful
 * degradation, not a gap).
 */

import type { Dataset, ColumnDef } from './types';

export interface Insight {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  metric?: string;
  n?: number;
  threshold?: number;
  /** Filter query that reproduces this insight. */
  evidenceQuery: string;
}

export interface InsightConfig {
  /** Minimum sample size for statistical relevance. */
  minSample?: number;
  /** Error rate threshold (0-1) for "high error rate" insight. */
  errorRateThreshold?: number;
  /** Latency regression factor (e.g., 2 = 2x baseline). */
  latencyRegressionFactor?: number;
}

const DEFAULT_CONFIG: Required<InsightConfig> = {
  minSample: 100,
  errorRateThreshold: 0.05,
  latencyRegressionFactor: 2,
};

/* ───────────────────────── time bucketing (shared by rate-spike detectors) ───────────────────────── */

interface TimeBucket {
  startMs: number;
  endMs: number;
  total: number;
  matches: number;
}

/** Extract a column's values as epoch ms, NaN where unparseable. One pass, shared
 *  across every time-based detector so they don't each re-read the store. */
function extractTimestamps(dataset: Dataset, tsCol: ColumnDef): Float64Array {
  const store = dataset.stores.get(tsCol.key);
  const out = new Float64Array(dataset.rowCount);
  for (let i = 0; i < dataset.rowCount; i++) {
    out[i] = store ? Number(store.get(i)) : NaN;
  }
  return out;
}

/** Split the dataset's time span into equal buckets, counting total rows and
 *  rows matching `matches` in each. Returns null if there's no usable time span
 *  (no valid timestamps, or every row at the same instant). */
function bucketizeByTime(
  timestamps: Float64Array,
  matches: (rowIdx: number) => boolean,
  numBuckets: number,
): TimeBucket[] | null {
  let minMs = Infinity;
  let maxMs = -Infinity;
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    if (!isNaN(t)) {
      if (t < minMs) minMs = t;
      if (t > maxMs) maxMs = t;
    }
  }
  if (!isFinite(minMs) || !isFinite(maxMs) || maxMs <= minMs) return null;

  const span = maxMs - minMs;
  const bucketMs = span / numBuckets;
  const buckets: TimeBucket[] = Array.from({ length: numBuckets }, (_, b) => ({
    startMs: minMs + b * bucketMs,
    endMs: b === numBuckets - 1 ? maxMs : minMs + (b + 1) * bucketMs,
    total: 0,
    matches: 0,
  }));

  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    if (isNaN(t)) continue;
    let b = Math.floor((t - minMs) / bucketMs);
    if (b >= numBuckets) b = numBuckets - 1;
    if (b < 0) b = 0;
    buckets[b].total++;
    if (matches(i)) buckets[b].matches++;
  }
  return buckets;
}

/**
 * Generic "rate in this time window is way above the dataset's own overall
 * rate" detector — the rolling-baseline version of a flat threshold. Shared by
 * error-rate-spike and 404-cluster; only the predicate and labeling differ.
 */
function detectRateSpike(
  timestamps: Float64Array,
  matches: (rowIdx: number) => boolean,
  opts: {
    id: string;
    title: string;
    label: string;
    evidencePredicate: string;
    numBuckets?: number;
    minBucketTotal?: number;
    spikeFactor?: number;
    minAbsoluteDelta?: number;
  },
): Insight[] {
  const numBuckets = opts.numBuckets ?? 24;
  const minBucketTotal = opts.minBucketTotal ?? 20;
  const spikeFactor = opts.spikeFactor ?? 3;
  const minAbsoluteDelta = opts.minAbsoluteDelta ?? 0.05;

  const buckets = bucketizeByTime(timestamps, matches, numBuckets);
  if (!buckets) return [];

  const totalMatches = buckets.reduce((s, b) => s + b.matches, 0);
  const totalRows = buckets.reduce((s, b) => s + b.total, 0);
  if (totalRows === 0 || totalMatches === 0) return [];
  const baselineRate = totalMatches / totalRows;

  const candidates = buckets
    .filter(b => b.total >= minBucketTotal)
    .map(b => ({ bucket: b, rate: b.matches / b.total }))
    .filter(({ rate }) => rate >= baselineRate * spikeFactor && rate - baselineRate >= minAbsoluteDelta)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);

  return candidates.map(({ bucket, rate }) => ({
    id: opts.id,
    severity: rate >= 0.3 ? 'critical' : 'warning',
    title: opts.title,
    detail: `${opts.label} ${fmtPct(rate)}% between ${fmtTime(bucket.startMs)} and ${fmtTime(bucket.endMs)} vs ${fmtPct(baselineRate)}% baseline (${bucket.matches.toLocaleString()} of ${bucket.total.toLocaleString()})`,
    metric: `${fmtPct(rate)}%`,
    n: bucket.matches,
    evidenceQuery: `${opts.evidencePredicate} AND timestamp >= ${Math.floor(bucket.startMs)} AND timestamp <= ${Math.ceil(bucket.endMs)}`,
  }));
}

/* ───────────────────────── suspicious-signature tables ───────────────────────── */

const SUSPICIOUS_PATH_PATTERNS: { pattern: RegExp; label: string; evidenceLiteral: string }[] = [
  { pattern: /\.env(\.|$)/i, label: '.env file access', evidenceLiteral: '.env' },
  { pattern: /wp-(login|admin|content)/i, label: 'WordPress probe', evidenceLiteral: 'wp-' },
  { pattern: /phpmyadmin/i, label: 'phpMyAdmin probe', evidenceLiteral: 'phpmyadmin' },
  { pattern: /\.git\//i, label: '.git directory access', evidenceLiteral: '.git/' },
  { pattern: /\.\.\//, label: 'path traversal (../)', evidenceLiteral: '../' },
  { pattern: /union\s+select/i, label: 'SQL injection pattern', evidenceLiteral: 'union' },
  { pattern: /<script/i, label: 'XSS pattern', evidenceLiteral: '<script' },
  { pattern: /\/(admin|administrator|manager)(\/|$)/i, label: 'admin panel probe', evidenceLiteral: '/admin' },
];

const SCANNER_UA_PATTERNS: { pattern: RegExp; label: string; evidenceLiteral: string }[] = [
  { pattern: /sqlmap/i, label: 'sqlmap', evidenceLiteral: 'sqlmap' },
  { pattern: /nikto/i, label: 'nikto', evidenceLiteral: 'nikto' },
  { pattern: /\bnmap\b/i, label: 'nmap', evidenceLiteral: 'nmap' },
  { pattern: /masscan/i, label: 'masscan', evidenceLiteral: 'masscan' },
  { pattern: /python-requests/i, label: 'python-requests', evidenceLiteral: 'python-requests' },
  { pattern: /\bcurl\//i, label: 'curl', evidenceLiteral: 'curl/' },
  { pattern: /go-http-client/i, label: 'Go-http-client', evidenceLiteral: 'Go-http-client' },
  { pattern: /\bwget\b/i, label: 'Wget', evidenceLiteral: 'Wget' },
];

export function generateInsights(
  dataset: Dataset,
  config: InsightConfig = {},
): Insight[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const insights: Insight[] = [];
  const columns = dataset.columns;
  const stores = dataset.stores;
  const rowCount = dataset.rowCount;

  if (rowCount < cfg.minSample) return insights;

  // Resolve columns by role
  const statusCol = columns.find((c: ColumnDef) => c.role === 'status');
  const latencyCol = columns.find((c: ColumnDef) => c.role === 'latency_ms');
  const uriCol = columns.find((c: ColumnDef) => c.role === 'uri');
  const ipCol = columns.find((c: ColumnDef) => c.role === 'client_ip');
  const cacheCol = columns.find((c: ColumnDef) => c.role === 'cache_status');
  // The PRIMARY timestamp column specifically — some formats (IIS W3C) split
  // date+time across two timestamp-role columns; only the one named in
  // schema.primary actually holds a real combined value (see normalize.ts).
  const tsCol = columns.find((c: ColumnDef) => c.key === dataset.schema.primary.timestamp)
    ?? columns.find((c: ColumnDef) => c.role === 'timestamp');
  const uaCol = columns.find((c: ColumnDef) => c.role === 'user_agent');

  // 1. Error rate
  if (statusCol) {
    const statusStore = stores.get(statusCol.key);
    if (!statusStore) return insights;
    const total = rowCount;
    let errors = 0;
    for (let i = 0; i < rowCount; i++) {
      const s = Number(statusStore.get(i));
      if (!isNaN(s) && s >= 400) errors++;
    }
    const rate = errors / total;
    if (rate >= cfg.errorRateThreshold) {
      insights.push({
        id: 'high-error-rate',
        severity: rate >= 0.1 ? 'critical' : 'warning',
        title: 'Elevated error rate',
        detail: `${fmtPct(rate)}% of requests returned 4xx/5xx (${errors.toLocaleString()} of ${total.toLocaleString()})`,
        metric: `${fmtPct(rate)}%`,
        n: errors,
        threshold: cfg.errorRateThreshold,
        evidenceQuery: 'status >= 400',
      });
    }
  }

  // 2. Slow endpoints (top-N by p95 latency)
  if (latencyCol && uriCol) {
    const latencyStore = stores.get(latencyCol.key);
    const uriStore = stores.get(uriCol.key);
    if (!latencyStore || !uriStore) return insights;

    const byEndpoint = new Map<string, number[]>();
    for (let i = 0; i < rowCount; i++) {
      const uri = String(uriStore.get(i) ?? '');
      const lat = Number(latencyStore.get(i));
      if (isNaN(lat) || !uri) continue;
      if (!byEndpoint.has(uri)) byEndpoint.set(uri, []);
      byEndpoint.get(uri)!.push(lat);
    }

    const slowest = [...byEndpoint.entries()]
      .map(([uri, lats]) => {
        lats.sort((a, b) => a - b);
        const p95 = lats[Math.floor(lats.length * 0.95)] ?? lats[lats.length - 1];
        return { uri, p95, n: lats.length };
      })
      .filter(x => x.n >= 10)
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 3);

    for (const s of slowest) {
      insights.push({
        id: 'slow-endpoint',
        severity: s.p95 > 5000 ? 'critical' : 'warning',
        title: 'Slow endpoint',
        detail: `${s.uri} p95 = ${s.p95}ms (n=${s.n.toLocaleString()})`,
        metric: `${s.p95}ms`,
        n: s.n,
        evidenceQuery: `uri contains "${s.uri}" | sort by latency desc`,
      });
    }
  }

  // 3. Top talkers by IP
  if (ipCol) {
    const ipStore = stores.get(ipCol.key);
    if (!ipStore) return insights;

    const byIp = new Map<string, number>();
    for (let i = 0; i < rowCount; i++) {
      const ip = String(ipStore.get(i) ?? '');
      if (!ip) continue;
      byIp.set(ip, (byIp.get(ip) ?? 0) + 1);
    }

    const top = [...byIp.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const total = rowCount;
    for (const [ip, count] of top) {
      const pct = count / total;
      if (pct >= 0.05) {
        insights.push({
          id: 'top-talker',
          severity: pct >= 0.2 ? 'critical' : 'info',
          title: 'High-volume client',
          detail: `${ip} generated ${count.toLocaleString()} requests (${fmtPct(pct)}% of traffic)`,
          metric: `${fmtPct(pct)}%`,
          n: count,
          evidenceQuery: `client_ip = ${ip}`,
        });
      }
    }
  }

  // 4. Cache health
  if (cacheCol) {
    const cacheStore = stores.get(cacheCol.key);
    if (!cacheStore) return insights;

    let hits = 0;
    for (let i = 0; i < rowCount; i++) {
      const v = String(cacheStore.get(i) ?? '').toLowerCase();
      if (v === 'hit' || v === 'cached' || v === 'fresh') hits++;
    }
    const rate = hits / rowCount;
    if (rate < 0.5) {
      insights.push({
        id: 'low-cache-hit',
        severity: 'info',
        title: 'Low cache hit ratio',
        detail: `${fmtPct(rate)}% cache hit rate (${hits.toLocaleString()} of ${rowCount.toLocaleString()})`,
        metric: `${fmtPct(rate)}%`,
        n: hits,
        evidenceQuery: 'cache_status contains "miss"',
      });
    }
  }

  // Timestamp-dependent detectors share one extraction pass.
  const timestamps = tsCol ? extractTimestamps(dataset, tsCol) : null;

  // 5. Error rate spike vs the dataset's own rolling baseline (not a flat
  // threshold — a service that's normally 0.5% errors and jumps to 3% for ten
  // minutes is a different signal than one that's always at 3%).
  if (statusCol && timestamps) {
    const statusStore = stores.get(statusCol.key)!;
    insights.push(...detectRateSpike(
      timestamps,
      (i) => { const s = Number(statusStore.get(i)); return !isNaN(s) && s >= 400; },
      {
        id: 'error-rate-spike',
        title: 'Error rate spike',
        label: 'Errors spiked to',
        evidencePredicate: 'status >= 400',
      },
    ));
  }

  // 6. Sudden 404 cluster (broken deploy / bad link signature) — same mechanism
  // as #5, narrowed to exactly 404 with a stricter spike threshold.
  if (statusCol && timestamps) {
    const statusStore = stores.get(statusCol.key)!;
    insights.push(...detectRateSpike(
      timestamps,
      (i) => Number(statusStore.get(i)) === 404,
      {
        id: '404-cluster',
        title: 'Sudden 404 cluster',
        label: '404s spiked to',
        evidencePredicate: 'status = 404',
        spikeFactor: 4,
        minAbsoluteDelta: 0.1,
      },
    ));
  }

  // 7. Latency regression by endpoint: p95 in the first half of the time span
  // vs the second half, not just an absolute top-N snapshot.
  if (latencyCol && uriCol && timestamps) {
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (const t of timestamps) {
      if (!isNaN(t)) { if (t < minMs) minMs = t; if (t > maxMs) maxMs = t; }
    }
    if (isFinite(minMs) && isFinite(maxMs) && maxMs > minMs) {
      const midMs = (minMs + maxMs) / 2;
      const latStore = stores.get(latencyCol.key)!;
      const uriStore = stores.get(uriCol.key)!;
      const byEndpoint = new Map<string, { early: number[]; late: number[] }>();
      for (let i = 0; i < rowCount; i++) {
        const t = timestamps[i];
        if (isNaN(t)) continue;
        const uri = String(uriStore.get(i) ?? '');
        const lat = Number(latStore.get(i));
        if (!uri || isNaN(lat)) continue;
        if (!byEndpoint.has(uri)) byEndpoint.set(uri, { early: [], late: [] });
        const rec = byEndpoint.get(uri)!;
        (t < midMs ? rec.early : rec.late).push(lat);
      }

      const p95 = (arr: number[]) => { arr.sort((a, b) => a - b); return arr[Math.floor(arr.length * 0.95)] ?? arr[arr.length - 1]; };

      const regressions = [...byEndpoint.entries()]
        .map(([uri, { early, late }]) => {
          if (early.length < 10 || late.length < 10) return null;
          const p95Early = p95(early);
          const p95Late = p95(late);
          return { uri, p95Early, p95Late, n: early.length + late.length };
        })
        .filter((x): x is { uri: string; p95Early: number; p95Late: number; n: number } =>
          x !== null && x.p95Late > x.p95Early * 1.5 && x.p95Late - x.p95Early >= 50)
        .sort((a, b) => (b.p95Late - b.p95Early) - (a.p95Late - a.p95Early))
        .slice(0, 3);

      for (const r of regressions) {
        insights.push({
          id: 'latency-regression',
          severity: r.p95Late > r.p95Early * 3 ? 'critical' : 'warning',
          title: 'Latency regression',
          detail: `${r.uri} p95 rose from ${r.p95Early}ms (first half) to ${r.p95Late}ms (second half), n=${r.n.toLocaleString()}`,
          metric: `${r.p95Late}ms`,
          n: r.n,
          evidenceQuery: `uri contains "${r.uri}" AND timestamp >= ${Math.floor(midMs)} | sort by latency desc`,
        });
      }
    }
  }

  // 8. Off-hours traffic concentrated in one IP — a quiet hour-of-day (relative
  // to this dataset's own volume curve, not an assumed "night time") where one
  // client dominates is a brute-force/scanning shape, not a UX pattern.
  if (timestamps && ipCol) {
    const ipStore = stores.get(ipCol.key)!;
    const hourTotals = new Map<number, number>();
    const hourByIp = new Map<number, Map<string, number>>();
    for (let i = 0; i < rowCount; i++) {
      const t = timestamps[i];
      if (isNaN(t)) continue;
      const ip = String(ipStore.get(i) ?? '');
      if (!ip) continue;
      const hour = new Date(t).getUTCHours();
      hourTotals.set(hour, (hourTotals.get(hour) ?? 0) + 1);
      if (!hourByIp.has(hour)) hourByIp.set(hour, new Map());
      const m = hourByIp.get(hour)!;
      m.set(ip, (m.get(ip) ?? 0) + 1);
    }
    const maxHourVolume = Math.max(0, ...hourTotals.values());
    if (maxHourVolume > 0) {
      const flagged: Insight[] = [];
      for (const [hour, total] of hourTotals) {
        if (total < 10 || total > maxHourVolume * 0.3) continue; // need samples; only "quiet" hours
        const ipCounts = [...hourByIp.get(hour)!.entries()].sort((a, b) => b[1] - a[1]);
        const [topIp, topCount] = ipCounts[0];
        const share = topCount / total;
        if (share >= 0.6 && topCount >= 10) {
          flagged.push({
            id: 'off-hours-concentration',
            severity: share >= 0.85 ? 'warning' : 'info',
            title: 'Off-hours traffic concentrated in one IP',
            detail: `${topIp} made ${fmtPct(share)}% of the ${total.toLocaleString()} requests during hour ${String(hour).padStart(2, '0')}:00 UTC, a quiet period for this dataset`,
            metric: `${fmtPct(share)}%`,
            n: topCount,
            evidenceQuery: `client_ip = ${topIp}`,
          });
        }
      }
      insights.push(...flagged.sort((a, b) => (b.n ?? 0) - (a.n ?? 0)).slice(0, 3));
    }
  }

  // 9. Repeated failures from one IP — brute-force/scanning shape: high volume
  // AND mostly non-2xx, not just high volume (which #3 top-talker already covers).
  if (statusCol && ipCol) {
    const statusStore = stores.get(statusCol.key)!;
    const ipStore = stores.get(ipCol.key)!;
    const byIp = new Map<string, { total: number; failures: number }>();
    for (let i = 0; i < rowCount; i++) {
      const ip = String(ipStore.get(i) ?? '');
      if (!ip) continue;
      const s = Number(statusStore.get(i));
      const rec = byIp.get(ip) ?? { total: 0, failures: 0 };
      rec.total++;
      if (!isNaN(s) && s >= 400) rec.failures++;
      byIp.set(ip, rec);
    }
    const suspects = [...byIp.entries()]
      .map(([ip, r]) => ({ ip, ...r, rate: r.failures / r.total }))
      .filter(x => x.failures >= 10 && x.rate >= 0.5)
      .sort((a, b) => b.failures - a.failures)
      .slice(0, 3);
    for (const s of suspects) {
      insights.push({
        id: 'repeated-failures-ip',
        severity: s.rate >= 0.9 ? 'critical' : 'warning',
        title: 'Repeated failures from one IP',
        detail: `${s.ip} made ${s.failures.toLocaleString()} failing requests (${fmtPct(s.rate)}% of its ${s.total.toLocaleString()} total) — brute-force/scanning shape`,
        metric: `${fmtPct(s.rate)}%`,
        n: s.failures,
        evidenceQuery: `client_ip = ${s.ip} AND status >= 400`,
      });
    }
  }

  // 10. Suspicious request paths (probes for .env, admin panels, traversal,
  // injection signatures, etc.)
  if (uriCol) {
    const uriStore = stores.get(uriCol.key)!;
    const byLabel = new Map<string, { count: number; example: string; evidenceLiteral: string }>();
    for (let i = 0; i < rowCount; i++) {
      const uri = String(uriStore.get(i) ?? '');
      if (!uri) continue;
      for (const sig of SUSPICIOUS_PATH_PATTERNS) {
        if (sig.pattern.test(uri)) {
          const rec = byLabel.get(sig.label) ?? { count: 0, example: uri, evidenceLiteral: sig.evidenceLiteral };
          rec.count++;
          byLabel.set(sig.label, rec);
          break; // one match category per request is enough signal
        }
      }
    }
    for (const [label, rec] of byLabel) {
      insights.push({
        id: 'suspicious-path',
        severity: rec.count >= 10 ? 'critical' : 'warning',
        title: 'Suspicious request pattern',
        detail: `${rec.count.toLocaleString()} request(s) matching "${label}" (e.g. ${rec.example})`,
        metric: String(rec.count),
        n: rec.count,
        evidenceQuery: `${uriCol.key} contains "${rec.evidenceLiteral}"`,
      });
    }
  }

  // 11. Scanner/tool User-Agent signatures
  if (uaCol) {
    const uaStore = stores.get(uaCol.key)!;
    const byLabel = new Map<string, { count: number; evidenceLiteral: string }>();
    for (let i = 0; i < rowCount; i++) {
      const ua = String(uaStore.get(i) ?? '');
      if (!ua) continue;
      for (const sig of SCANNER_UA_PATTERNS) {
        if (sig.pattern.test(ua)) {
          const rec = byLabel.get(sig.label) ?? { count: 0, evidenceLiteral: sig.evidenceLiteral };
          rec.count++;
          byLabel.set(sig.label, rec);
          break;
        }
      }
    }
    for (const [label, rec] of byLabel) {
      insights.push({
        id: 'scanner-user-agent',
        severity: rec.count >= 10 ? 'warning' : 'info',
        title: 'Scanner/tool User-Agent detected',
        detail: `${rec.count.toLocaleString()} request(s) with a "${label}"-identified User-Agent`,
        metric: String(rec.count),
        n: rec.count,
        evidenceQuery: `${uaCol.key} contains "${rec.evidenceLiteral}"`,
      });
    }
  }

  return insights;
}

function fmtPct(v: number, p = 1): string {
  return (v * 100).toFixed(p);
}

function fmtTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
