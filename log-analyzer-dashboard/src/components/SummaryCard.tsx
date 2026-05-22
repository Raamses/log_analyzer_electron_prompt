interface SummaryCardProps {
    title: string;
    value: string | number;
    unit?: string;
    icon?: React.ReactNode;
    trend?: string; // For future use
}

const SummaryCard = ({ title, value, unit }: SummaryCardProps) => (
    <div className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
        {/* Subtle color highlight accent at top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 opacity-60 group-hover:opacity-100 transition-all duration-300"></div>
        <div>
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">{title}</h3>
            <p className="text-slate-100 text-3xl font-extrabold mt-3 tracking-tight">
                {typeof value === 'number' ? value.toLocaleString() : value}
                {unit && <span className="text-sm font-medium ml-1 text-slate-500 uppercase">{unit}</span>}
            </p>
        </div>
    </div>
);

export default SummaryCard;
