import { useState } from 'react';
import ContextMenu from './ContextMenu';

interface TrafficSegmentationProps {
    analytics: {
        topEndpoints: { uri: string; totalCalls: number; avgLatency: number; p95Latency: number }[];
        topIps: [string, number][];
        searchStats: {
            topHotelCodes: [string, number][];
            topCompositions: [string, number][];
        };
    };
}

const TrafficSegmentation = ({ analytics }: TrafficSegmentationProps) => {
    const [activeTab, setActiveTab] = useState('endpoints');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ip: string } | null>(null);

    const handleIpRightClick = (e: React.MouseEvent<HTMLTableCellElement>, ip: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, ip });
    };

    const handleWhoisLookup = () => {
        if (contextMenu) {
            window.open(`https://whois.domaintools.com/${contextMenu.ip}`, '_blank');
            setContextMenu(null);
        }
    };

    const renderTable = (headers: string[], data: (string | number)[][], ipContext?: boolean) => (
        <table className="w-full text-sm text-left text-card-foreground">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/10">
                <tr>{headers.map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
                {data.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-secondary/10">
                        {row.map((cell, j) => (
                            <td key={j} className="px-4 py-3" onContextMenu={ipContext && j === 0 ? (e) => handleIpRightClick(e, cell as string) : undefined}>{cell}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <div className="bg-card text-card-foreground p-5 rounded-lg shadow-md col-span-1 md:col-span-2">
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onLookup={handleWhoisLookup} />}
            <h3 className="text-lg font-semibold text-card-foreground mb-4">Traffic Segmentation</h3>
            <div className="flex border-b border-border/50 mb-4">
                <button onClick={() => setActiveTab('endpoints')} className={`py-2 px-4 font-semibold text-sm ${activeTab === 'endpoints' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}>Top Endpoints</button>
                <button onClick={() => setActiveTab('ips')} className={`py-2 px-4 font-semibold text-sm ${activeTab === 'ips' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}>Top Calling IPs</button>
                <button onClick={() => setActiveTab('search')} className={`py-2 px-4 font-semibold text-sm ${activeTab === 'search' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}>Search Statistics</button>
            </div>
            {activeTab === 'endpoints' && renderTable(
                ['Endpoint', 'Total Calls', 'Avg Latency (ms)', 'P95 Latency (ms)'],
                analytics.topEndpoints.map(e => [e.uri, e.totalCalls, e.avgLatency.toFixed(2), e.p95Latency.toFixed(2)])
            )}
            {activeTab === 'ips' && renderTable(
                ['IP Address (right-click for menu)', 'Request Count'],
                analytics.topIps,
                true
            )}
            {activeTab === 'search' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="font-semibold text-muted-foreground mb-2">Top 10 Hotel Codes</h4>
                        {renderTable(['Hotel Code', 'Count'], analytics.searchStats.topHotelCodes)}
                    </div>
                     <div>
                        <h4 className="font-semibold text-muted-foreground mb-2">Top 10 Compositions</h4>
                        {renderTable(['Composition', 'Count'], analytics.searchStats.topCompositions)}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrafficSegmentation;
