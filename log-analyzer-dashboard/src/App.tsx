import { useState, useEffect, useMemo } from 'react';
import SummaryCard from './components/SummaryCard';
import ErrorSummary from './components/ErrorSummary';
import TrafficSegmentation from './components/TrafficSegmentation';
import ServerThroughput from './components/ServerThroughput';
import VirtualizedLogViewer from './components/VirtualizedLogViewer';
import { parseLogs, type LogEntry } from './utils/parser';
import { analyzeLogs } from './utils/analytics';

const httpStatusCodes: { [key: number]: string } = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };

const Modal = ({ title, content, onClose }: { title: string, content: string, onClose: () => void }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-xl font-bold mb-4">{title}</h2>
            <p>{content}</p>
            <button onClick={onClose} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Close</button>
        </div>
    </div>
);

function App() {
  const [logContent, setLogContent] = useState('');
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const [isParsed, setIsParsed] = useState(false);
  const [modalInfo, setModalInfo] = useState<{ title: string; content: string } | null>(null);

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

  return (
    <div className="container mx-auto p-4">
      {modalInfo && <Modal {...modalInfo} onClose={() => setModalInfo(null)} />}
      <h1 className="text-3xl font-bold text-center mb-6">IIS/Azure APGW Log Analyzer</h1>
      <div className={`bg-gray-800 p-4 rounded-lg border-2 border-dashed border-gray-600 hover:border-gray-400 transition-all duration-300 ${isParsed ? 'h-24' : 'h-60'}`}>
          <textarea className={`w-full bg-gray-700 text-white p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 ${isParsed ? 'h-0 opacity-0' : 'h-40'}`} placeholder="Select a log file to begin" value={logContent} readOnly></textarea>
          {isParsed ? (<div className="text-center text-green-400"><p>Parsed {parsedLogs.length} entries.</p><button onClick={() => setLogContent('')} className="text-blue-400 underline mt-2">Clear</button></div>) : (<div className="mt-4 text-center"><button className="bg-blue-600 hover:bg-blue-700 font-bold py-2 px-4 rounded-lg" onClick={handleOpenFile}>Select File</button></div>)}
      </div>
      {error && <div className="mt-4 text-center text-red-400 bg-red-900 p-3 rounded-lg">{error}</div>}
      {analytics && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <SummaryCard title="Total Requests" value={analytics.totalRequests} />
              <SummaryCard title="Log Time Span" value={analytics.timeSpan} unit="min" />
              <ErrorSummary analytics={analytics} onCodeClick={handleCodeClick} />
              <TrafficSegmentation analytics={analytics} />
              <ServerThroughput analytics={analytics} />
          </div>
      )}
      <div className="mt-8 bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Raw Logs Viewer</h2>
          {isParsed && <VirtualizedLogViewer logs={parsedLogs} />}
      </div>
    </div>
  );
}

export default App;
