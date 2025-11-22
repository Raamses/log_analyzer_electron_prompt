import { useState, useRef, useMemo, FC } from 'react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';

interface LogEntry {
    timestamp: Date;
    uriStem: string;
    statusCode: number;
    timeTaken: number;
    clientIp: string;
}

interface VirtualizedLogViewerProps {
    logs: LogEntry[];
    rowHeight?: number;
    containerHeight?: number;
}

const VirtualizedLogViewer = ({ logs, rowHeight = 32, containerHeight = 500 }: VirtualizedLogViewerProps) => {
    const [scrollTop, setScrollTop] = useState(0);
    const [filter, setFilter] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; log: LogEntry } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const filteredLogs = useMemo(() =>
        logs.filter(log =>
            log.uriStem.toLowerCase().includes(filter.toLowerCase()) ||
            log.statusCode.toString().includes(filter) ||
            log.clientIp.includes(filter)
        ), [logs, filter]);

    const startIndex = Math.floor(scrollTop / rowHeight);
    const endIndex = Math.min(
        startIndex + Math.ceil(containerHeight / rowHeight),
        filteredLogs.length
    );

    const visibleLogs = filteredLogs.slice(startIndex, endIndex);

    const getStatusColor = (statusCode: number) => {
        if (statusCode >= 500) return 'text-red-400';
        if (statusCode >= 400) return 'text-yellow-400';
        if (statusCode >= 300) return 'text-blue-400';
        return 'text-green-400';
    };

    const handleContextMenu = (e: React.MouseEvent, log: LogEntry) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, log });
    };

    const handleFilterBy = (field: keyof LogEntry, value: string | number) => {
        setFilter(String(value));
        setContextMenu(null);
    };

    return (
        <div className="flex flex-col h-full">
            {contextMenu && (
                <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
                    <ContextMenuItem onClick={() => handleFilterBy('statusCode', contextMenu.log.statusCode)}>
                        Filter by Status Code: {contextMenu.log.statusCode}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleFilterBy('clientIp', contextMenu.log.clientIp)}>
                        Filter by IP: {contextMenu.log.clientIp}
                    </ContextMenuItem>
                </ContextMenu>
            )}
            <div className="flex-shrink-0 p-2">
                <input
                    type="text"
                    placeholder="Filter logs..."
                    className="w-full px-3 py-2 text-sm text-gray-200 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
            </div>
            <div className="flex-grow bg-gray-900 rounded-lg overflow-hidden">
                <div className="sticky top-0 bg-gray-800 z-10">
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        <div className="col-span-3">Timestamp</div>
                        <div className="col-span-1 text-center">Status</div>
                        <div className="col-span-2">Client IP</div>
                        <div className="col-span-2 text-right">Time Taken</div>
                        <div className="col-span-4">URI</div>
                    </div>
                </div>
                <div
                    ref={containerRef}
                    className="overflow-y-auto"
                    style={{ height: `${containerHeight}px` }}
                    onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                >
                    <div className="relative" style={{ height: `${filteredLogs.length * rowHeight}px` }}>
                        <div style={{ position: 'absolute', top: `${startIndex * rowHeight}px`, left: 0, right: 0, width: '100%' }}>
                            {visibleLogs.map((log, index) => (
                                <div
                                    key={startIndex + index}
                                    className="grid grid-cols-12 gap-4 items-center px-4 py-1 text-sm font-mono whitespace-nowrap hover:bg-gray-800/50"
                                    style={{ height: `${rowHeight}px` }}
                                    onContextMenu={(e) => handleContextMenu(e, log)}
                                >
                                    <div className="col-span-3 text-gray-400">{log.timestamp.toISOString()}</div>
                                    <div className={`col-span-1 text-center font-semibold ${getStatusColor(log.statusCode)}`}>{log.statusCode}</div>
                                    <div className="col-span-2 text-gray-300">{log.clientIp}</div>
                                    <div className="col-span-2 text-right text-gray-300">{log.timeTaken.toFixed(2)}ms</div>
                                    <div className="col-span-4 text-gray-300 truncate">{log.uriStem}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VirtualizedLogViewer;
