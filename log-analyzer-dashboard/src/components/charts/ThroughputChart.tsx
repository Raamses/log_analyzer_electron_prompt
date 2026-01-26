import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area } from 'recharts';

interface ThroughputChartProps {
    data: { timestamp: number; requests: number; errors: number }[];
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: { value: number }[];
    label?: string | number;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length && label !== undefined && label !== null) {
        return (
            <div className="bg-gray-900 border border-gray-700 p-3 rounded shadow-xl">
                <p className="text-gray-400 mb-1">{new Date(label).toLocaleString()}</p>
                <p className="text-blue-400 font-semibold">Requests: {payload[0].value}</p>
                <p className="text-red-400 font-semibold">Errors: {payload[1].value}</p>
            </div>
        );
    }
    return null;
};

const ThroughputChart = ({ data }: ThroughputChartProps) => {
    return (
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 h-[400px]">
            <h3 className="text-xl font-semibold text-white mb-6">Request Throughput</h3>
            <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis
                        dataKey="timestamp"
                        tickFormatter={(ts) => new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        stroke="#9ca3af"
                        tick={{ fontSize: 12 }}
                    />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="requests" name="Total Requests" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRequests)" strokeWidth={2} />
                    <Area type="monotone" dataKey="errors" name="Errors" stroke="#ef4444" fillOpacity={1} fill="url(#colorErrors)" strokeWidth={2} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ThroughputChart;
