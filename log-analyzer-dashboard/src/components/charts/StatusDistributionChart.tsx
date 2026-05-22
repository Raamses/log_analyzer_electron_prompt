import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface StatusDistributionChartProps {
    data: { [key: string]: number };
    activeStatusCodes: number[];
    onSliceClick: (statusCode: number) => void;
}

const getStatusGradientId = (statusCodeStr: string) => {
    const code = parseInt(statusCodeStr, 10);
    if (code >= 200 && code < 300) return 'url(#grad-2xx)';
    if (code >= 300 && code < 400) return 'url(#grad-3xx)';
    if (code >= 400 && code < 500) return 'url(#grad-4xx)';
    if (code >= 500 && code < 600) return 'url(#grad-5xx)';
    return 'url(#grad-other)';
};

// Fallback solid hex colors for Tooltip / Legend icons if they require hex values
const getStatusColor = (statusCodeStr: string) => {
    const code = parseInt(statusCodeStr, 10);
    if (code >= 200 && code < 300) return '#10b981';
    if (code >= 300 && code < 400) return '#06b6d4';
    if (code >= 400 && code < 500) return '#f59e0b';
    if (code >= 500 && code < 600) return '#ef4444';
    return '#6366f1';
};

const StatusDistributionChart = ({ data, activeStatusCodes, onSliceClick }: StatusDistributionChartProps) => {
    const chartData = Object.entries(data).map(([name, value]) => ({ 
        name, 
        value,
        color: getStatusColor(name)
    }));

    const handleLegendClick = (payload: any) => {
        const statusCode = parseInt(payload.value, 10);
        if (!isNaN(statusCode)) {
            onSliceClick(statusCode);
        }
    };

    return (
        <div className="glass-panel p-6 rounded-2xl h-[400px] flex flex-col justify-between">
            <div>
                <h3 className="text-lg font-bold tracking-tight text-white">Status Code Distribution</h3>
                <p className="text-xs text-slate-400 mt-1">Breakdown of responses (click status to filter)</p>
            </div>
            <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                    <defs>
                        <linearGradient id="grad-2xx" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                        </linearGradient>
                        <linearGradient id="grad-3xx" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#0891b2" stopOpacity={0.9} />
                        </linearGradient>
                        <linearGradient id="grad-4xx" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#d97706" stopOpacity={0.9} />
                        </linearGradient>
                        <linearGradient id="grad-5xx" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#dc2626" stopOpacity={0.9} />
                        </linearGradient>
                        <linearGradient id="grad-other" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.9} />
                        </linearGradient>
                    </defs>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        fill="#8884d8"
                        paddingAngle={4}
                        dataKey="value"
                    >
                        {chartData.map((entry, index) => {
                            const statusCode = parseInt(entry.name, 10);
                            const isAnySelected = activeStatusCodes.length > 0;
                            const isSelected = activeStatusCodes.includes(statusCode);
                            const opacity = isAnySelected ? (isSelected ? 1.0 : 0.25) : 1.0;

                            return (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={getStatusGradientId(entry.name)}
                                    stroke="rgba(15, 23, 42, 0.8)"
                                    strokeWidth={2}
                                    opacity={opacity}
                                    style={{ cursor: 'pointer', outline: 'none' }}
                                    onClick={() => onSliceClick(statusCode)}
                                />
                            );
                        })}
                    </Pie>
                    <Tooltip
                        contentStyle={{ 
                            backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                            borderColor: 'rgba(51, 65, 85, 0.8)', 
                            borderRadius: '1rem',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
                        }}
                        itemStyle={{ color: '#f1f5f9', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}
                        labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                    />
                    <Legend
                        iconType="circle"
                        onClick={handleLegendClick}
                        wrapperStyle={{ 
                            cursor: 'pointer', 
                            fontSize: '0.85rem', 
                            fontFamily: 'Outfit, sans-serif',
                            color: '#cbd5e1'
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default StatusDistributionChart;
