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

import type { Dataset, ColumnDef } from '../types';

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

export function generateInsights(
  dataset: Dataset,
  config: InsightConfig = {},
): Insight[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const insights: Insight[] = [];
  const columns = dataset.columns;
  const rows = dataset.rows;

  if (rows.length < cfg.minSample) return insights;

  // Resolve columns by role
  const statusCol = columns.find(c => c.role === 'status');
  const latencyCol = columns.find(c => c.role === 'latency_ms');
  const uriCol = columns.find(c => c.role === 'uri');
  const ipCol = columns.find(c => c.role === 'client_ip');
  const methodCol = columns.find(c => c.role === 'method');
  const cacheCol = columns.find(c => c.role === 'cache_status');

  // 1. Error rate
  if (statusCol) {
    const total = rows.length;
    const errors = rows.filter(r => {
      const s = Number(r[statusCol.key]);
      return !isNaN(s) && s >= 400;
    }).length;
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
    const byEndpoint = new Map<string, number[]>();
    for (const row of rows) {
      const uri = String(row[uriCol.key] ?? '');
      const lat = Number(row[latencyCol.key]);
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
    const byIp = new Map<string, number>();
    for (const row of rows) {
      const ip = String(row[ipCol.key] ?? '');
      if (!ip) continue;
      byIp.set(ip, (byIp.get(ip) ?? 0) + 1);
    }

    const top = [...byIp.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const total = rows.length;
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
    const hits = rows.filter(r => {
      const v = String(r[cacheCol.key] ?? '').toLowerCase();
      return v === 'hit' || v === 'cached' || v === 'fresh';
    }).length;
    const rate = hits / rows.length;
    if (rate < 0.5) {
      insights.push({
        id: 'low-cache-hit',
        severity: 'info',
        title: 'Low cache hit ratio',
        detail: `${fmtPct(rate)}% cache hit rate (${hits.toLocaleString()} of ${rows.length.toLocaleString()})`,
        metric: `${fmtPct(rate)}%`,
        n: hits,
        evidenceQuery: 'cache_status contains "miss"',
      });
    }
  }

  return insights;
}

function fmtPct(v: number, p = 1): string {
  return (v * 100).toFixed(p);
}
