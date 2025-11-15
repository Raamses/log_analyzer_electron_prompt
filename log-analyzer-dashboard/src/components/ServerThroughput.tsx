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
    <div className="bg-card text-card-foreground p-5 rounded-lg shadow-md col-span-1 md:col-span-2 border-t-4 border-success">
        <h3 className="text-lg font-semibold text-card-foreground mb-4">Server Throughput</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard title="Mean RPM (1min)" value={analytics.throughput.rpm1.mean} />
            <StatCard title="Max RPM (1min)" value={analytics.throughput.rpm1.max} />
            <StatCard title="Mean RPM (15min)" value={analytics.throughput.rpm15.mean} />
            <StatCard title="Max RPM (15min)" value={analytics.throughput.rpm15.max} />
            <StatCard title="Mean RPM (60min)" value={analytics.throughput.rpm60.mean} />
            <StatCard title="Max RPM (60min)" value={analytics.throughput.rpm60.max} />
        </div>
    </div>
);

export default ServerThroughput;
