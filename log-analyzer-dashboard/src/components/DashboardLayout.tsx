import { useState } from 'react';
import { Menu, Terminal, RefreshCw } from 'lucide-react';
import FilterSidebar from './FilterSidebar';
import type { FilterState } from '../hooks/useLogAnalysis';

interface DashboardLayoutProps {
    children: React.ReactNode;
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    allStatusCodes: number[];
    isParsed: boolean;
    parsedLogsCount: number;
    onClear: (e: React.MouseEvent<HTMLButtonElement>) => void;
    geoIpEnabled: boolean;
    onToggleGeoIp: (enabled: boolean) => void;
}

const DashboardLayout = ({
    children,
    filters,
    setFilters,
    allStatusCodes,
    isParsed,
    parsedLogsCount,
    onClear,
    geoIpEnabled,
    onToggleGeoIp
}: DashboardLayoutProps) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
            {/* Sidebar */}
            <FilterSidebar
                filters={filters}
                setFilters={setFilters}
                allStatusCodes={allStatusCodes}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                geoIpEnabled={geoIpEnabled}
                onToggleGeoIp={onToggleGeoIp}
            />

            {/* Backdrop for mobile sidebar */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity duration-300"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top Sticky Header */}
                <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-slate-900/60 border-b border-slate-800/80 shadow-lg">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsSidebarOpen(true)} 
                            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                        >
                            <Menu size={20} />
                        </button>
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                <Terminal size={20} />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold tracking-tight text-slate-100">IIS Log Analyzer</h1>
                                <p className="text-xs text-slate-400 hidden sm:block">Developer Control Console</p>
                            </div>
                        </div>
                    </div>

                    {/* Top Stats & Actions Bar */}
                    <div className="flex items-center gap-4">
                        {isParsed ? (
                            <div className="flex items-center gap-3">
                                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold animate-pulse-slow">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                                    <span>Active Session: {parsedLogsCount.toLocaleString()} Entries</span>
                                </div>
                                <button
                                    onClick={(e) => onClear(e)}
                                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all border border-slate-700 cursor-pointer"
                                >
                                    <RefreshCw size={14} />
                                    <span>Reset Workspace</span>
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
                                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
                                <span>Waiting for log file...</span>
                            </div>
                        )}
                    </div>
                </header>

                {/* Main scrollable viewport */}
                <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-slate-950/20">
                    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
