import { Calendar, X, Search } from 'lucide-react';
import type { FilterState } from '../hooks/useLogAnalysis';

interface FilterSidebarProps {
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    allStatusCodes: number[];
    isOpen: boolean;
    onClose: () => void;
}

const FilterSidebar = ({ filters, setFilters, allStatusCodes, isOpen, onClose }: FilterSidebarProps) => {
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
            className={`fixed inset-y-0 left-0 z-50 w-80 bg-gray-900 border-r border-gray-800 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 lg:block`}
        >
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
                <h2 className="text-xl font-bold text-white">Filters</h2>
                <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
                    <X size={24} />
                </button>
            </div>

            <div className="p-6 space-y-8 overflow-y-auto h-[calc(100vh-80px)]">

                {/* Search */}
                <div>
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Search Logs</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            type="text"
                            placeholder="URI or IP Address..."
                            value={filters.search}
                            onChange={handleSearchChange}
                            className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
                        />
                    </div>
                </div>

                {/* Time Range */}
                <div>
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Time Range (UTC)</label>
                    <div className="space-y-3">
                        <div className="flex items-center space-x-2 bg-gray-800 border border-gray-700 rounded-lg p-2">
                            <Calendar size={18} className="text-gray-500" />
                            <input
                                type="datetime-local"
                                value={formatDateForInput(filters.timeRange[0])}
                                onChange={(e) => handleDateChange(0, e.target.value)}
                                className="bg-transparent text-white text-sm focus:outline-none w-full"
                            />
                        </div>
                        <div className="flex items-center space-x-2 bg-gray-800 border border-gray-700 rounded-lg p-2">
                            <Calendar size={18} className="text-gray-500" />
                            <input
                                type="datetime-local"
                                value={formatDateForInput(filters.timeRange[1])}
                                onChange={(e) => handleDateChange(1, e.target.value)}
                                className="bg-transparent text-white text-sm focus:outline-none w-full"
                            />
                        </div>
                    </div>
                </div>

                {/* Status Codes */}
                <div>
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Status Codes</label>
                    <div className="grid grid-cols-2 gap-2">
                        {allStatusCodes.sort().map(code => (
                            <button
                                key={code}
                                onClick={() => handleStatusChange(code)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    filters.statusCodes.includes(code)
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                            >
                                {code}
                            </button>
                        ))}
                        {allStatusCodes.length === 0 && <p className="text-xs text-gray-600 col-span-2">No logs loaded.</p>}
                    </div>
                </div>

                {/* Reset Button */}
                <button
                    onClick={() => setFilters(prev => ({ ...prev, search: '', statusCodes: [], timeRange: [null, null] }))}
                    className="w-full py-2 text-sm text-red-400 hover:text-red-300 border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors"
                >
                    Reset All Filters
                </button>
            </div>
        </aside>
    );
};

export default FilterSidebar;
