import { useEffect, useRef } from 'react';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, Brush } from 'recharts';

interface ThroughputChartProps {
    data: { timestamp: number; requests: number; errors: number }[];
    timeRange: [Date | null, Date | null];
    onRangeChange: (range: [Date | null, Date | null]) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="backdrop-blur-md bg-slate-950/95 border border-slate-800/80 p-3.5 rounded-xl shadow-2xl text-xs font-mono space-y-1.5 min-w-[170px]">
                <p className="text-slate-500 font-sans border-b border-slate-900 pb-1 mb-1 font-semibold">
                    {new Date(label).toLocaleString()}
                </p>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-indigo-400 font-sans">Requests:</span>
                    <span className="text-slate-100 font-bold">{payload[0].value.toLocaleString()}</span>
                </div>
                {payload[1] && (
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-red-400 font-sans">Errors:</span>
                        <span className="text-red-400 font-bold">{payload[1].value.toLocaleString()}</span>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

const debounce = <T extends (...args: any[]) => void>(func: T, delay: number) => {
    let timeout: any = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            func(...args);
        }, delay);
    };
};

const ThroughputChart = ({ data, timeRange, onRangeChange }: ThroughputChartProps) => {
    const onRangeChangeRef = useRef(onRangeChange);
    useEffect(() => {
        onRangeChangeRef.current = onRangeChange;
    }, [onRangeChange]);

    const debouncedChange = useRef(
        debounce((start: Date, end: Date) => {
            onRangeChangeRef.current([start, end]);
        }, 150)
    ).current;

    const handleBrushChange = (obj: any) => {
        if (obj && typeof obj.startIndex === 'number' && typeof obj.endIndex === 'number') {
            const startLog = data[obj.startIndex];
            const endLog = data[obj.endIndex];
            if (startLog && endLog) {
                debouncedChange(new Date(startLog.timestamp), new Date(endLog.timestamp));
            }
        }
    };

    return (
        <div className="glass-panel p-6 rounded-2xl h-[400px] flex flex-col justify-between">
            <div>
                <h3 className="text-lg font-bold tracking-tight text-white">Request Throughput</h3>
                <p className="text-xs text-slate-400 mt-1">Request volume vs. error events over time</p>
            </div>
            <ResponsiveContainer width="100%" height="80%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.25)" vertical={false} />
                    <XAxis
                        dataKey="timestamp"
                        tickFormatter={(ts) => new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        stroke="#64748b"
                        tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                    />
                    <YAxis 
                        stroke="#64748b" 
                        tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} 
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                        wrapperStyle={{ 
                            fontSize: '0.85rem', 
                            fontFamily: 'Outfit, sans-serif',
                            color: '#cbd5e1',
                            paddingTop: '8px'
                        }}
                    />
                    <Area 
                        type="monotone" 
                        dataKey="requests" 
                        name="Total Requests" 
                        stroke="#6366f1" 
                        fillOpacity={1} 
                        fill="url(#colorRequests)" 
                        strokeWidth={2} 
                    />
                    <Area 
                        type="monotone" 
                        dataKey="errors" 
                        name="Errors" 
                        stroke="#ef4444" 
                        fillOpacity={1} 
                        fill="url(#colorErrors)" 
                        strokeWidth={2} 
                    />
                    <Brush
                        key={`${timeRange[0]?.getTime() || ''}-${timeRange[1]?.getTime() || ''}`}
                        dataKey="timestamp"
                        height={26}
                        stroke="#4f46e5"
                        fill="rgba(15, 23, 42, 0.8)"
                        tickFormatter={(ts) => new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        onChange={handleBrushChange}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ThroughputChart;
