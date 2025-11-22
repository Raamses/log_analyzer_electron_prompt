import InsightBlock from './InsightBlock';
import StatCard from './StatCard';

interface ServerThroughputProps {
    analytics: {
        throughput: {
            rpm1: { mean: string; max: string };
            rpm15: { mean:string; max: string };
            rpm60: { mean: string; max: string };
        };
    };
}

const ServerThroughput = ({ analytics }: ServerThroughputProps) => (
    <InsightBlock title="Server Throughput" className="col-span-1 md:col-span-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Mean RPM (1min)" value={analytics.throughput.rpm1.mean} description="Average requests per minute over the last minute." />
            <StatCard title="Max RPM (1min)" value={analytics.throughput.rpm1.max} description="Peak requests per minute over the last minute." />
            <StatCard title="Mean RPM (15min)" value={analytics.throughput.rpm15.mean} description="Average requests per minute over the last 15 minutes." />
            <StatCard title="Max RPM (15min)" value={analytics.throughput.rpm15.max} description="Peak requests per minute over the last 15 minutes." />
            <StatCard title="Mean RPM (60min)" value={analytics.throughput.rpm60.mean} description="Average requests per minute over the last 60 minutes." />
            <StatCard title="Max RPM (60min)" value={analytics.throughput.rpm60.max} description="Peak requests per minute over the last 60 minutes." />
        </div>
    </InsightBlock>
);

export default ServerThroughput;
