import StatCard from './StatCard';

interface ServerThroughputProps {
    analytics: {
        throughput: {
            rpm1: { mean: string; max: string };
            rpm15: { mean: string; max: string };
            rpm60: { mean: string; max: string };
        };
    };
}

const ServerThroughput = ({ analytics }: ServerThroughputProps) => (
    <div className="bg-gray-800 p-4 rounded-lg col-span-1 md:col-span-2">
        <h3 className="text-lg font-semibold mb-3">Server Throughput</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Mean RPM (1min)" value={analytics.throughput.rpm1.mean} description="Average requests per minute." trend="neutral" />
            <StatCard title="Max RPM (1min)" value={analytics.throughput.rpm1.max} description="Peak requests per minute." trend="neutral" />
            <StatCard title="Mean RPM (15min)" value={analytics.throughput.rpm15.mean} description="Average requests over 15 mins." trend="neutral" />
            <StatCard title="Max RPM (15min)" value={analytics.throughput.rpm15.max} description="Peak requests over 15 mins." trend="neutral" />
            <StatCard title="Mean RPM (60min)" value={analytics.throughput.rpm60.mean} description="Average requests over 60 mins." trend="neutral" />
            <StatCard title="Max RPM (60min)" value={analytics.throughput.rpm60.max} description="Peak requests over 60 mins." trend="neutral" />
        </div>
    </div>
);

export default ServerThroughput;
