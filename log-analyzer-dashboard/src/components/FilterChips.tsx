import { X } from 'lucide-react';
import type { FilterState } from '../hooks/useLogAnalysis';
import type { LogEntry } from '../utils/parser';

interface FilterChipsProps {
    filters: FilterState;
    allLogs: LogEntry[];
    onClearSearch: () => void;
    onClearStatus: (code: number) => void;
    onClearTimeRange: () => void;
    onClearIp: () => void;
    onClearEndpoint: () => void;
    onClearHotelCode: () => void;
    onClearComposition: () => void;
    onClearDeviceCategory: () => void;
    onClearStayCategory: () => void;
    onClearOccupancyProfile: () => void;
    onResetAll: () => void;
}

const FilterChips = ({
    filters,
    allLogs,
    onClearSearch,
    onClearStatus,
    onClearTimeRange,
    onClearIp,
    onClearEndpoint,
    onClearHotelCode,
    onClearComposition,
    onClearDeviceCategory,
    onClearStayCategory,
    onClearOccupancyProfile,
    onResetAll,
}: FilterChipsProps) => {
    // Check if time range is modified
    const isTimeRangeModified = (() => {
        if (allLogs.length === 0) return false;
        const start = filters.timeRange[0];
        const end = filters.timeRange[1];
        if (!start || !end) return false;
        const originalStart = allLogs[0].timestamp;
        const originalEnd = allLogs[allLogs.length - 1].timestamp;
        return Math.abs(start.getTime() - originalStart.getTime()) > 1000 || 
               Math.abs(end.getTime() - originalEnd.getTime()) > 1000;
    })();

    const hasAnyActiveFilter = 
        !!filters.search || 
        filters.statusCodes.length > 0 || 
        isTimeRangeModified || 
        !!filters.selectedIp || 
        !!filters.selectedEndpoint || 
        !!filters.selectedHotelCode || 
        !!filters.selectedComposition ||
        !!filters.selectedDeviceCategory ||
        !!filters.selectedStayCategory ||
        !!filters.selectedOccupancyProfile;

    if (!hasAnyActiveFilter) return null;

    const formatTime = (date: Date | null) => {
        if (!date) return '';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="glass-panel px-4 py-3 rounded-2xl flex flex-wrap items-center gap-2 mb-6">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">Active Filters:</span>
            
            {/* Search */}
            {filters.search && (
                <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 px-3 py-1 rounded-full text-xs font-mono font-medium shadow-sm">
                    <span>Search: "{filters.search}"</span>
                    <button onClick={onClearSearch} className="hover:text-indigo-100 transition-colors focus:outline-none cursor-pointer">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Status Codes */}
            {filters.statusCodes.map(code => {
                let chipStyle = "bg-emerald-500/10 border-emerald-500/30 text-emerald-300";
                if (code >= 300 && code < 400) {
                    chipStyle = "bg-cyan-500/10 border-cyan-500/30 text-cyan-300";
                } else if (code >= 400 && code < 500) {
                    chipStyle = "bg-amber-500/10 border-amber-500/30 text-amber-300";
                } else if (code >= 500) {
                    chipStyle = "bg-red-500/10 border-red-500/30 text-red-300";
                }
                return (
                    <div key={code} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border font-mono font-medium shadow-sm ${chipStyle}`}>
                        <span>Status: {code}</span>
                        <button onClick={() => onClearStatus(code)} className="hover:opacity-80 transition-opacity focus:outline-none cursor-pointer">
                            <X size={12} />
                        </button>
                    </div>
                );
            })}

            {/* Time Range */}
            {isTimeRangeModified && (
                <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/30 text-violet-300 px-3 py-1 rounded-full text-xs font-mono font-medium shadow-sm">
                    <span>Time: {formatTime(filters.timeRange[0])} - {formatTime(filters.timeRange[1])}</span>
                    <button onClick={onClearTimeRange} className="hover:text-violet-100 transition-colors focus:outline-none cursor-pointer">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* IP Address */}
            {filters.selectedIp && (
                <div className="flex items-center gap-1.5 bg-slate-800/40 border border-slate-700 text-slate-300 px-3 py-1 rounded-full text-xs font-mono font-medium shadow-sm">
                    <span>IP: {filters.selectedIp}</span>
                    <button onClick={onClearIp} className="hover:text-slate-100 transition-colors focus:outline-none cursor-pointer">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Endpoint */}
            {filters.selectedEndpoint && (
                <div className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-3 py-1 rounded-full text-xs font-mono font-medium shadow-sm max-w-xs truncate">
                    <span className="truncate">URI: {filters.selectedEndpoint}</span>
                    <button onClick={onClearEndpoint} className="hover:text-cyan-100 transition-colors focus:outline-none flex-shrink-0 cursor-pointer">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Hotel Code */}
            {filters.selectedHotelCode && (
                <div className="flex items-center gap-1.5 bg-pink-500/10 border border-pink-500/30 text-pink-300 px-3 py-1 rounded-full text-xs font-mono font-medium shadow-sm">
                    <span>Hotel: {filters.selectedHotelCode}</span>
                    <button onClick={onClearHotelCode} className="hover:text-pink-100 transition-colors focus:outline-none cursor-pointer">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Composition */}
            {filters.selectedComposition && (
                <div className="flex items-center gap-1.5 bg-teal-500/10 border border-teal-500/30 text-teal-300 px-3 py-1 rounded-full text-xs font-mono font-medium shadow-sm">
                    <span>Composition: {filters.selectedComposition}</span>
                    <button onClick={onClearComposition} className="hover:text-teal-100 transition-colors focus:outline-none cursor-pointer">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Device Category */}
            {filters.selectedDeviceCategory && (
                <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3 py-1 rounded-full text-xs font-mono font-medium shadow-sm">
                    <span className="capitalize">Client: {filters.selectedDeviceCategory}</span>
                    <button onClick={onClearDeviceCategory} className="hover:text-amber-100 transition-colors focus:outline-none cursor-pointer">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Stay Category */}
            {filters.selectedStayCategory && (
                <div className="flex items-center gap-1.5 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 px-3 py-1 rounded-full text-xs font-mono font-medium shadow-sm animate-fade-in">
                    <span>Stay Cat: {filters.selectedStayCategory}</span>
                    <button onClick={onClearStayCategory} className="hover:text-fuchsia-100 transition-colors focus:outline-none cursor-pointer">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Occupancy Profile */}
            {filters.selectedOccupancyProfile && (
                <div className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-300 px-3 py-1 rounded-full text-xs font-mono font-medium shadow-sm animate-fade-in">
                    <span>Occupancy: {filters.selectedOccupancyProfile}</span>
                    <button onClick={onClearOccupancyProfile} className="hover:text-sky-100 transition-colors focus:outline-none cursor-pointer">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Clear All Button */}
            <button
                onClick={onResetAll}
                className="ml-auto text-xs text-red-400 hover:text-red-300 bg-red-950/15 border border-red-500/20 rounded-lg px-2.5 py-1 font-bold cursor-pointer transition-all active:scale-[0.98]"
            >
                Clear All
            </button>
        </div>
    );
};

export default FilterChips;
