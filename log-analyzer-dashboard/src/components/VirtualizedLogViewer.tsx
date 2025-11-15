import { useState, useRef } from 'react';
import { type LogEntry } from '../utils/parser';

interface VirtualizedLogViewerProps {
    logs: LogEntry[];
    onIPClick: (ip: string, event: React.MouseEvent) => void;
    rowHeight?: number;
    containerHeight?: number;
}

const VirtualizedLogViewer = ({ logs, onIPClick, rowHeight = 24, containerHeight = 400 }: VirtualizedLogViewerProps) => {
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const startIndex = Math.floor(scrollTop / rowHeight);
    const endIndex = Math.min(
        startIndex + Math.ceil(containerHeight / rowHeight),
        logs.length
    );

    const visibleLogs = logs.slice(startIndex, endIndex);

    return (
        <div
            ref={containerRef}
            className="h-96 overflow-y-auto bg-gray-700 rounded-md p-2 relative"
            style={{ height: `${containerHeight}px` }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
            <div style={{ height: `${logs.length * rowHeight}px` }}>
                <div style={{ position: 'absolute', top: `${startIndex * rowHeight}px`, left: 0, right: 0 }}>
                    {visibleLogs.map((log, index) => (
                        <div key={startIndex + index} className="font-mono text-sm whitespace-pre" style={{ height: `${rowHeight}px` }}>
                            {`${log.timestamp.toISOString()} | ${log.statusCode} | `}
                            <span
                                className="underline cursor-pointer"
                                onContextMenu={(e) => onIPClick(log.clientIp, e)}
                            >
                                {log.clientIp.padEnd(15)}
                            </span>
                            {` | ${log.timeTaken.toFixed(2).padStart(8)}ms | ${log.uriStem}`}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default VirtualizedLogViewer;
