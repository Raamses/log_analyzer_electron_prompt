import { useState, useEffect, useMemo, useRef } from 'react';
import StatCard from './components/StatCard';
import ErrorSummary from './components/ErrorSummary';
import TrafficSegmentation from './components/TrafficSegmentation';
import ServerThroughput from './components/ServerThroughput';
import VirtualizedLogViewer from './components/VirtualizedLogViewer';
import { parseLogs, type LogEntry } from './utils/parser';
import { analyzeLogs } from './utils/analytics';
import FileUploader from './components/FileUploader';
import InsightBlock from './components/InsightBlock';

const httpStatusCodes: { [key: number]: string } = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };

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
  const [logContent, setLogContent] = useState('');
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const [isParsed, setIsParsed] = useState(false);
  const [modalInfo, setModalInfo] = useState<{ title: string; content: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analytics = useMemo(() => analyzeLogs(parsedLogs), [parsedLogs]);

  useEffect(() => {
    if (logContent) {
      const { logs, error } = parseLogs(logContent);
      setParsedLogs(logs);
      setError(error);
      setIsParsed(logs.length > 0);
    } else {
      setParsedLogs([]);
      setIsParsed(false);
      setError('');
    }
  }, [logContent]);

  const handleOpenFile = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (event) => setLogContent(event.target?.result as string);
          reader.readAsText(file);
      }
  };

  const handleCodeClick = (code: string) => setModalInfo({ title: `HTTP ${code}`, content: httpStatusCodes[parseInt(code, 10)] || "No description available." });

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
          reader.onload = (event) => setLogContent(event.target?.result as string);
          reader.readAsText(file);
      }
  };

  const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setLogContent('');
  };

  return (
    <div className="container mx-auto p-8">
      {modalInfo && <Modal {...modalInfo} onClose={() => setModalInfo(null)} />}
      <header className="text-center mb-10">
        <h1 className="text-5xl font-extrabold text-white tracking-tight">Log Analyzer Dashboard</h1>
        <p className="text-gray-400 mt-2">Analyze IIS/Azure APGW log files with ease</p>
      </header>

      <FileUploader
          isParsed={isParsed}
          parsedLogsCount={parsedLogs.length}
          onOpenFile={handleOpenFile}
          onClear={handleClear}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onFileSelect={handleFileSelect}
          isDragging={isDragging}
          logContent={logContent}
          fileInputRef={fileInputRef}
      />

      {error && <div className="mt-6 text-center text-red-400 bg-red-900/50 p-4 rounded-xl">{error}</div>}

      {analytics && isParsed && (
        <div className="mt-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <StatCard title="Total Requests" value={analytics.totalRequests} description="Total number of requests in the log file." />
              <StatCard title="Log Time Span" value={analytics.timeSpan} unit="min" description="Duration of the log file." />
              <StatCard title="Error Rate" value={analytics.errorRate.toFixed(2)} unit="%" description="Percentage of requests that resulted in an error." />
              <StatCard title="Avg. RPM" value={analytics.throughput.rpm1.mean} description="Average requests per minute over the last minute." />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <ErrorSummary analytics={analytics} onCodeClick={handleCodeClick} />
                <ServerThroughput analytics={analytics} />
            </div>
            <div className="lg:col-span-2">
                <TrafficSegmentation analytics={analytics} />
            </div>
          </div>

          <div className="mt-6">
            <InsightBlock title="Log Viewer">
                <VirtualizedLogViewer logs={parsedLogs} />
            </InsightBlock>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
