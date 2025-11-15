import { useState, useEffect, useMemo } from 'react';
import StatCard from './components/StatCard';
import ErrorSummary from './components/ErrorSummary';
import TrafficSegmentation from './components/TrafficSegmentation';
import ServerThroughput from './components/ServerThroughput';
import VirtualizedLogViewer from './components/VirtualizedLogViewer';
import { parseLogs, type LogEntry } from './utils/parser';
import { analyzeLogs } from './utils/analytics';
import FileUploader from './components/FileUploader';

const httpStatusCodes: { [key: number]: string } = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };

const StatusModal = ({ title, content, onClose }: { title: string, content: string, onClose: () => void }) => {
    const statusType = title.includes('4') ? 'warning' : 'destructive';
    return (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
            <div className="bg-card text-card-foreground rounded-lg shadow-xl max-w-sm w-full">
                <div className={`p-4 rounded-t-lg ${statusType === 'warning' ? 'bg-warning' : 'bg-destructive'}`}>
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                </div>
                <div className="p-6">
                    <p className="text-card-foreground">{content}</p>
                    <button onClick={onClose} className="mt-6 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 px-4 rounded-md w-full transition-colors">Close</button>
                </div>
            </div>
        </div>
    );
};

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
      {modalInfo && <StatusModal {...modalInfo} onClose={() => setModalInfo(null)} />}
      <header className="text-left mb-8">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Log Analyzer Dashboard</h1>
        <p className="text-muted-foreground mt-1">Analyze IIS/Azure APGW log files with ease</p>
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
      />

      {error && <div className="mt-6 text-center text-destructive bg-destructive/10 p-4 rounded-lg">{error}</div>}

      {analytics && isParsed && (
        <main className="mt-8">
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Total Requests" value={analytics.totalRequests} />
              <StatCard title="Log Time Span" value={analytics.timeSpan} unit="min" />
              <ErrorSummary analytics={analytics} onCodeClick={handleCodeClick} />
              <TrafficSegmentation analytics={analytics} />
              <ServerThroughput analytics={analytics} />
          </section>
          <section className="mt-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Log Viewer</h2>
              <VirtualizedLogViewer logs={parsedLogs} />
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
