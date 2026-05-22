import { Calendar, X, Search } from 'lucide-react';
import type { FilterState } from '../hooks/useLogAnalysis';

interface FilterSidebarProps {
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    allStatusCodes: number[];
    isOpen: boolean;
    onClose: () => void;
    geoIpEnabled: boolean;
    onToggleGeoIp: (enabled: boolean) => void;
}

const FilterSidebar = ({
    filters,
    setFilters,
    allStatusCodes,
    isOpen,
    onClose,
    geoIpEnabled,
    onToggleGeoIp
}: FilterSidebarProps) => {
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters(prev => ({ ...prev, search: e.target.value }));
    };

    const handleStatusChange = (code: number) => {
        setFilters(prev => {
            const newCodes = prev.statusCodes.includes(code)
                ? prev.statusCodes.filter(c => c !== code)
                : [...prev.statusCodes, code];
            return { ...prev, statusCodes: newCodes };
        });
    };

    const handleDateChange = (index: 0 | 1, value: string) => {
        const date = value ? new Date(value) : null;
        setFilters(prev => {
            const newRange = [...prev.timeRange] as [Date | null, Date | null];
            newRange[index] = date;
            return { ...prev, timeRange: newRange };
        });
    };

    const formatDateForInput = (date: Date | null) => {
        if (!date) return '';
        return date.toISOString().slice(0, 16);
    };

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-50 w-80 backdrop-blur-md bg-slate-900/90 border-r border-slate-800/80 shadow-2xl transform transition-all duration-300 ease-in-out ${
                isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full lg:translate-x-0'
            } lg:relative lg:block`}
        >
            <div className="flex items-center justify-between p-6 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    <h2 className="text-xl font-bold tracking-tight text-white">Filters</h2>
                </div>
                <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 space-y-8 overflow-y-auto h-[calc(100vh-80px)] scrollbar-none">
                {/* Search */}
                <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Search Logs</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={16} />
                        <input
                            type="text"
                            placeholder="URI, IP, or method..."
                            value={filters.search}
                            onChange={handleSearchChange}
                            className="w-full bg-slate-950/60 text-slate-100 border border-slate-800 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder-slate-600 font-mono text-sm shadow-inner"
                        />
                    </div>
                </div>

                {/* Time Range */}
                <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Time Range (UTC)</label>
                    <div className="space-y-3">
                        <div className="flex items-center space-x-2 bg-slate-950/60 border border-slate-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 rounded-lg p-2.5 transition-all shadow-inner">
                            <Calendar size={16} className="text-slate-500 shrink-0" />
                            <input
                                type="datetime-local"
                                value={formatDateForInput(filters.timeRange[0])}
                                onChange={(e) => handleDateChange(0, e.target.value)}
                                className="bg-transparent text-slate-200 text-xs focus:outline-none w-full font-mono cursor-pointer"
                            />
                        </div>
                        <div className="flex items-center space-x-2 bg-slate-950/60 border border-slate-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 rounded-lg p-2.5 transition-all shadow-inner">
                            <Calendar size={16} className="text-slate-500 shrink-0" />
                            <input
                                type="datetime-local"
                                value={formatDateForInput(filters.timeRange[1])}
                                onChange={(e) => handleDateChange(1, e.target.value)}
                                className="bg-transparent text-slate-200 text-xs focus:outline-none w-full font-mono cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {/* Status Codes */}
                <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Status Codes</label>
                    <div className="grid grid-cols-2 gap-2">
                        {allStatusCodes.sort().map(code => {
                            const isSelected = filters.statusCodes.includes(code);
                            let badgeStyle = "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200";
                            
                            if (isSelected) {
                                if (code >= 200 && code < 300) {
                                    badgeStyle = "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-semibold shadow-sm shadow-emerald-500/10";
                                } else if (code >= 300 && code < 400) {
                                    badgeStyle = "bg-cyan-500/10 border-cyan-500/40 text-cyan-400 font-semibold shadow-sm shadow-cyan-500/10";
                                } else if (code >= 400 && code < 500) {
                                    badgeStyle = "bg-amber-500/10 border-amber-500/40 text-amber-400 font-semibold shadow-sm shadow-amber-500/10";
                                } else {
                                    badgeStyle = "bg-red-500/10 border-red-500/40 text-red-400 font-bold shadow-sm shadow-red-500/15 animate-pulse-slow";
                                }
                            }

                            return (
                                <button
                                    key={code}
                                    onClick={() => handleStatusChange(code)}
                                    className={`px-3 py-2 border rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${badgeStyle}`}
                                >
                                    {code}
                                </button>
                            );
                        })}
                        {allStatusCodes.length === 0 && (
                            <p className="text-xs text-slate-500 italic col-span-2 text-center py-2">No active logs parsed</p>
                        )}
                    </div>
                </div>

                {/* Developer Preferences Settings */}
                <div className="border-t border-slate-800/80 pt-6">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Developer Preferences</label>
                    <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-300">IP Geolocation API</span>
                            <button
                                type="button"
                                onClick={() => onToggleGeoIp(!geoIpEnabled)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    geoIpEnabled ? 'bg-indigo-600' : 'bg-slate-800'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                        geoIpEnabled ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal font-sans font-medium">
                            Enables querying external GeoIP APIs for public IP lookups. Disabling this prevents network requests for IP forensic data to maintain privacy.
                        </p>
                    </div>
                </div>

                {/* Reset Button */}
                <button
                    onClick={() => setFilters(prev => ({ ...prev, search: '', statusCodes: [], timeRange: [null, null] }))}
                    className="w-full py-2.5 text-sm font-semibold text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg bg-red-950/10 hover:bg-red-950/20 active:scale-[0.98] transition-all cursor-pointer"
                >
                    Reset All Filters
                </button>
            </div>
        </aside>
    );
};

export default FilterSidebar;
