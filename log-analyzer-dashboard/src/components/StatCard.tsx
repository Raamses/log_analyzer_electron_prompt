interface StatCardProps {
    title: string;
    value: string | number;
    unit?: string;
}

const StatCard = ({ title, value, unit }: StatCardProps) => (
    <div className="bg-card text-card-foreground p-5 rounded-lg shadow-md border-t-4 border-primary transition-all duration-300 hover:shadow-xl">
        <h3 className="text-md font-semibold text-muted-foreground">{title}</h3>
        <p className="text-3xl font-bold text-card-foreground mt-2">
            {value} {unit && <span className="text-lg font-medium text-muted-foreground">{unit}</span>}
        </p>
    </div>
);

export default StatCard;