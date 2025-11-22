import { useState } from 'react';
import InsightBlock from './InsightBlock';

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

    const handleIpRightClick = (e: React.MouseEvent<HTMLTableCellElement>, ip: string) => {
        e.preventDefault();
        window.open(`https://whois.domaintools.com/${ip}`, '_blank');
    };

    const renderTable = (headers: string[], data: (string | number)[][], ipContext?: boolean) => (
        <table className="w-full text-sm text-left text-gray-400">
            <thead className="text-xs text-gray-500 uppercase bg-gray-900/50">
                <tr>{headers.map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
                {data.map((row, i) => (
                    <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/50">
                        {row.map((cell, j) => (
                            <td key={j} className="px-4 py-3" onContextMenu={ipContext && j === 0 ? (e) => handleIpRightClick(e, cell as string) : undefined}>{cell}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <InsightBlock title="Traffic Segmentation" className="col-span-1 md:col-span-2">
            <div className="flex border-b border-gray-700 mb-4">
                <button onClick={() => setActiveTab('endpoints')} className={`py-2 px-4 font-semibold ${activeTab === 'endpoints' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'}`}>Top Endpoints</button>
                <button onClick={() => setActiveTab('ips')} className={`py-2 px-4 font-semibold ${activeTab === 'ips' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'}`}>Top Calling IPs</button>
                <button onClick={() => setActiveTab('search')} className={`py-2 px-4 font-semibold ${activeTab === 'search' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'}`}>Search Statistics</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
                {activeTab === 'endpoints' && renderTable(
                    ['Endpoint', 'Total Calls', 'Avg Latency (ms)', 'P95 Latency (ms)'],
                    analytics.topEndpoints.map(e => [e.uri, e.totalCalls, e.avgLatency.toFixed(2), e.p95Latency.toFixed(2)])
                )}
                {activeTab === 'ips' && renderTable(
                    ['IP Address (right-click for Whois)', 'Request Count'],
                    analytics.topIps,
                    true
                )}
                {activeTab === 'search' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-semibold text-gray-300 mb-2">Top 10 Hotel Codes</h4>
                            {renderTable(['Hotel Code', 'Count'], analytics.searchStats.topHotelCodes)}
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-300 mb-2">Top 10 Compositions</h4>
                            {renderTable(['Composition', 'Count'], analytics.searchStats.topCompositions)}
                        </div>
                    </div>
                )}
            </div>
        </InsightBlock>
    );
};

export default TrafficSegmentation;
