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
    <div className="glass-panel p-6 rounded-2xl col-span-1 md:col-span-2 lg:col-span-2 flex flex-col justify-between">
        <div>
            <h3 className="text-lg font-bold tracking-tight text-white mb-4">Error Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard title="Total Errors" value={analytics.totalErrors} />
                <SummaryCard title="Error Rate" value={analytics.errorRate.toFixed(2)} unit="%" />
                <SummaryCard title="Client Errors (4xx)" value={analytics.clientErrors} />
                <SummaryCard title="Server Errors (5xx)" value={analytics.serverErrors} />
            </div>
        </div>
        <div className="mt-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Error Code Breakdown</h4>
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {Object.entries(analytics.errorCodes).map(([code, count]) => {
                    const statusCode = parseInt(code, 10);
                    let badgeStyle = "bg-slate-800 text-slate-300";
                    if (statusCode >= 200 && statusCode < 300) {
                        badgeStyle = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                    } else if (statusCode >= 300 && statusCode < 400) {
                        badgeStyle = "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
                    } else if (statusCode >= 400 && statusCode < 500) {
                        badgeStyle = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
                    } else if (statusCode >= 500) {
                        badgeStyle = "bg-red-500/10 text-red-400 border border-red-500/20 font-bold glow-red";
                    }
                    return (
                        <div 
                            key={code} 
                            className="flex justify-between items-center p-2 rounded-xl bg-slate-950/30 hover:bg-slate-900/40 transition-colors border border-slate-900/40 cursor-pointer" 
                            onClick={() => onCodeClick(code)}
                        >
                            <span className={`font-mono text-xs px-2.5 py-0.5 rounded-md border ${badgeStyle}`}>{code}</span>
                            <span className="text-sm font-bold text-slate-300">{count.toLocaleString()}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
);

export default ErrorSummary;
