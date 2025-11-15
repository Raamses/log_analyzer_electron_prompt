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
    <div className="bg-gray-800 p-4 rounded-lg col-span-1 md:col-span-2 lg:col-span-1">
        <h3 className="text-lg font-semibold mb-3">Error Summary</h3>
        <div className="grid grid-cols-2 gap-4">
            <SummaryCard title="Total Errors" value={analytics.totalErrors} />
            <SummaryCard title="Error Rate" value={analytics.errorRate.toFixed(2)} unit="%" />
            <SummaryCard title="Client Errors (4xx)" value={analytics.clientErrors} />
            <SummaryCard title="Server Errors (5xx)" value={analytics.serverErrors} />
        </div>
        <div className="mt-4">
            <h4 className="font-semibold">Error Code Breakdown</h4>
            <ul className="mt-2 text-sm">
                {Object.entries(analytics.errorCodes).map(([code, count]) => (
                    <li key={code} className="flex justify-between cursor-pointer hover:bg-gray-700 p-1 rounded" onClick={() => onCodeClick(code)}>
                        <span>{code}</span> <span>{count}</span>
                    </li>
                ))}
            </ul>
        </div>
    </div>
);

export default ErrorSummary;
