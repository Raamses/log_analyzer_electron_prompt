import { useState, useMemo, Fragment } from 'react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { Filter, Globe, ExternalLink, ShieldAlert, Copy, Maximize2, Minimize2, Search, Download, ChevronLeft, ChevronRight, ArrowUpDown, Clock, Users } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { classifyUserAgent } from '../utils/parser';

interface TrafficSegmentationProps {
    analytics: {
        allEndpoints: { uri: string; totalCalls: number; errorCount: number; errorRate: number; avgLatency: number; p95Latency: number; p99Latency: number }[];
        topEndpoints: { uri: string; totalCalls: number; errorCount: number; errorRate: number; avgLatency: number; p95Latency: number; p99Latency: number }[];
        allIps: { ip: string; totalCalls: number; errorCount: number; errorRate: number }[];
        topIps: [string, number][];
        searchStats: {
            topHotelCodes: [string, number][];
            topCompositions: [string, number][];
            stayCategoryStats: { category: string; totalCalls: number; errorCount: number; errorRate: number; avgLatency: number; p95Latency: number }[];
            occupancyStats: { profile: string; totalCalls: number; errorCount: number; errorRate: number; avgLatency: number; p95Latency: number }[];
            correlationMatrix: { stayCategory: string; occupancyProfile: string; totalCalls: number; errorCount: number; errorRate: number; avgLatency: number; p95Latency: number }[];
            avgStayDuration: number;
            familySearchShare: number;
        };
        deviceStats: {
            categories: { desktop: number; mobile: number; crawler: number; scraper: number; unknown: number };
            topBots: { userAgent: string; count: number; errorRate: number; avgLatency: number }[];
        };
    };
    activeIp: string | null;
    activeEndpoint: string | null;
    activeHotelCode: string | null;
    activeComposition: string | null;
    activeDeviceCategory: string | null;
    activeStayCategory: string | null;
    activeOccupancyProfile: string | null;
    onToggleIp: (ip: string) => void;
    onToggleEndpoint: (endpoint: string) => void;
    onToggleHotelCode: (code: string) => void;
    onToggleComposition: (comp: string) => void;
    onToggleDeviceCategory: (category: string) => void;
    onToggleStayCategory: (category: string) => void;
    onToggleOccupancyProfile: (profile: string) => void;
    onLookupIp: (ip: string) => void;
}

const getFriendlyBotName = (ua: string): string => {
    if (!ua || ua === '-') return 'Unknown Client';
    const lower = ua.toLowerCase();
    
    if (lower.includes('googlebot')) return 'Googlebot';
    if (lower.includes('bingbot')) return 'Bingbot';
    if (lower.includes('yandexbot')) return 'Yandexbot';
    if (lower.includes('baiduspider')) return 'Baidu Spider';
    if (lower.includes('duckduckbot')) return 'DuckDuckBot';
    if (lower.includes('facebot') || lower.includes('facebookexternalhit')) return 'Facebook Bot';
    if (lower.includes('slurp')) return 'Yahoo! Slurp';
    if (lower.includes('ia_archiver')) return 'Alexa Crawler';
    if (lower.includes('scrapy')) return 'Scrapy Scraper';
    if (lower.includes('playwright')) return 'Playwright Automation';
    if (lower.includes('puppeteer')) return 'Puppeteer Automation';
    if (lower.includes('python')) return 'Python Script';
    if (lower.includes('curl')) return 'cURL CLI';
    if (lower.includes('wget')) return 'Wget CLI';
    if (lower.includes('go-http-client')) return 'Go HTTP Client';
    if (lower.includes('postman')) return 'Postman Client';
    if (lower.includes('axios')) return 'Axios Client';
    if (lower.includes('node-fetch')) return 'Node Fetch';
    if (lower.includes('httpclient')) return 'HTTP Client Script';
    
    // Fallback: extract the first token or return a clean truncated string
    const match = ua.match(/^([^/\s]+)/);
    if (match && match[1] && match[1] !== 'Mozilla') {
        return match[1];
    }
    
    return ua.length > 30 ? ua.substring(0, 27) + '...' : ua;
};

const getDeviceColor = (category: string): string => {
    switch (category) {
        case 'desktop': return '#6366f1'; // Indigo 500
        case 'mobile': return '#a855f7'; // Purple 500
        case 'crawler': return '#06b6d4'; // Cyan 500
        case 'scraper': return '#f43f5e'; // Rose 500
        default: return '#64748b'; // Slate 500
    }
};

const getDeviceGradientId = (category: string): string => {
    switch (category) {
        case 'desktop': return 'grad-desktop';
        case 'mobile': return 'grad-mobile';
        case 'crawler': return 'grad-crawler';
        case 'scraper': return 'grad-scraper';
        default: return 'grad-unknown';
    }
};

