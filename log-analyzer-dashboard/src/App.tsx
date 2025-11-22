import { useRef, useState } from 'react';
import { useLogAnalysis } from './hooks/useLogAnalysis';
import DashboardLayout from './components/DashboardLayout';
import FileUploader from './components/FileUploader';
import SummaryCard from './components/SummaryCard';
import TrafficSegmentation from './components/TrafficSegmentation';
import ServerThroughput from './components/ServerThroughput';
import VirtualizedLogViewer from './components/VirtualizedLogViewer';
import ThroughputChart from './components/charts/ThroughputChart';
import StatusDistributionChart from './components/charts/StatusDistributionChart';
import { Activity, Clock, AlertTriangle, FileText } from 'lucide-react';

const Modal = ({ title, content, onClose }: { title: string, content: string, onClose: () => void }) => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-sm w-full shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-white">{title}</h2>
            <p className="text-gray-300">{content}</p>
            <button onClick={onClose} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg w-full">Close</button>
        </div>
    </div>
);

function App() {
  const {
    logs,
    allLogs, // Use full logs to determine available status codes
    analytics,
    error,
    isParsed,
    filters,
    setFilters,
    processFileContent,
    clearLogs
  } = useLogAnalysis();

  const [modalInfo, setModalInfo] = useState<{ title: string; content: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to derive unique status codes from ALL logs for the filter sidebar
  const allStatusCodes = Array.from(new Set(allLogs.map(l => l.statusCode))).sort();

  const handleOpenFile = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (event) => processFileContent(event.target?.result as string);
          reader.readAsText(file);
      }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (event) => processFileContent(event.target?.result as string);
          reader.readAsText(file);
      }
  };

  const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      clearLogs();
  };

  if (!isParsed) {
    return (
       <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
          <header className="text-center mb-10">
            <h1 className="text-5xl font-extrabold text-white tracking-tight">Log Analyzer</h1>
            <p className="text-gray-400 mt-2">Drag & drop your IIS or Azure APGW logs to begin analysis</p>
          </header>
          <div className="w-full max-w-2xl">
             <FileUploader
                isParsed={isParsed}
                parsedLogsCount={0}
                onOpenFile={handleOpenFile}
                onClear={handleClear}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onFileSelect={handleFileSelect}
                isDragging={isDragging}
                logContent={''} // Not needed for unparsed state in new flow logic essentially
                fileInputRef={fileInputRef}
            />
            {error && <div className="mt-6 text-center text-red-400 bg-red-900/20 border border-red-900/50 p-4 rounded-xl">{error}</div>}
          </div>
       </div>
    );
  }

  return (
    <DashboardLayout filters={filters} setFilters={setFilters} allStatusCodes={allStatusCodes}>
        {modalInfo && <Modal {...modalInfo} onClose={() => setModalInfo(null)} />}

        <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
             <button
                onClick={handleClear}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700"
            >
                Upload New Log
            </button>
        </div>

        {/* KPI Grid */}
        {analytics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <SummaryCard
                    title="Total Requests"
                    value={analytics.totalRequests.toLocaleString()}
                    icon={<Activity size={24} />}
                />
                <SummaryCard
                    title="Duration"
                    value={analytics.timeSpan}
                    unit="min"
                    icon={<Clock size={24} />}
                />
                <SummaryCard
                    title="Error Rate"
                    value={analytics.errorRate.toFixed(2)}
                    unit="%"
                    icon={<AlertTriangle size={24} className={analytics.errorRate > 1 ? "text-red-500" : "text-green-500"} />}
                />
                 <SummaryCard
                    title="5xx Errors"
                    value={analytics.serverErrors.toLocaleString()}
                    icon={<FileText size={24} />}
                />
            </div>
        )}

        {/* Charts Row */}
        {analytics && analytics.timeSeriesData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <ThroughputChart data={analytics.timeSeriesData} />
                </div>
                <div>
                    <StatusDistributionChart data={analytics.errorCodes} />
                </div>
            </div>
        )}

        {/* Detailed Analysis Grid */}
        {analytics && (
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TrafficSegmentation analytics={analytics} />
                <ServerThroughput analytics={analytics} />
            </div>
        )}

        {/* Log Viewer */}
        <div className="flex flex-col space-y-4">
            <h2 className="text-xl font-semibold text-white">Detailed Logs</h2>
            <VirtualizedLogViewer logs={logs} />
        </div>

    </DashboardLayout>
  );
}

export default App;
