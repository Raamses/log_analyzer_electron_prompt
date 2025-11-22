import InsightBlock from './InsightBlock';

interface ErrorSummaryProps {
    analytics: {
        errorCodes: { [key: string]: number };
    };
    onCodeClick: (code: string) => void;
}

const ErrorSummary = ({ analytics, onCodeClick }: ErrorSummaryProps) => (
    <InsightBlock title="Error Summary" className="col-span-1 md:col-span-2">
        <div>
            <h4 className="font-semibold text-gray-300 mb-2">Error Code Breakdown</h4>
            <ul className="text-sm text-gray-400 space-y-1 max-h-48 overflow-y-auto">
                {Object.entries(analytics.errorCodes).map(([code, count]) => (
                    <li key={code} className="flex justify-between items-center cursor-pointer hover:bg-gray-700/50 p-2 rounded-lg transition-colors" onClick={() => onCodeClick(code)}>
                        <span className="font-mono bg-gray-700 px-2 py-1 rounded">{code}</span>
                        <span className="font-semibold">{count} occurrences</span>
                    </li>
                ))}
            </ul>
        </div>
    </InsightBlock>
);

export default ErrorSummary;
