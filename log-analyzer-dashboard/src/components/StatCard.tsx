interface StatCardProps {
    title: string;
    value: string | number;
    unit?: string;
    description: string;
}

const StatCard = ({ title, value, unit, description }: StatCardProps) => (
    <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 text-center shadow-lg backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-gray-400">{title}</h3>
        <p className="text-5xl font-extrabold text-white mt-2">
            {value}
            {unit && <span className="text-2xl font-semibold text-gray-500 ml-2">{unit}</span>}
        </p>
        <p className="text-sm text-gray-500 mt-2">{description}</p>
    </div>
);

export default StatCard;
