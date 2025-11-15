import StatCard from './StatCard';

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
    <div className="bg-card text-card-foreground p-5 rounded-lg shadow-md col-span-1 md:col-span-2 lg:col-span-2 border-t-4 border-destructive">
        <h3 className="text-lg font-semibold text-card-foreground mb-4">Error Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Errors" value={analytics.totalErrors} />
            <StatCard title="Error Rate" value={analytics.errorRate.toFixed(2)} unit="%" />
            <StatCard title="Client Errors (4xx)" value={analytics.clientErrors} />
            <StatCard title="Server Errors (5xx)" value={analytics.serverErrors} />
        </div>
        <div className="mt-6">
            <h4 className="font-semibold text-muted-foreground">Error Code Breakdown</h4>
            <ul className="mt-2 text-sm text-card-foreground space-y-1">
                {Object.entries(analytics.errorCodes).map(([code, count]) => (
                    <li key={code} className="flex justify-between items-center cursor-pointer hover:bg-secondary/10 p-2 rounded-md transition-colors" onClick={() => onCodeClick(code)}>
                        <span className="font-mono bg-destructive/10 text-destructive px-2 py-1 rounded">{code}</span>
                        <span className="font-semibold">{count} occurrences</span>
                    </li>
                ))}
            </ul>
        </div>
    </div>
);

export default ErrorSummary;
