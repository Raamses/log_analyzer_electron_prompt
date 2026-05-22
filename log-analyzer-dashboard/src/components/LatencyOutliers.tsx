import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { AlertTriangle, Clock, Zap, ShieldAlert, Cpu, ExternalLink, Globe, Copy, Filter, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';

interface OutlierEntry {
    timestamp: Date;
    uriStem: string;
    statusCode: number;
    timeTaken: number;
    clientIp: string;
    method?: string;
    zScore: number;
    endpointMean: number;
    endpointStdDev: number;
}

interface LatencyOutliersProps {
    anomalies: {
        totalOutliers: number;
        outlierRate: number;
        overallStdDev: number;
        overallMean: number;
        latencyOutliers: OutlierEntry[];
        ipCorrelation: { value: string; count: number; percentage: number }[];
        methodCorrelation: { value: string; count: number; percentage: number }[];
        statusCorrelation: { value: number; count: number; percentage: number }[];
        distributionData: { range: string; count: number }[];
    };
    onToggleIp: (ip: string) => void;
    onToggleEndpoint: (endpoint: string) => void;
    onLookupIp: (ip: string) => void;
}

const LatencyOutliers: React.FC<LatencyOutliersProps> = ({
    anomalies,
    onToggleIp,
    onToggleEndpoint,
    onLookupIp,
}) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [sortCol, setSortCol] = useState<'zScore' | 'timeTaken' | 'timestamp'>('zScore');
    const [sortAsc, setSortAsc] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ip: string } | null>(null);

    const pageSize = 10;
    const outliersList = anomalies.latencyOutliers;

    // Handle sort
    const handleSort = (col: 'zScore' | 'timeTaken' | 'timestamp') => {
        if (sortCol === col) {
            setSortAsc(!sortAsc);
        } else {
            setSortCol(col);
            setSortAsc(false);
        }
        setCurrentPage(1);
    };

    const sortedData = useMemo(() => {
        const sorted = [...outliersList];
        sorted.sort((a, b) => {
            if (sortCol === 'timestamp') {
                return sortAsc 
                    ? a.timestamp.getTime() - b.timestamp.getTime() 
                    : b.timestamp.getTime() - a.timestamp.getTime();
            }
            const valA = a[sortCol];
            const valB = b[sortCol];
            return sortAsc 
                ? (valA as number) - (valB as number) 
                : (valB as number) - (valA as number);
        });
        return sorted;
    }, [outliersList, sortCol, sortAsc]);

    const totalPages = Math.ceil(sortedData.length / pageSize);
    const paginatedData = useMemo(() => {
        return sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    }, [sortedData, currentPage]);

    const handleIpRightClick = (e: React.MouseEvent<HTMLTableCellElement>, ip: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            ip
        });
    };

    // Find the single worst/most degraded endpoint from the outliers list
    const worstEndpoint = useMemo(() => {
        if (outliersList.length === 0) return 'None';
        const counts: Record<string, { count: number; maxLat: number }> = {};
        outliersList.forEach(o => {
            if (!counts[o.uriStem]) counts[o.uriStem] = { count: 0, maxLat: 0 };
            counts[o.uriStem].count++;
            if (o.timeTaken > counts[o.uriStem].maxLat) {
                counts[o.uriStem].maxLat = o.timeTaken;
            }
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
        return sorted[0] ? `${sorted[0][0]} (${sorted[0][1].count} outliers, max ${sorted[0][1].maxLat.toFixed(0)}ms)` : 'None';
    }, [outliersList]);

    // Custom Tooltip for Recharts
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="glass-panel p-3 border border-slate-800 rounded-lg text-xs font-sans">
                    <p className="text-slate-400 font-bold uppercase tracking-wider mb-1">{payload[0].payload.range}</p>
                    <p className="text-indigo-400 font-bold font-mono">
                        Count: <span className="text-slate-200">{payload[0].value.toLocaleString()} requests</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    const renderSortableHeader = (label: string, col: 'zScore' | 'timeTaken' | 'timestamp') => (
        <th className="px-4 py-3 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort(col)}>
            <div className="flex items-center gap-1">
                {label}
                <ArrowUpDown size={12} className={sortCol === col ? (sortAsc ? 'text-indigo-400 rotate-180' : 'text-indigo-400') : 'text-slate-600'} />
            </div>
        </th>
    );

    return (
        <div className="glass-panel p-6 rounded-2xl col-span-1 md:col-span-2 lg:col-span-4 flex flex-col gap-6 relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <AlertTriangle size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold tracking-tight text-white">Performance Anomaly & Outlier Detector</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Statistical latency diagnostics (outliers defined by $Z$-score &gt; 3.0 relative to endpoint average)</p>
                    </div>
                </div>
            </div>

            {/* Statistics Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><ShieldAlert size={12} className="text-rose-400" /> Outliers Detected</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-rose-400 font-mono">{anomalies.totalOutliers.toLocaleString()}</span>
                        <span className="text-xs text-slate-400">requests</span>
                    </div>
                </div>
                <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><Zap size={12} className="text-indigo-400" /> Outlier Rate</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-indigo-300 font-mono">{anomalies.outlierRate.toFixed(3)}%</span>
                        <span className="text-xs text-slate-400">of session</span>
                    </div>
                </div>
                <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><Clock size={12} className="text-cyan-400" /> Session Baseline</span>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-200 font-mono">Mean: {anomalies.overallMean.toFixed(1)}ms</span>
                        <span className="text-[11px] text-slate-400 font-mono">StdDev: {anomalies.overallStdDev.toFixed(1)}ms</span>
                    </div>
                </div>
                <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><Cpu size={12} className="text-amber-400" /> Most Impacted Route</span>
                    <div className="text-xs text-slate-200 font-mono truncate font-semibold" title={worstEndpoint}>
                        {worstEndpoint}
                    </div>
                </div>
            </div>

            {/* Charts & Diagnostics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Latency Distribution */}
                <div className="lg:col-span-7 bg-slate-950/20 border border-slate-900 p-5 rounded-xl flex flex-col gap-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Latency Bracket Distribution</h4>
                    <div className="h-[220px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={anomalies.distributionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                <XAxis dataKey="range" stroke="#475569" fontSize={10} tickLine={false} />
                                <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }} />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {anomalies.distributionData.map((_, index) => {
                                        // Dynamic colors: faster is cyan/indigo, slower is amber/rose
                                        const colors = ['#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#f59e0b', '#ef4444'];
                                        return <Cell key={`cell-${index}`} fill={colors[index] || '#6366f1'} fillOpacity={0.8} stroke={colors[index]} strokeWidth={1} />;
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Outlier Correlation Insights */}
                <div className="lg:col-span-5 bg-slate-950/20 border border-slate-900 p-5 rounded-xl flex flex-col gap-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Anomaly Correlation Insights</h4>
                    
                    {outliersList.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic py-8">
                            No outliers detected to draw correlation patterns.
                        </div>
                    ) : (
                        <div className="space-y-4 flex-1 flex flex-col justify-around">
                            {/* IP Correlation */}
                            <div>
                                <div className="flex justify-between text-xs mb-1 font-semibold">
                                    <span className="text-slate-400">Top Correlated IP Address</span>
                                    <span className="text-rose-400 font-mono font-bold">
                                        {anomalies.ipCorrelation[0]?.percentage.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="text-[11px] text-slate-200 font-mono mb-1.5 truncate">
                                    {anomalies.ipCorrelation[0]?.value} ({anomalies.ipCorrelation[0]?.count} cases)
                                </div>
                                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-850">
                                    <div 
                                        className="h-full bg-gradient-to-r from-indigo-500 to-rose-500 rounded-full"
                                        style={{ width: `${anomalies.ipCorrelation[0]?.percentage || 0}%` }}
                                    />
                                </div>
                            </div>

                            {/* Method Correlation */}
                            <div>
                                <div className="flex justify-between text-xs mb-1 font-semibold">
                                    <span className="text-slate-400">Top Correlated HTTP Method</span>
                                    <span className="text-indigo-400 font-mono font-bold">
                                        {anomalies.methodCorrelation[0]?.percentage.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="text-[11px] text-slate-200 font-mono mb-1.5 uppercase">
                                    {anomalies.methodCorrelation[0]?.value} ({anomalies.methodCorrelation[0]?.count} cases)
                                </div>
                                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-850">
                                    <div 
                                        className="h-full bg-indigo-500 rounded-full"
                                        style={{ width: `${anomalies.methodCorrelation[0]?.percentage || 0}%` }}
                                    />
                                </div>
                            </div>

                            {/* Status Code Correlation */}
                            <div>
                                <div className="flex justify-between text-xs mb-1 font-semibold">
                                    <span className="text-slate-400">Top Correlated Status Code</span>
                                    <span className="text-amber-400 font-mono font-bold">
                                        {anomalies.statusCorrelation[0]?.percentage.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="text-[11px] text-slate-200 font-mono mb-1.5">
                                    HTTP {anomalies.statusCorrelation[0]?.value} ({anomalies.statusCorrelation[0]?.count} cases)
                                </div>
                                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-850">
                                    <div 
                                        className="h-full bg-amber-500 rounded-full"
                                        style={{ width: `${anomalies.statusCorrelation[0]?.percentage || 0}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Severe Outliers Table */}
            <div className="bg-slate-950/20 border border-slate-900 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-900 flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detailed Latency Anomalies List</h4>
                    <span className="text-[10px] bg-slate-900 border border-slate-850 px-2 py-0.5 rounded text-slate-400 font-mono">
                        Page {currentPage} of {totalPages || 1} ({outliersList.length} total)
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-400 font-mono whitespace-nowrap">
                        <thead className="text-[10px] text-slate-450 uppercase bg-slate-950/60 border-b border-slate-900 font-sans font-bold tracking-wider">
                            <tr>
                                {renderSortableHeader('Timestamp', 'timestamp')}
                                <th className="px-4 py-3">Method</th>
                                <th className="px-4 py-3">Endpoint</th>
                                {renderSortableHeader('Latency', 'timeTaken')}
                                {renderSortableHeader('Z-Score', 'zScore')}
                                <th className="px-4 py-3">Client IP (Right-click for lookup)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((row, i) => {
                                const z = row.zScore;
                                let badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                                if (z > 5) badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/30 font-bold';
                                else if (z > 4) badgeColor = 'bg-orange-500/10 text-orange-400 border-orange-500/20';

                                return (
                                    <tr key={i} className="border-b border-slate-900/40 hover:bg-slate-900/30 transition-colors">
                                        <td className="px-4 py-2.5 text-[11px] text-slate-400">
                                            {row.timestamp.toISOString().replace('T', ' ').substring(0, 19)}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-800 text-indigo-300">
                                                {row.method || 'GET'}
                                            </span>
                                        </td>
                                        <td 
                                            className="px-4 py-2.5 max-w-[280px] truncate text-slate-350 hover:text-white cursor-pointer transition-colors"
                                            title="Click to filter by endpoint"
                                            onClick={() => onToggleEndpoint(row.uriStem)}
                                        >
                                            {row.uriStem}
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-200 font-bold">
                                            {row.timeTaken.toFixed(0)}ms
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold font-mono ${badgeColor}`}>
                                                Z: {z.toFixed(2)}
                                            </span>
                                        </td>
                                        <td 
                                            className="px-4 py-2.5 text-indigo-300 cursor-context-menu select-all hover:text-indigo-200"
                                            onContextMenu={(e) => handleIpRightClick(e, row.clientIp)}
                                            title="Right-click for IP lookup tools"
                                        >
                                            {row.clientIp}
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-10 text-slate-500 italic font-sans">
                                        No performance anomalies detected in current active logs dataset.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="border-t border-slate-900 px-4 py-2.5 flex items-center justify-between bg-slate-950/40">
                        <span className="text-[10px] text-slate-500">
                            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, outliersList.length)} of {outliersList.length} anomalies
                        </span>
                        <div className="flex gap-2.5">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-350 hover:bg-slate-850 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-350 hover:bg-slate-850 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Context menu for IP address */}
            {contextMenu && (
                <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
                    <ContextMenuItem icon={<Filter size={12} />} onClick={() => { onToggleIp(contextMenu.ip); setContextMenu(null); }}>Filter by IP</ContextMenuItem>
                    <ContextMenuItem icon={<Globe size={12} />} onClick={() => { onLookupIp(contextMenu.ip); setContextMenu(null); }}>Lookup IP Intelligence</ContextMenuItem>
                    <ContextMenuItem icon={<ExternalLink size={12} />} onClick={() => { window.open(`https://whois.domaintools.com/${contextMenu.ip}`, '_blank'); setContextMenu(null); }}>Whois Lookup</ContextMenuItem>
                    <ContextMenuItem icon={<ShieldAlert size={12} />} onClick={() => { window.open(`https://www.abuseipdb.com/check/${contextMenu.ip}`, '_blank'); setContextMenu(null); }}>Search AbuseIPDB</ContextMenuItem>
                    <ContextMenuItem icon={<Copy size={12} />} onClick={() => { navigator.clipboard.writeText(contextMenu.ip); setContextMenu(null); }}>Copy IP Address</ContextMenuItem>
                </ContextMenu>
            )}
        </div>
    );
};

export default LatencyOutliers;
