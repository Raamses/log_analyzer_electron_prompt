interface SummaryCardProps {
    title: string;
    value: string | number;
    unit?: string;
}

const SummaryCard = ({ title, value, unit }: SummaryCardProps) => (
    <div className="bg-gray-800 p-4 rounded-lg text-center">
        <h3 className="text-md font-semibold text-gray-400">{title}</h3>
        <p className="text-3xl font-bold mt-2">{value} <span className="text-lg">{unit}</span></p>
    </div>
);

export default SummaryCard;
