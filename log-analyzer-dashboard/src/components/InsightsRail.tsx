// @paths components
/**
 * InsightsRail — displays generated insights with evidence links.
 *
 * Each insight shows severity, title, detail (with numbers), and a
 * "Show evidence" link that applies the reproducing query.
 */

import { useMemo } from 'react';
import { generateInsights, type Insight } from '../lib/insights';
import type { Dataset } from '../lib/types';

interface InsightsRailProps {
  dataset: Dataset;
  onApplyQuery: (query: string) => void;
}

const severityStyles: Record<Insight['severity'], string> = {
  info: 'border-blue-500/20 bg-blue-500/5',
  warning: 'border-amber-500/20 bg-amber-500/5',
  critical: 'border-red-500/20 bg-red-500/5',
};

const severityIcons: Record<Insight['severity'], string> = {
  info: 'ℹ',
  warning: '⚠',
  critical: '🔴',
};

export const InsightsRail = ({ dataset, onApplyQuery }: InsightsRailProps) => {
  const insights = useMemo(() => generateInsights(dataset), [dataset]);

  if (insights.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-600">
        No anomalies detected
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Insights ({insights.length})
      </h3>
      {insights.map((insight) => (
        <div
          key={insight.id}
          className={`p-3 rounded-lg border ${severityStyles[insight.severity]}`}
        >
          <div className="flex items-start gap-2">
            <span className="text-sm">{severityIcons[insight.severity]}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-200 mb-1">
                {insight.title}
              </div>
              <div className="text-xs text-slate-400 leading-relaxed">
                {insight.detail}
              </div>
              {insight.evidenceQuery && (
                <button
                  onClick={() => onApplyQuery(insight.evidenceQuery)}
                  className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  Show evidence →
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
