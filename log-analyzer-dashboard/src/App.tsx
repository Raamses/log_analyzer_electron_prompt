import { useState, useEffect, useMemo } from 'react';
import InputView from './components/InputView';
import DashboardView from './components/DashboardView';
import StatusModal from './components/StatusModal';
import ContextMenu from './components/ContextMenu';
import { parseLogs, type LogEntry } from './utils/parser';
import { analyzeLogs, type LogAnalytics } from './utils/analytics';

const httpStatusCodes: { [key: number]: string } = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };

function App() {
  const [logContent, setLogContent] = useState<string>('');
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string>('');
  const [modalInfo, setModalInfo] = useState<{ title: string; content: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ip: string } | null>(null);

  const analytics: LogAnalytics | null = useMemo(() => parsedLogs.length > 0 ? analyzeLogs(parsedLogs) : null, [parsedLogs]);

  useEffect(() => {
    if (logContent) {
      const { logs, error } = parseLogs(logContent);
      setParsedLogs(logs);
      setError(error);
    } else {
      setParsedLogs([]);
      setError('');
    }
  }, [logContent]);

  const handleOpenFile = async () => {
    const content = await window.electron.openFile();
    if (content) {
      setLogContent(content);
    }
  };

  const handleClear = () => {
    setLogContent('');
  };

  const handleCodeClick = (code: string) => {
    setModalInfo({ title: `HTTP ${code}`, content: httpStatusCodes[parseInt(code, 10)] || "No description available." });
  };

  const handleIPClick = (ip: string, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, ip });
  };

  const handleContextMenuSelect = (option: string) => {
    console.log(`Selected ${option} for IP: ${contextMenu?.ip}`);
    setContextMenu(null);
  };

  return (
    <div className="bg-gray-900 text-white min-h-screen font-sans" onClick={() => setContextMenu(null)}>
      {modalInfo && <StatusModal {...modalInfo} onClose={() => setModalInfo(null)} />}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onSelect={handleContextMenuSelect} onClose={() => setContextMenu(null)} />}
      <header className="p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-center">IIS/Azure APGW Log Analyzer</h1>
      </header>
      <main className="p-4">
        {parsedLogs.length > 0 && analytics ? (
          <DashboardView
            analytics={analytics}
            logs={parsedLogs}
            onCodeClick={handleCodeClick}
            onIPClick={handleIPClick}
            onClear={handleClear}
          />
        ) : (
          <InputView onOpenFile={handleOpenFile} error={error} />
        )}
      </main>
    </div>
  );
}

export default App;
