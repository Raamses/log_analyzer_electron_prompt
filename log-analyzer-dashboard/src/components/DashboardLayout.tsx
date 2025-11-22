import { useState } from 'react';
import { Menu } from 'lucide-react';
import FilterSidebar from './FilterSidebar';
import type { FilterState } from '../hooks/useLogAnalysis';

interface DashboardLayoutProps {
    children: React.ReactNode;
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    allStatusCodes: number[];
}

const DashboardLayout = ({ children, filters, setFilters, allStatusCodes }: DashboardLayoutProps) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen bg-black overflow-hidden">
            {/* Sidebar */}
            <FilterSidebar
                filters={filters}
                setFilters={setFilters}
                allStatusCodes={allStatusCodes}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800 lg:hidden">
                    <h1 className="text-lg font-bold text-white">Log Analyzer</h1>
                    <button onClick={() => setIsSidebarOpen(true)} className="text-gray-400 hover:text-white">
                        <Menu size={24} />
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto p-4 lg:p-8 relative">
                    <div className="max-w-7xl mx-auto space-y-6">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
