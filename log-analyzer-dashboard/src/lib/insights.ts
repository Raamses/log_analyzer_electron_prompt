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

  return insights;
}

function fmtPct(v: number, p = 1): string {
  return (v * 100).toFixed(p);
}
