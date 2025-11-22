import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface StatusDistributionChartProps {
    data: { [key: string]: number };
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#8b5cf6'];

const StatusDistributionChart = ({ data }: StatusDistributionChartProps) => {
    const chartData = Object.entries(data).map(([name, value]) => ({ name, value }));

    return (
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 h-[400px]">
            <h3 className="text-xl font-semibold text-white mb-6">Status Code Distribution</h3>
            <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {chartData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem' }}
                        itemStyle={{ color: '#9ca3af' }}
                    />
                    <Legend iconType="circle" />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default StatusDistributionChart;
