import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SummaryCardProps {
    title: string;
    value: string | number;
    unit?: string;
    icon?: React.ReactNode;
    trend?: string; // For future use
}

const SummaryCard = ({ title, value, unit, icon, trend }: SummaryCardProps) => {
    // Helper function to render a visually appealing trend badge
    const renderTrend = () => {
        if (!trend) return null;

        let trendColorClass = "bg-slate-500/10 text-slate-400";
        let TrendIcon = Minus;

        if (trend.startsWith('+') || trend.toLowerCase().includes('up')) {
            trendColorClass = "bg-emerald-500/10 text-emerald-400";
            TrendIcon = TrendingUp;
        } else if (trend.startsWith('-') || trend.toLowerCase().includes('down')) {
            trendColorClass = "bg-rose-500/10 text-rose-400";
            TrendIcon = TrendingDown;
        } else {
            trendColorClass = "bg-indigo-500/10 text-indigo-400";
            TrendIcon = Minus; // You could also omit the icon for neutral, but Minus looks okay as a default
        }

        return (
            <div className={`inline-flex items-center gap-1 px-2 py-1 mt-3 rounded-md text-xs font-semibold tracking-wide ${trendColorClass}`}>
                <TrendIcon className="w-3 h-3" />
                <span>{trend}</span>
            </div>
        );
    };

    return (
        <div className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
            {/* Subtle color highlight accent at top */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 opacity-60 group-hover:opacity-100 transition-all duration-300"></div>

            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">{title}</h3>
                    <p className="text-slate-100 text-3xl font-extrabold mt-3 tracking-tight">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                        {unit && <span className="text-sm font-medium ml-1 text-slate-500 uppercase">{unit}</span>}
                    </p>
                    {renderTrend()}
                </div>
                {icon && (
                    <div className="p-3 bg-slate-800/50 rounded-xl text-indigo-400 border border-slate-700/50 shadow-inner">
                        {icon}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SummaryCard;
