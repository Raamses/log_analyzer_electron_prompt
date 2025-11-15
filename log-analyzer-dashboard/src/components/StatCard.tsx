interface StatCardProps {
    title: string;
    value: string | number;
    unit?: string;
    description: string;
    trend: 'up' | 'down' | 'neutral';
}

const StatCard = ({ title, value, unit, description, trend }: StatCardProps) => {
    const trendIcon = {
        up: '▲',
        down: '▼',
        neutral: '●'
    }[trend];

    const trendColor = {
        up: 'text-green-500',
        down: 'text-red-500',
        neutral: 'text-gray-500'
    }[trend];

    return (
        <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-md font-semibold text-gray-400">{title}</h3>
            <p className="text-3xl font-bold mt-2">{value} <span className="text-lg">{unit}</span></p>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
            <p className={`text-sm ${trendColor} mt-2`}>{trendIcon} Trending {trend}</p>
        </div>
    );
};

export default StatCard;
