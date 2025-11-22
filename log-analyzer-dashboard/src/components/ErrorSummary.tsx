import SummaryCard from './SummaryCard';

interface ErrorSummaryProps {
    analytics: {
        totalErrors: number;
        errorRate: number;
        clientErrors: number;
        serverErrors: number;
        errorCodes: { [key: string]: number };
    };
    onCodeClick: (code: string) => void;
}

const ErrorSummary = ({ analytics, onCodeClick }: ErrorSummaryProps) => (
    <div className="bg-gray-800/50 p-6 rounded-lg col-span-1 md:col-span-2 lg:col-span-2 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Error Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <SummaryCard title="Total Errors" value={analytics.totalErrors} />
            <SummaryCard title="Error Rate" value={analytics.errorRate.toFixed(2)} unit="%" />
            <SummaryCard title="Client Errors (4xx)" value={analytics.clientErrors} />
            <SummaryCard title="Server Errors (5xx)" value={analytics.serverErrors} />
        </div>
        <div className="mt-6">
            <h4 className="font-semibold text-gray-300 mb-2">Error Code Breakdown</h4>
            <div className="space-y-2">
                {Object.entries(analytics.errorCodes).map(([code, count]) => (
                    <div key={code} className="flex justify-between items-center p-2 rounded-md hover:bg-gray-700/50 cursor-pointer" onClick={() => onCodeClick(code)}>
                        <span className="font-mono text-sm bg-gray-700 px-2 py-1 rounded-md text-yellow-400">{code}</span>
                        <span className="text-sm font-semibold">{count}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export default ErrorSummary;
