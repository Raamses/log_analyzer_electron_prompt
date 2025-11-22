
interface SummaryCardProps {
    title: string;
    value: string | number;
    unit?: string;
    icon?: React.ReactNode;
    trend?: string; // For future use
}

const SummaryCard = ({ title, value, unit, icon }: SummaryCardProps) => (
    <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 flex items-center justify-between hover:border-gray-700 transition-colors">
        <div>
            <p className="text-sm font-medium text-gray-400">{title}</p>
            <p className="text-3xl font-bold text-white mt-1">
                {value}
                {unit && <span className="text-lg ml-1 text-gray-500 font-normal">{unit}</span>}
            </p>
        </div>
        {icon && (
            <div className="p-3 bg-gray-800 rounded-lg text-gray-400">
                {icon}
            </div>
        )}
    </div>
);

export default SummaryCard;