const getHeatmapCellStyles = (p95: number, calls: number, isSelected: boolean) => {
    if (calls === 0) {
        return {
            bg: 'bg-slate-900/10 text-slate-600 border-slate-950/20',
            label: 'No Data'
        };
    }
    if (calls < 5) {
        return {
            bg: isSelected 
                ? 'bg-slate-800 border-slate-400 text-slate-300 font-bold' 
                : 'bg-slate-900/60 text-slate-400 border-slate-800/40 hover:bg-slate-800/80',
            label: 'Low Vol'
        };
    }
    if (p95 < 800) {
        return {
            bg: isSelected
                ? 'bg-emerald-950 border-emerald-400 text-emerald-100 shadow-lg shadow-emerald-500/10 font-bold'
                : 'bg-emerald-950/50 hover:bg-emerald-950/80 border-emerald-900/30 text-emerald-400',
            label: `${p95.toFixed(0)}ms`
        };
    }
    if (p95 <= 1500) {
        return {
            bg: isSelected
                ? 'bg-amber-950 border-amber-400 text-amber-100 shadow-lg shadow-amber-500/10 font-bold'
                : 'bg-amber-950/50 hover:bg-amber-950/80 border-amber-900/30 text-amber-400',
            label: `${p95.toFixed(0)}ms`
        };
    }
    return {
        bg: isSelected
            ? 'bg-rose-950 border-rose-400 text-rose-100 shadow-lg shadow-rose-500/10 font-bold'
            : 'bg-rose-950/50 hover:bg-rose-950/80 border-rose-900/30 text-rose-400',
        label: `${p95.toFixed(0)}ms`
    };
};

