import { useState, useRef } from 'react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { Filter, Globe, ExternalLink, ShieldAlert, Copy } from 'lucide-react';

interface LogEntry {
    timestamp: Date;
    uriStem: string;
    statusCode: number;
    timeTaken: number;
    clientIp: string;
    method?: string;
}

interface VirtualizedLogViewerProps {
    logs: LogEntry[];
    rowHeight?: number;
    containerHeight?: number;
    onToggleIp: (ip: string) => void;
    onLookupIp: (ip: string) => void;
}

const VirtualizedLogViewer = ({
    logs,
    rowHeight = 36,
    containerHeight = 500,
    onToggleIp,
    onLookupIp,
}: VirtualizedLogViewerProps) => {
    const [scrollTop, setScrollTop] = useState(0);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ip: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const startIndex = Math.floor(scrollTop / rowHeight);
    const endIndex = Math.min(
        startIndex + Math.ceil(containerHeight / rowHeight),
        logs.length
    );

    const visibleLogs = logs.slice(startIndex, endIndex);

    const getStatusStyle = (statusCode: number) => {
        if (statusCode >= 500) {
            return 'bg-red-500/10 text-red-400 border border-red-500/20 font-bold glow-red animate-pulse-slow';
        }
        if (statusCode >= 400) {
            return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
        }
        if (statusCode >= 300) {
            return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
        }
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    };

    const getMethodStyle = (method: string) => {
        switch (method) {
            case 'GET':
                return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            case 'POST':
                return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
            case 'PUT':
                return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
            case 'DELETE':
                return 'bg-red-500/10 text-red-400 border border-red-500/20';
            default:
                return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
        }
    };

    return (
        <div className="bg-slate-950 rounded-xl border border-slate-900 overflow-hidden shadow-2xl">
             <div className="grid grid-cols-12 bg-slate-900/60 border-b border-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 font-sans font-medium">
                <div className="col-span-2">Timestamp</div>
                <div className="col-span-1">Method</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-2">Client IP</div>
                <div className="col-span-1 text-right pr-4">Time (ms)</div>
                <div className="col-span-5">URI Stem</div>
            </div>

            <div
                ref={containerRef}
                className="overflow-y-auto relative scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
                style={{ height: `${containerHeight}px` }}
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
                <div style={{ height: `${logs.length * rowHeight}px` }} className="w-full">
                    <div style={{ position: 'absolute', top: `${startIndex * rowHeight}px`, left: 0, right: 0 }}>
                        {visibleLogs.map((log, index) => {
                            const method = log.method || (log.uriStem.includes('Search') || log.uriStem.includes('api/') ? 'POST' : 'GET');
                            return (
                                <div
                                    key={startIndex + index}
                                    className="grid grid-cols-12 items-center px-4 border-b border-slate-900/50 hover:bg-slate-900/40 text-slate-300 hover:text-slate-100 transition-colors text-xs font-mono"
                                    style={{ height: `${rowHeight}px` }}
                                >
                                    <div className="col-span-2 text-slate-500 truncate">
                                        {log.timestamp.toLocaleTimeString()}
                                    </div>
                                    <div className="col-span-1">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getMethodStyle(method)}`}>
                                            {method}
                                        </span>
                                    </div>
                                    <div className="col-span-1">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusStyle(log.statusCode)}`}>
                                            {log.statusCode}
                                        </span>
                                    </div>
                                    <div
                                        className="col-span-2 text-slate-400 truncate hover:text-indigo-400 hover:underline cursor-context-menu select-all transition-colors"
                                        title="Right-click for IP tools"
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setContextMenu({
                                                x: e.clientX,
                                                y: e.clientY,
                                                ip: log.clientIp
                                            });
                                        }}
                                    >
                                        {log.clientIp}
                                    </div>
                                    <div className="col-span-1 text-right pr-4 text-slate-500 font-semibold">
                                        {log.timeTaken.toFixed(0)}
                                    </div>
                                    <div className="col-span-5 text-slate-300 truncate font-mono select-all" title={log.uriStem}>
                                        {log.uriStem}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            <div className="bg-slate-900/30 border-t border-slate-900 px-4 py-2.5 text-xs text-slate-500 flex justify-between font-sans font-semibold">
                <span>Showing {logs.length.toLocaleString()} entries</span>
            </div>

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                >
                    <ContextMenuItem
                        icon={<Filter size={12} />}
                        onClick={() => {
                            onToggleIp(contextMenu.ip);
                            setContextMenu(null);
                        }}
                    >
                        Filter by IP
                    </ContextMenuItem>
                    <ContextMenuItem
                        icon={<Globe size={12} />}
                        onClick={() => {
                            onLookupIp(contextMenu.ip);
                            setContextMenu(null);
                        }}
                    >
                        Lookup IP Intelligence
                    </ContextMenuItem>
                    <ContextMenuItem
                        icon={<ExternalLink size={12} />}
                        onClick={() => {
                            window.open(`https://whois.domaintools.com/${contextMenu.ip}`, '_blank');
                            setContextMenu(null);
                        }}
                    >
                        Whois Lookup
                    </ContextMenuItem>
                    <ContextMenuItem
                        icon={<ShieldAlert size={12} />}
                        onClick={() => {
                            window.open(`https://www.abuseipdb.com/check/${contextMenu.ip}`, '_blank');
                            setContextMenu(null);
                        }}
                    >
                        Search AbuseIPDB
                    </ContextMenuItem>
                    <ContextMenuItem
                        icon={<Copy size={12} />}
                        onClick={() => {
                            navigator.clipboard.writeText(contextMenu.ip);
                            setContextMenu(null);
                        }}
                    >
                        Copy IP Address
                    </ContextMenuItem>
                </ContextMenu>
            )}
        </div>
    );
};

export default VirtualizedLogViewer;
