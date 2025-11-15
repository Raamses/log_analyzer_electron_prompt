interface SummaryCardProps {
    title: string;
    value: string | number;
    unit?: string;
}

const SummaryCard = ({ title, value, unit }: SummaryCardProps) => (
    <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 text-center transition-all duration-300 hover:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-400">{title}</h3>
        <p className="text-4xl font-extrabold text-white mt-2">{value} <span className="text-xl font-semibold text-gray-500">{unit}</span></p>
    </div>
);

export default SummaryCard;
