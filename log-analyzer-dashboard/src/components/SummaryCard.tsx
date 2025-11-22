interface SummaryCardProps {
    title: string;
    value: string | number;
    unit?: string;
}

const SummaryCard = ({ title, value, unit }: SummaryCardProps) => (
    <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col justify-between">
        <div>
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">{title}</h3>
            <p className="text-white text-3xl font-semibold mt-2">
                {value}
                {unit && <span className="text-lg ml-1 text-gray-400">{unit}</span>}
            </p>
        </div>
    </div>
);

export default SummaryCard;