const TrafficSegmentation = ({
    analytics,
    activeIp,
    activeEndpoint,
    activeHotelCode,
    activeComposition,
    activeDeviceCategory,
    activeStayCategory,
    activeOccupancyProfile,
    onToggleIp,
    onToggleEndpoint,
    onToggleHotelCode,
    onToggleComposition,
    onToggleDeviceCategory,
    onToggleStayCategory,
    onToggleOccupancyProfile,
    onLookupIp,
}: TrafficSegmentationProps) => {
    const [activeTab, setActiveTab] = useState<'endpoints' | 'ips' | 'search' | 'clients'>('endpoints');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ip: string } | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);

    const handleCellClick = (cat: string, prof: string) => {
        const isSelected = activeStayCategory === cat && activeOccupancyProfile === prof;
        if (isSelected) {
            if (activeStayCategory) onToggleStayCategory(cat);
            if (activeOccupancyProfile) onToggleOccupancyProfile(prof);
        } else {
            if (activeStayCategory !== cat) onToggleStayCategory(cat);
            if (activeOccupancyProfile !== prof) onToggleOccupancyProfile(prof);
        }
    };

    const deviceData = useMemo(() => {
        if (!analytics.deviceStats || !analytics.deviceStats.categories) return [];
        const cats = analytics.deviceStats.categories;
        const data = [
            { name: 'Desktop', value: cats.desktop, key: 'desktop' },
            { name: 'Mobile', value: cats.mobile, key: 'mobile' },
            { name: 'Crawlers', value: cats.crawler, key: 'crawler' },
            { name: 'Scrapers', value: cats.scraper, key: 'scraper' },
            { name: 'Unknown', value: cats.unknown, key: 'unknown' },
        ];
        return data.filter(d => d.value > 0);
    }, [analytics]);

    const totalDeviceRequests = useMemo(() => {
        return deviceData.reduce((sum, item) => sum + item.value, 0);
    }, [deviceData]);

    // Expanded View State
    const [searchTerm, setSearchTerm] = useState('');
    const [sortCol, setSortCol] = useState('');
    const [sortAsc, setSortAsc] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    const handleIpRightClick = (e: React.MouseEvent<HTMLTableCellElement>, ip: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            ip
        });
    };

    const renderCompactTable = (
        headers: string[],
        data: (string | number)[][],
        selectedValue: string | null,
        onClickRow: (value: string) => void,
        ipContext?: boolean,
        maxHeightClass?: string
    ) => (
        <div className={`overflow-x-auto rounded-xl border border-slate-900 bg-slate-950/20 ${maxHeightClass || ''}`}>
            <table className="w-full text-xs text-left text-slate-400 font-mono whitespace-nowrap">
                <thead className="text-[10px] text-slate-400 uppercase bg-slate-950 border-b border-slate-900 font-sans font-bold tracking-wider sticky top-0 z-10">
                    <tr>{headers.map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
                </thead>
                <tbody>
                    {data.map((row, i) => {
                        const rowValue = row[0] as string;
                        const isSelected = selectedValue === rowValue;
                        return (
                            <tr
                                key={i}
                                onClick={() => onClickRow(rowValue)}
                                className={`border-b border-slate-900/50 hover:bg-slate-900/40 cursor-pointer transition-colors ${
                                    isSelected ? 'bg-indigo-500/10 text-indigo-200' : ''
                                }`}
                            >
                                {row.map((cell, j) => (
                                    <td
                                        key={j}
                                        className={`px-4 py-3 max-w-[200px] truncate ${
                                            isSelected && j === 0
                                                ? 'border-l-4 border-indigo-500 pl-3 text-indigo-400 font-semibold'
                                                : ''
                                        }`}
                                        onContextMenu={ipContext && j === 0 ? (e) => handleIpRightClick(e, cell as string) : undefined}
                                        title={ipContext && j === 0 ? 'Right-click for IP tools' : String(cell)}
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    // --- Expanded View Logic ---
    const handleSort = (col: string) => {
        if (sortCol === col) {
            setSortAsc(!sortAsc);
        } else {
            setSortCol(col);
            setSortAsc(false); // default to descending for metrics
        }
        setCurrentPage(1);
    };

    const getExpandedData = () => {
        let data: any[] = [];
        if (activeTab === 'endpoints') {
            data = [...analytics.allEndpoints];
            if (searchTerm) {
                data = data.filter(d => d.uri.toLowerCase().includes(searchTerm.toLowerCase()));
            }
            if (sortCol) {
                data.sort((a, b) => {
                    const valA = a[sortCol as keyof typeof a];
                    const valB = b[sortCol as keyof typeof b];
                    if (typeof valA === 'string' && typeof valB === 'string') {
                        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    }
                    return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
                });
            }
        } else if (activeTab === 'ips') {
            data = [...analytics.allIps];
            if (searchTerm) {
                data = data.filter(d => d.ip.includes(searchTerm));
            }
            if (sortCol) {
                data.sort((a, b) => {
                    const valA = a[sortCol as keyof typeof a];
                    const valB = b[sortCol as keyof typeof b];
                    if (typeof valA === 'string' && typeof valB === 'string') {
                        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    }
                    return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
                });
            }
        } else if (activeTab === 'clients') {
            data = [...(analytics.deviceStats?.topBots || [])];
            if (searchTerm) {
                data = data.filter(d => d.userAgent.toLowerCase().includes(searchTerm.toLowerCase()));
            }
            if (sortCol) {
                data.sort((a, b) => {
                    const valA = a[sortCol as keyof typeof a];
                    const valB = b[sortCol as keyof typeof b];
                    if (typeof valA === 'string' && typeof valB === 'string') {
                        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    }
                    return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
                });
            }
        }
        return data;
    };

    const expandedData = useMemo(() => getExpandedData(), [analytics, activeTab, searchTerm, sortCol, sortAsc]);
    const totalPages = Math.ceil(expandedData.length / pageSize);
    const paginatedData = expandedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const exportCsv = () => {
        const rows = [];
        if (activeTab === 'endpoints') {
            rows.push(['Endpoint', 'Total Calls', 'Error Count', 'Error Rate (%)', 'Avg Latency (ms)', 'P95 Latency (ms)', 'P99 Latency (ms)']);
            expandedData.forEach((d: any) => {
                rows.push([d.uri, d.totalCalls, d.errorCount, d.errorRate.toFixed(2), d.avgLatency.toFixed(1), d.p95Latency.toFixed(1), d.p99Latency.toFixed(1)]);
            });
        } else if (activeTab === 'ips') {
            rows.push(['IP Address', 'Total Calls', 'Error Count', 'Error Rate (%)']);
            expandedData.forEach((d: any) => {
                rows.push([d.ip, d.totalCalls, d.errorCount, d.errorRate.toFixed(2)]);
            });
        } else if (activeTab === 'search') {
            rows.push(['Entity Type', 'Value', 'Request Count']);
            analytics.searchStats.topHotelCodes.forEach(([code, count]) => {
                rows.push(['Hotel Code', code, count]);
            });
            analytics.searchStats.topCompositions.forEach(([comp, count]) => {
                rows.push(['Composition', comp, count]);
            });
        } else if (activeTab === 'clients') {
            rows.push(['User Agent', 'Category', 'Total Requests', 'Error Rate (%)', 'Avg Latency (ms)']);
            expandedData.forEach((d: any) => {
                rows.push([d.userAgent, classifyUserAgent(d.userAgent), d.count, d.errorRate.toFixed(2), d.avgLatency.toFixed(1)]);
            });
        }
        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `traffic_segmentation_${activeTab}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderSortableHeader = (label: string, col: string) => (
        <th className="px-4 py-3 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort(col)}>
            <div className="flex items-center gap-1">
                {label}
                <ArrowUpDown size={12} className={sortCol === col ? (sortAsc ? 'text-indigo-400 rotate-180' : 'text-indigo-400') : 'text-slate-600'} />
            </div>
        </th>
    );

    const renderMaximizedView = () => (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col animate-fade-in p-4 md:p-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        Traffic Segmentation Drill-Down
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-xs font-mono border border-indigo-500/30">
                            {expandedData.length.toLocaleString()} records
                        </span>
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">Deep dive into all routes, latencies, and traffic sources.</p>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors text-sm font-semibold">
                        <Download size={16} /> Export CSV
                    </button>
                    <button onClick={() => setIsMaximized(false)} className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors">
                        <Minimize2 size={20} />
                    </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div className="flex p-1 rounded-lg bg-slate-900/80 border border-slate-800 w-full md:w-auto flex-wrap gap-1">
                    {(['endpoints', 'ips', 'search', 'clients'] as const).map(tab => {
                        let label = '';
                        if (tab === 'endpoints') label = 'Endpoints';
                        else if (tab === 'ips') label = 'IP Addresses';
                        else if (tab === 'search') label = 'Search Stats';
                        else if (tab === 'clients') label = 'Clients & Bots';
                        return (
                            <button
                                key={tab}
                                onClick={() => { setActiveTab(tab); setCurrentPage(1); setSearchTerm(''); setSortCol(''); }}
                                className={`px-4 sm:px-6 py-2 rounded-md text-xs sm:text-sm font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                    activeTab === tab ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                        type="text"
                        placeholder={`Search ${activeTab}...`}
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col bg-slate-900/50 border border-slate-800 rounded-xl">
                {activeTab === 'search' ? (
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* KPI Cards Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="glass-panel p-5 rounded-xl flex items-center justify-between border border-slate-900 bg-slate-950/20">
                                <div>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Average Stay Duration</span>
                                    <span className="text-3xl font-extrabold text-white mt-1.5 block font-sans">
                                        {analytics.searchStats.avgStayDuration ? `${analytics.searchStats.avgStayDuration.toFixed(1)} nights` : 'N/A'}
                                    </span>
                                    <span className="text-[10px] text-slate-500 mt-1 block font-sans">Average length of stay requested in searches</span>
                                </div>
                                <div className="p-3.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                                    <Clock size={24} />
                                </div>
                            </div>
                            <div className="glass-panel p-5 rounded-xl flex items-center justify-between border border-slate-900 bg-slate-950/20">
                                <div>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Family Search Share</span>
                                    <span className="text-3xl font-extrabold text-white mt-1.5 block font-sans">
                                        {analytics.searchStats.familySearchShare ? `${analytics.searchStats.familySearchShare.toFixed(1)}%` : '0.0%'}
                                    </span>
                                    <span className="text-[10px] text-slate-500 mt-1 block font-sans">Percentage of queries for families or kids</span>
                                </div>
                                <div className="p-3.5 bg-purple-500/10 rounded-xl text-purple-400">
                                    <Users size={24} />
                                </div>
                            </div>
                        </div>

                        {/* Latency & Matrix Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Latency Profile Chart */}
                            <div className="glass-panel p-5 rounded-xl border border-slate-900 bg-slate-950/20 flex flex-col h-[340px]">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 font-sans">Latency Profile by Stay Category</h4>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={analytics.searchStats.stayCategoryStats} margin={{ top: 10, right: -5, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                                            <XAxis dataKey="category" stroke="#64748b" fontSize={11} tickLine={false} />
                                            <YAxis yAxisId="left" stroke="#818cf8" fontSize={11} tickLine={false} label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', style: { fill: '#818cf8', fontSize: 11 } }} />
                                            <YAxis yAxisId="right" orientation="right" stroke="#34d399" fontSize={11} tickLine={false} label={{ value: 'Volume', angle: 90, position: 'insideRight', style: { fill: '#34d399', fontSize: 11 } }} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                                                labelClassName="text-slate-400 text-xs font-bold font-sans"
                                                itemStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
                                            />
                                            <Legend verticalAlign="top" height={28} iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                                            <Bar yAxisId="right" dataKey="totalCalls" name="Volume" fill="#10b981" fillOpacity={0.15} radius={[4, 4, 0, 0]} barSize={40} />
                                            <Line yAxisId="left" type="monotone" dataKey="p95Latency" name="P95 Latency" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                            <Line yAxisId="left" type="monotone" dataKey="avgLatency" name="Avg Latency" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Correlation Matrix Heatmap */}
                            <div className="glass-panel p-5 rounded-xl border border-slate-900 bg-slate-950/20 flex flex-col h-[340px]">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 font-sans">Occupancy & Stay Duration Correlation Matrix (Heatmap)</h4>
                                <div className="flex-grow flex flex-col justify-between">
                                    <div className="grid grid-cols-5 gap-2.5 text-center text-[10px] text-slate-500 font-bold mb-1.5">
                                        <div></div>
                                        {[
                                            { id: 'Short', label: 'Short', desc: '1-3 nights' },
                                            { id: 'Standard', label: 'Standard', desc: '4-7 nights' },
                                            { id: 'Long', label: 'Long', desc: '8-14 nights' },
                                            { id: 'Extended', label: 'Extended', desc: '15+ nights' }
                                        ].map(cat => (
                                            <div key={cat.id} className="flex flex-col justify-center py-1">
                                                <span className="text-slate-300 font-sans">{cat.label}</span>
                                                <span className="text-[8px] text-slate-500 font-mono font-medium">{cat.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex-1 grid grid-rows-4 gap-2.5">
                                        {[
                                            { id: 'Single', label: 'Single', desc: '1 Adult' },
                                            { id: 'Double', label: 'Double', desc: '2 Adults' },
                                            { id: 'Family', label: 'Family', desc: 'Family/Kids' },
                                            { id: 'Other', label: 'Other', desc: 'Other' }
                                        ].map(prof => (
                                            <div key={prof.id} className="grid grid-cols-5 gap-2.5 items-center">
                                                <div className="text-right pr-2.5 flex flex-col justify-center leading-tight">
                                                    <span className="text-[10px] font-bold text-slate-300 font-sans">{prof.label}</span>
                                                    <span className="text-[8px] text-slate-500 font-mono font-medium">{prof.desc}</span>
                                                </div>
                                                {[ 'Short', 'Standard', 'Long', 'Extended' ].map(catId => {
                                                    const cell = analytics.searchStats.correlationMatrix.find(
                                                        item => item.stayCategory === catId && item.occupancyProfile === prof.id
                                                    ) || { totalCalls: 0, errorCount: 0, errorRate: 0, avgLatency: 0, p95Latency: 0 };
                                                    
                                                    const isSelected = activeStayCategory === catId && activeOccupancyProfile === prof.id;
                                                    const styles = getHeatmapCellStyles(cell.p95Latency, cell.totalCalls, isSelected);
                                                    
                                                    return (
                                                        <button
                                                            key={catId}
                                                            onClick={() => handleCellClick(catId, prof.id)}
                                                            className={`h-12 rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-all duration-200 focus:outline-none ${styles.bg}`}
                                                        >
                                                            <span className="text-xs font-mono font-bold">{styles.label}</span>
                                                            <span className="text-[8px] font-mono opacity-50">{cell.totalCalls} searches</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Search Entities Lists */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                            <div className="flex flex-col bg-slate-950/40 border border-slate-900 rounded-xl overflow-hidden min-h-[300px]">
                                <div className="px-4 py-3 border-b border-slate-900 bg-slate-950 flex justify-between items-center">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">Hotel Codes</h4>
                                    <span className="text-[10px] text-slate-500 font-mono">{analytics.searchStats.topHotelCodes.length} items</span>
                                </div>
                                <div className="flex-1 overflow-auto font-mono text-xs max-h-[350px]">
                                    {renderCompactTable(
                                        ['Hotel Code', 'Count'],
                                        analytics.searchStats.topHotelCodes.filter(([code]) => code.toLowerCase().includes(searchTerm.toLowerCase())),
                                        activeHotelCode,
                                        (val) => { onToggleHotelCode(val); setIsMaximized(false); },
                                        false,
                                        'h-full'
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col bg-slate-950/40 border border-slate-900 rounded-xl overflow-hidden min-h-[300px]">
                                <div className="px-4 py-3 border-b border-slate-900 bg-slate-950 flex justify-between items-center">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">Compositions</h4>
                                    <span className="text-[10px] text-slate-500 font-mono">{analytics.searchStats.topCompositions.length} items</span>
                                </div>
                                <div className="flex-1 overflow-auto font-mono text-xs max-h-[350px]">
                                    {renderCompactTable(
                                        ['Composition', 'Count'],
                                        analytics.searchStats.topCompositions.filter(([comp]) => comp.toLowerCase().includes(searchTerm.toLowerCase())),
                                        activeComposition,
                                        (val) => { onToggleComposition(val); setIsMaximized(false); },
                                        false,
                                        'h-full'
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto flex-1 font-mono text-xs">
                        <table className="w-full text-sm text-left text-slate-300 font-mono whitespace-nowrap">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-900/80 border-b border-slate-800 sticky top-0 font-sans font-bold tracking-wider z-10">
                                <tr>
                                    {activeTab === 'endpoints' && (
                                        <>
                                            {renderSortableHeader('Endpoint', 'uri')}
                                            {renderSortableHeader('Calls', 'totalCalls')}
                                            {renderSortableHeader('Error Rate', 'errorRate')}
                                            {renderSortableHeader('Avg Lat', 'avgLatency')}
                                            {renderSortableHeader('P95 Lat', 'p95Latency')}
                                            {renderSortableHeader('P99 Lat', 'p99Latency')}
                                        </>
                                    )}
                                    {activeTab === 'ips' && (
                                        <>
                                            {renderSortableHeader('IP Address', 'ip')}
                                            {renderSortableHeader('Calls', 'totalCalls')}
                                            {renderSortableHeader('Errors', 'errorCount')}
                                            {renderSortableHeader('Error Rate', 'errorRate')}
                                        </>
                                    )}
                                    {activeTab === 'clients' && (
                                        <>
                                            {renderSortableHeader('Friendly Name', 'userAgent')}
                                            <th className="px-4 py-3">Category</th>
                                            {renderSortableHeader('Calls', 'count')}
                                            {renderSortableHeader('Avg Latency', 'avgLatency')}
                                            {renderSortableHeader('Error Rate', 'errorRate')}
                                            <th className="px-4 py-3">Full User Agent</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedData.map((row: any, i: number) => (
                                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors">
                                        {activeTab === 'endpoints' && (
                                            <>
                                                <td className="px-4 py-3 max-w-[400px] truncate" title={row.uri}>{row.uri}</td>
                                                <td className="px-4 py-3">{row.totalCalls.toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    <span className={row.errorRate > 5 ? 'text-rose-400 font-bold' : ''}>{row.errorRate.toFixed(2)}%</span>
                                                </td>
                                                <td className="px-4 py-3">{row.avgLatency.toFixed(1)}ms</td>
                                                <td className="px-4 py-3 text-amber-200/80">{row.p95Latency.toFixed(1)}ms</td>
                                                <td className="px-4 py-3 text-rose-300/80 font-semibold">{row.p99Latency.toFixed(1)}ms</td>
                                            </>
                                        )}
                                        {activeTab === 'ips' && (
                                            <>
                                                <td 
                                                    className="px-4 py-3 cursor-context-menu" 
                                                    onContextMenu={(e) => handleIpRightClick(e, row.ip)}
                                                >
                                                    {row.ip}
                                                </td>
                                                <td className="px-4 py-3">{row.totalCalls.toLocaleString()}</td>
                                                <td className="px-4 py-3">{row.errorCount.toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    <span className={row.errorRate > 5 ? 'text-rose-400 font-bold' : ''}>{row.errorRate.toFixed(2)}%</span>
                                                </td>
                                            </>
                                        )}
                                        {activeTab === 'clients' && (() => {
                                            const category = classifyUserAgent(row.userAgent);
                                            const isCrawler = category === 'crawler';
                                            return (
                                                <>
                                                    <td className="px-4 py-3 font-semibold text-slate-200 cursor-pointer" onClick={() => { onToggleDeviceCategory(category); setIsMaximized(false); }}>
                                                        {getFriendlyBotName(row.userAgent)}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold border cursor-pointer ${
                                                            isCrawler 
                                                                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
                                                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                        }`} onClick={() => { onToggleDeviceCategory(category); setIsMaximized(false); }}>
                                                            {isCrawler ? 'Crawler' : 'Scraper'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-bold text-slate-300">{row.count.toLocaleString()}</td>
                                                    <td className="px-4 py-3">{row.avgLatency.toFixed(1)}ms</td>
                                                    <td className="px-4 py-3">
                                                        <span className={row.errorRate > 5 ? 'text-rose-400 font-bold' : ''}>{row.errorRate.toFixed(2)}%</span>
                                                    </td>
                                                    <td className="px-4 py-3 max-w-[300px] truncate text-slate-500 select-all font-mono text-xs" title={row.userAgent}>
                                                        {row.userAgent}
                                                    </td>
                                                </>
                                            );
                                        })()}
                                    </tr>
                                ))}
                                {paginatedData.length === 0 && (
                                    <tr>
                                        <td colSpan={activeTab === 'clients' ? 6 : (activeTab === 'endpoints' ? 6 : 4)} className="text-center py-12 text-slate-500 font-sans">No results found matching your search.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                
                {totalPages > 1 && (
                    <div className="border-t border-slate-800 p-4 flex items-center justify-between bg-slate-900/80">
                        <span className="text-sm text-slate-400">
                            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, expandedData.length)} of {expandedData.length}
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            {contextMenu && (
                <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
                    <ContextMenuItem icon={<Filter size={12} />} onClick={() => { onToggleIp(contextMenu.ip); setContextMenu(null); setIsMaximized(false); }}>Filter by IP</ContextMenuItem>
                    <ContextMenuItem icon={<Globe size={12} />} onClick={() => { onLookupIp(contextMenu.ip); setContextMenu(null); }}>Lookup IP Intelligence</ContextMenuItem>
                    <ContextMenuItem icon={<ExternalLink size={12} />} onClick={() => { window.open(`https://whois.domaintools.com/${contextMenu.ip}`, '_blank'); setContextMenu(null); }}>Whois Lookup</ContextMenuItem>
                    <ContextMenuItem icon={<ShieldAlert size={12} />} onClick={() => { window.open(`https://www.abuseipdb.com/check/${contextMenu.ip}`, '_blank'); setContextMenu(null); }}>Search AbuseIPDB</ContextMenuItem>
                    <ContextMenuItem icon={<Copy size={12} />} onClick={() => { navigator.clipboard.writeText(contextMenu.ip); setContextMenu(null); }}>Copy IP Address</ContextMenuItem>
                </ContextMenu>
            )}
        </div>
    );

    return (
        <>
            {isMaximized && renderMaximizedView()}
            
            <div className="glass-panel p-6 rounded-2xl col-span-1 md:col-span-2 flex flex-col justify-between relative">
                <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold tracking-tight text-white">Traffic Segmentation</h3>
                    <button 
                        onClick={() => setIsMaximized(true)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors tooltip-trigger"
                        title="Maximize to Drill-Down View"
                    >
                        <Maximize2 size={16} />
                    </button>
                </div>
                
                <div className="flex border-b border-slate-800 mb-6 overflow-x-auto whitespace-nowrap scrollbar-none">
                    <button
                        onClick={() => setActiveTab('endpoints')}
                        className={`py-2.5 px-4 font-bold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
                            activeTab === 'endpoints' 
                               ? 'text-indigo-400 border-indigo-500' 
                                : 'text-slate-400 hover:text-slate-200 border-transparent'
                        }`}
                    >
                        Top Endpoints
                    </button>
                    <button
                        onClick={() => setActiveTab('ips')}
                        className={`py-2.5 px-4 font-bold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
                            activeTab === 'ips' 
                                ? 'text-indigo-400 border-indigo-500' 
                                : 'text-slate-400 hover:text-slate-200 border-transparent'
                        }`}
                    >
                        Top Calling IPs
                    </button>
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`py-2.5 px-4 font-bold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
                            activeTab === 'search' 
                                ? 'text-indigo-400 border-indigo-500' 
                                : 'text-slate-400 hover:text-slate-200 border-transparent'
                        }`}
                    >
                        Search Stats
                    </button>
                    <button
                        onClick={() => setActiveTab('clients')}
                        className={`py-2.5 px-4 font-bold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
                            activeTab === 'clients' 
                                ? 'text-indigo-400 border-indigo-500' 
                                : 'text-slate-400 hover:text-slate-200 border-transparent'
                        }`}
                    >
                        Clients & Bots
                    </button>
                </div>
                
                <div className="flex-1">
                    {activeTab === 'endpoints' && renderCompactTable(
                        ['Endpoint', 'Calls', 'Avg Latency', 'P95 Latency', 'P99 Latency'],
                        analytics.topEndpoints.map(e => [e.uri, e.totalCalls.toLocaleString(), `${e.avgLatency.toFixed(1)}ms`, `${e.p95Latency.toFixed(1)}ms`, `${e.p99Latency.toFixed(1)}ms`]),
                        activeEndpoint,
                        onToggleEndpoint
                    )}
                    {activeTab === 'ips' && renderCompactTable(
                        ['IP Address (Right-click for options)', 'Request Count'],
                        analytics.topIps.map(([ip, count]) => [ip, count.toLocaleString()]),
                        activeIp,
                        onToggleIp,
                        true
                    )}
                    {activeTab === 'search' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* KPI Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="glass-panel p-4 rounded-xl flex items-center justify-between border border-slate-900 bg-slate-950/20">
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Average Stay Duration</span>
                                        <span className="text-2xl font-extrabold text-white mt-1 block font-sans">
                                            {analytics.searchStats.avgStayDuration ? `${analytics.searchStats.avgStayDuration.toFixed(1)} nights` : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400">
                                        <Clock size={20} />
                                    </div>
                                </div>
                                <div className="glass-panel p-4 rounded-xl flex items-center justify-between border border-slate-900 bg-slate-950/20">
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Family Search Share</span>
                                        <span className="text-2xl font-extrabold text-white mt-1 block font-sans">
                                            {analytics.searchStats.familySearchShare ? `${analytics.searchStats.familySearchShare.toFixed(1)}%` : '0.0%'}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-purple-500/10 rounded-lg text-purple-400">
                                        <Users size={20} />
                                    </div>
                                </div>
                            </div>

                            {/* Latency & Heatmap Row */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Latency Profile */}
                                <div className="glass-panel p-4 rounded-xl border border-slate-900 bg-slate-950/20 flex flex-col h-[280px]">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-sans">Latency Profile by Stay Category</h4>
                                    <div className="flex-grow w-full min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={analytics.searchStats.stayCategoryStats} margin={{ top: 5, right: -5, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                                                <XAxis dataKey="category" stroke="#64748b" fontSize={9} tickLine={false} />
                                                <YAxis yAxisId="left" stroke="#818cf8" fontSize={9} tickLine={false} />
                                                <YAxis yAxisId="right" orientation="right" stroke="#34d399" fontSize={9} tickLine={false} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                                                    labelClassName="text-slate-400 text-xs font-bold font-sans"
                                                    itemStyle={{ fontSize: '10px', fontFamily: 'monospace' }}
                                                />
                                                <Legend verticalAlign="top" height={20} iconSize={6} wrapperStyle={{ fontSize: '9px' }} />
                                                <Bar yAxisId="right" dataKey="totalCalls" name="Volume" fill="#10b981" fillOpacity={0.15} radius={[3, 3, 0, 0]} barSize={25} />
                                                <Line yAxisId="left" type="monotone" dataKey="p95Latency" name="P95 Lat" stroke="#a855f7" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                                                <Line yAxisId="left" type="monotone" dataKey="avgLatency" name="Avg Lat" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Matrix Heatmap */}
                                <div className="glass-panel p-4 rounded-xl border border-slate-900 bg-slate-950/20 flex flex-col h-[280px]">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 font-sans">Stay & Occupancy Latency Matrix</h4>
                                    <div className="flex-grow flex flex-col justify-between">
                                        <div className="grid grid-cols-5 gap-1.5 text-center text-[9px] text-slate-500 font-bold mb-1">
                                            <div></div>
                                            {[
                                                { id: 'Short', label: 'Short', desc: '1-3n' },
                                                { id: 'Standard', label: 'Std', desc: '4-7n' },
                                                { id: 'Long', label: 'Long', desc: '8-14n' },
                                                { id: 'Extended', label: 'Ext', desc: '15n+' }
                                            ].map(cat => (
                                                <div key={cat.id} className="flex flex-col justify-center">
                                                    <span className="text-slate-300 font-sans">{cat.label}</span>
                                                    <span className="text-[7px] text-slate-500 font-mono font-medium">{cat.desc}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex-grow grid grid-rows-4 gap-1.5">
                                            {[
                                                { id: 'Single', label: 'Single', desc: '1A' },
                                                { id: 'Double', label: 'Double', desc: '2A' },
                                                { id: 'Family', label: 'Family', desc: 'Family' },
                                                { id: 'Other', label: 'Other', desc: 'Other' }
                                            ].map(prof => (
                                                <div key={prof.id} className="grid grid-cols-5 gap-1.5 items-center">
                                                    <div className="text-right pr-1 flex flex-col justify-center leading-tight">
                                                        <span className="text-[9px] font-bold text-slate-300 font-sans">{prof.label}</span>
                                                        <span className="text-[7px] text-slate-500 font-mono font-medium">{prof.desc}</span>
                                                    </div>
                                                    {[ 'Short', 'Standard', 'Long', 'Extended' ].map(catId => {
                                                        const cell = analytics.searchStats.correlationMatrix.find(
                                                            item => item.stayCategory === catId && item.occupancyProfile === prof.id
                                                        ) || { totalCalls: 0, errorCount: 0, errorRate: 0, avgLatency: 0, p95Latency: 0 };
                                                        
                                                        const isSelected = activeStayCategory === catId && activeOccupancyProfile === prof.id;
                                                        const styles = getHeatmapCellStyles(cell.p95Latency, cell.totalCalls, isSelected);
                                                        
                                                        return (
                                                            <button
                                                                key={catId}
                                                                onClick={() => handleCellClick(catId, prof.id)}
                                                                className={`h-9 rounded border flex flex-col items-center justify-center cursor-pointer transition-all duration-200 focus:outline-none ${styles.bg}`}
                                                            >
                                                                <span className="text-[10px] font-mono font-bold leading-none">{styles.label}</span>
                                                                <span className="text-[6px] font-mono opacity-50 mt-0.5">{cell.totalCalls}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tables Row */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-sans">Hotel Codes</h4>
                                    {renderCompactTable(['Hotel Code', 'Count'], analytics.searchStats.topHotelCodes, activeHotelCode, onToggleHotelCode, false, 'max-h-[220px] overflow-y-auto')}
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-sans">Compositions</h4>
                                    {renderCompactTable(['Composition', 'Count'], analytics.searchStats.topCompositions, activeComposition, onToggleComposition, false, 'max-h-[220px] overflow-y-auto')}
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'clients' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                            <svg width="0" height="0" className="absolute">
                                <defs>
                                    <linearGradient id="grad-desktop" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#6366f1" />
                                        <stop offset="100%" stopColor="#2563eb" />
                                    </linearGradient>
                                    <linearGradient id="grad-mobile" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#a855f7" />
                                        <stop offset="100%" stopColor="#db2777" />
                                    </linearGradient>
                                    <linearGradient id="grad-crawler" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#22d3ee" />
                                        <stop offset="100%" stopColor="#0d9488" />
                                    </linearGradient>
                                    <linearGradient id="grad-scraper" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#f43f5e" />
                                        <stop offset="100%" stopColor="#ea580c" />
                                    </linearGradient>
                                    <linearGradient id="grad-unknown" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#94a3b8" />
                                        <stop offset="100%" stopColor="#475569" />
                                    </linearGradient>
                                </defs>
                            </svg>

                            <div className="flex flex-col items-center">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 self-start font-sans">Device Category Share</h4>
                                <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-4">
                                    <div className="w-full sm:w-1/2 flex justify-center relative">
                                        <div className="w-[180px] h-[180px] relative flex items-center justify-center">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={deviceData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={50}
                                                        outerRadius={75}
                                                        paddingAngle={3}
                                                        dataKey="value"
                                                        onClick={(data) => {
                                                            if (data && data.key) {
                                                                onToggleDeviceCategory(data.key);
                                                            }
                                                        }}
                                                        className="cursor-pointer focus:outline-none"
                                                    >
                                                        {deviceData.map((entry) => {
                                                            const isSelected = activeDeviceCategory === entry.key;
                                                            return (
                                                                <Cell
                                                                    key={entry.key}
                                                                    fill={`url(#${getDeviceGradientId(entry.key)})`}
                                                                    stroke={isSelected ? '#ffffff' : '#0f172a'}
                                                                    strokeWidth={isSelected ? 2 : 1}
                                                                    opacity={activeDeviceCategory && !isSelected ? 0.4 : 1}
                                                                    className="transition-all duration-300"
                                                                />
                                                            );
                                                        })}
                                                    </Pie>
                                                    <Tooltip
                                                        content={({ active, payload }) => {
                                                            if (active && payload && payload.length) {
                                                                const data = payload[0].payload;
                                                                const percent = ((data.value / totalDeviceRequests) * 100).toFixed(1);
                                                                return (
                                                                    <div className="glass-panel px-3 py-2 rounded-xl border border-slate-800 text-xs font-mono shadow-xl z-20 font-mono">
                                                                        <div className="font-sans font-bold text-white mb-1">{data.name}</div>
                                                                        <div className="text-slate-400">
                                                                            Requests: <span className="text-indigo-300 font-bold">{data.value.toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="text-slate-400">
                                                                            Share: <span className="text-indigo-300 font-bold">{percent}%</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                                                <span className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">Total</span>
                                                <span className="text-sm font-extrabold text-white tracking-tight">{totalDeviceRequests.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-full sm:w-1/2 flex flex-col gap-2">
                                        {deviceData.map((item) => {
                                            const percent = ((item.value / totalDeviceRequests) * 100).toFixed(1);
                                            const isSelected = activeDeviceCategory === item.key;
                                            const color = getDeviceColor(item.key);
                                            return (
                                                <button
                                                    key={item.key}
                                                    onClick={() => onToggleDeviceCategory(item.key)}
                                                    className={`flex items-center justify-between p-2 rounded-xl border transition-all text-left cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-indigo-500/10 border-indigo-500/35 shadow-lg shadow-indigo-500/5'
                                                            : 'bg-slate-950/40 border-slate-900/60 hover:bg-slate-900/40 hover:border-slate-800'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span 
                                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                            style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}
                                                        />
                                                        <span className="text-xs font-bold text-slate-300 truncate">{item.name}</span>
                                                    </div>
                                                    <div className="text-right pl-2">
                                                        <div className="text-xs font-bold text-slate-200 font-mono">{percent}%</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 flex flex-col">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-sans">Top Crawlers & Scrapers</h4>
                                <div className="flex-1 overflow-x-auto rounded-xl border border-slate-900 bg-slate-950/20 max-h-[220px]">
                                    <table className="w-full text-xs text-left text-slate-400 font-mono whitespace-nowrap">
                                        <thead className="text-[10px] text-slate-400 uppercase bg-slate-950 border-b border-slate-900 font-sans font-bold tracking-wider sticky top-0 z-10">
                                            <tr>
                                                <th className="px-4 py-2.5">Signature</th>
                                                <th className="px-4 py-2.5">Category</th>
                                                <th className="px-4 py-2.5 text-right">Calls</th>
                                                <th className="px-4 py-2.5 text-right">Avg Latency</th>
                                                <th className="px-4 py-2.5 text-right">Error Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analytics.deviceStats.topBots.slice(0, 10).map((bot, i) => {
                                                const category = classifyUserAgent(bot.userAgent);
                                                const isCrawler = category === 'crawler';
                                                const rowSelected = activeDeviceCategory === category;
                                                return (
                                                    <tr
                                                        key={i}
                                                        onClick={() => onToggleDeviceCategory(category)}
                                                        className={`border-b border-slate-900/50 hover:bg-slate-900/40 cursor-pointer transition-colors ${
                                                            rowSelected ? 'bg-indigo-500/10 text-indigo-200' : ''
                                                        }`}
                                                        title={bot.userAgent}
                                                    >
                                                        <td className="px-4 py-2.5 max-w-[150px] truncate font-semibold text-slate-300">
                                                            {getFriendlyBotName(bot.userAgent)}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold border ${
                                                                isCrawler 
                                                                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
                                                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                            }`}>
                                                                {isCrawler ? 'Crawler' : 'Scraper'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-bold text-slate-200">{bot.count.toLocaleString()}</td>
                                                        <td className="px-4 py-2.5 text-right text-slate-400">{bot.avgLatency.toFixed(0)}ms</td>
                                                        <td className="px-4 py-2.5 text-right">
                                                            <span className={bot.errorRate > 5 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                                                                {bot.errorRate.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {analytics.deviceStats.topBots.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-8 text-slate-500 font-sans">No crawlers or scrapers detected in these logs.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {!isMaximized && contextMenu && (
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
        </>
    );
};

export default TrafficSegmentation;
