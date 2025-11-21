import { useState, useRef } from 'react';
import type { LogEntry } from '../utils/parser';

interface VirtualizedLogViewerProps {
    logs: LogEntry[];
    rowHeight?: number;
    containerHeight?: number;
}

const getStatusColor = (code: number) => {
    if (code >= 500) return 'text-red-500 bg-red-500/10';
    if (code >= 400) return 'text-orange-400 bg-orange-400/10';
    if (code >= 300) return 'text-blue-400 bg-blue-400/10';
    return 'text-green-400 bg-green-400/10';
};

const VirtualizedLogViewer = ({ logs, rowHeight = 32, containerHeight = 500 }: VirtualizedLogViewerProps) => {
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const startIndex = Math.floor(scrollTop / rowHeight);
    const endIndex = Math.min(
        startIndex + Math.ceil(containerHeight / rowHeight),
        logs.length
    );

    const visibleLogs = logs.slice(startIndex, endIndex);

    return (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
             <div className="grid grid-cols-12 bg-gray-800/50 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-2">
                <div className="col-span-2">Timestamp</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-2">Client IP</div>
                <div className="col-span-1 text-right pr-4">Time (ms)</div>
                <div className="col-span-6">URI Stem</div>
            </div>

            <div
                ref={containerRef}
                className="overflow-y-auto relative scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                style={{ height: `${containerHeight}px` }}
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
                <div style={{ height: `${logs.length * rowHeight}px` }}>
                    <div style={{ position: 'absolute', top: `${startIndex * rowHeight}px`, left: 0, right: 0 }}>
                        {visibleLogs.map((log, index) => (
                            <div
                                key={startIndex + index}
                                className="grid grid-cols-12 items-center px-4 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors text-sm font-mono"
                                style={{ height: `${rowHeight}px` }}
                            >
                                <div className="col-span-2 text-gray-400 truncate">
                                    {log.timestamp.toLocaleTimeString()}
                                </div>
                                <div className="col-span-1">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${getStatusColor(log.statusCode)}`}>
                                        {log.statusCode}
                                    </span>
                                </div>
                                <div className="col-span-2 text-gray-300 truncate" title={log.clientIp}>{log.clientIp}</div>
                                <div className="col-span-1 text-right pr-4 text-gray-400">{log.timeTaken.toFixed(0)}</div>
                                <div className="col-span-6 text-gray-300 truncate" title={log.uriStem}>{log.uriStem}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="bg-gray-800/30 border-t border-gray-800 px-4 py-2 text-xs text-gray-500 flex justify-between">
                <span>Showing {logs.length.toLocaleString()} entries</span>
            </div>
        </div>
    );
};

export default VirtualizedLogViewer;
