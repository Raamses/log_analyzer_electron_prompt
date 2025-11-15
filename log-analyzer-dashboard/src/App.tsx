import { useState, useEffect, useMemo } from 'react';
import SummaryCard from './components/SummaryCard';
import ErrorSummary from './components/ErrorSummary';
import TrafficSegmentation from './components/TrafficSegmentation';
import ServerThroughput from './components/ServerThroughput';
import VirtualizedLogViewer from './components/VirtualizedLogViewer';
import { parseLogs, type LogEntry } from './utils/parser';
import { analyzeLogs } from './utils/analytics';
import FileUploader from './components/FileUploader';

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

  const handleOpenFile = async () => {
    const content = await window.electron.openFile();
    if (content) {
      setLogContent(content);
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

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
          const reader = new FileReader();
          reader.onload = async () => {
              const content = await window.electron.readFile(reader.result as ArrayBuffer);
              if (content) {
                  setLogContent(content);
              }
          };
          reader.readAsArrayBuffer(files[0]);
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
          isDragging={isDragging}
          logContent={logContent}
      />

      {error && <div className="mt-6 text-center text-red-400 bg-red-900/50 p-4 rounded-xl">{error}</div>}

      {analytics && isParsed && (
        <div className="mt-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <SummaryCard title="Total Requests" value={analytics.totalRequests} />
              <SummaryCard title="Log Time Span" value={analytics.timeSpan} unit="min" />
              <ErrorSummary analytics={analytics} onCodeClick={handleCodeClick} />
              <TrafficSegmentation analytics={analytics} />
              <ServerThroughput analytics={analytics} />
          </div>
          <div className="mt-10 bg-gray-900 p-6 rounded-xl border border-gray-800">
              <h2 className="text-2xl font-semibold text-white mb-4">Log Viewer</h2>
              <VirtualizedLogViewer logs={parsedLogs} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
