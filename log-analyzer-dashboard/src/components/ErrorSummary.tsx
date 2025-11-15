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
    <div className="bg-gray-900 p-6 rounded-xl col-span-1 md:col-span-2 lg:col-span-2 border border-gray-800">
        <h3 className="text-xl font-semibold text-white mb-4">Error Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard title="Total Errors" value={analytics.totalErrors} />
            <SummaryCard title="Error Rate" value={analytics.errorRate.toFixed(2)} unit="%" />
            <SummaryCard title="Client Errors (4xx)" value={analytics.clientErrors} />
            <SummaryCard title="Server Errors (5xx)" value={analytics.serverErrors} />
        </div>
        <div className="mt-6">
            <h4 className="font-semibold text-gray-300">Error Code Breakdown</h4>
            <ul className="mt-2 text-sm text-gray-400 space-y-1">
                {Object.entries(analytics.errorCodes).map(([code, count]) => (
                    <li key={code} className="flex justify-between items-center cursor-pointer hover:bg-gray-800 p-2 rounded-lg transition-colors" onClick={() => onCodeClick(code)}>
                        <span className="font-mono bg-gray-700 px-2 py-1 rounded">{code}</span>
                        <span className="font-semibold">{count} occurrences</span>
                    </li>
                ))}
            </ul>
        </div>
    </div>
);

export default ErrorSummary;
