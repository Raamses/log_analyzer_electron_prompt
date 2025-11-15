import React from 'react';
import { type LogAnalytics } from '../utils/analytics';
import { type LogEntry } from '../utils/parser';
import StatCard from './StatCard';
import ErrorSummary from './ErrorSummary';
import TrafficSegmentation from './TrafficSegmentation';
import ServerThroughput from './ServerThroughput';
import VirtualizedLogViewer from './VirtualizedLogViewer';

interface DashboardViewProps {
  analytics: LogAnalytics;
  logs: LogEntry[];
  onCodeClick: (code: string) => void;
  onIPClick: (ip: string, event: React.MouseEvent) => void;
  onClear: () => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({ analytics, logs, onCodeClick, onIPClick, onClear }) => {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={onClear} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
          Clear Logs
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Requests" value={analytics.totalRequests} description="Total number of requests logged." trend="neutral" />
        <StatCard title="Log Time Span" value={analytics.timeSpan} unit="min" description="Duration of the log file." trend="neutral" />
        <ErrorSummary analytics={analytics} onCodeClick={onCodeClick} />
        <TrafficSegmentation analytics={analytics} />
        <div className="md:col-span-2 lg:col-span-4">
            <ServerThroughput analytics={analytics} />
        </div>
      </div>
      <div className="mt-8 bg-gray-800 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Raw Logs Viewer</h2>
        <VirtualizedLogViewer logs={logs} onIPClick={onIPClick} />
      </div>
    </div>
  );
};

export default DashboardView;
