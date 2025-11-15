import { useState } from 'react';

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

    return (
        <div className="bg-gray-800 p-4 rounded-lg col-span-1 md:col-span-2">
            <div className="flex border-b border-gray-700 mb-4">
                <button onClick={() => setActiveTab('endpoints')} className={`py-2 px-4 ${activeTab === 'endpoints' ? 'border-b-2 border-blue-500' : ''}`}>Top Endpoints</button>
                <button onClick={() => setActiveTab('ips')} className={`py-2 px-4 ${activeTab === 'ips' ? 'border-b-2 border-blue-500' : ''}`}>Top Calling IPs</button>
                <button onClick={() => setActiveTab('search')} className={`py-2 px-4 ${activeTab === 'search' ? 'border-b-2 border-blue-500' : ''}`}>Search Statistics</button>
            </div>
            {activeTab === 'endpoints' && (
                <table className="w-full text-sm text-left">
                    <thead><tr className="text-gray-400"><th className="py-2">Endpoint</th><th>Total Calls</th><th>Avg Latency (ms)</th><th>P95 Latency (ms)</th></tr></thead>
                    <tbody>{analytics.topEndpoints.map(e => (<tr key={e.uri} className="border-t border-gray-700"><td className="py-2">{e.uri}</td><td>{e.totalCalls}</td><td>{e.avgLatency.toFixed(2)}</td><td>{e.p95Latency.toFixed(2)}</td></tr>))}</tbody>
                </table>
            )}
            {activeTab === 'ips' && (
                 <table className="w-full text-sm text-left">
                    <thead><tr className="text-gray-400"><th className="py-2">IP Address (right-click for Whois)</th><th>Request Count</th></tr></thead>
                    <tbody>{analytics.topIps.map(([ip, count]) => (<tr key={ip} className="border-t border-gray-700"><td className="py-2" onContextMenu={(e) => handleIpRightClick(e, ip)}>{ip}</td><td>{count}</td></tr>))}</tbody>
                </table>
            )}
            {activeTab === 'search' && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <h4 className="font-semibold mb-2">Top 10 Hotel Codes</h4>
                        <table className="w-full text-sm text-left">
                            <thead><tr className="text-gray-400"><th className="py-2">Hotel Code</th><th>Count</th></tr></thead>
                            <tbody>{analytics.searchStats.topHotelCodes.map(([code, count]) => (<tr key={code} className="border-t border-gray-700"><td className="py-2">{code}</td><td>{count}</td></tr>))}</tbody>
                        </table>
                    </div>
                     <div>
                        <h4 className="font-semibold mb-2">Top 10 Compositions</h4>
                        <table className="w-full text-sm text-left">
                            <thead><tr className="text-gray-400"><th className="py-2">Composition</th><th>Count</th></tr></thead>
                            <tbody>{analytics.searchStats.topCompositions.map(([comp, count]) => (<tr key={comp} className="border-t border-gray-700"><td className="py-2">{comp}</td><td>{count}</td></tr>))}</tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrafficSegmentation;
