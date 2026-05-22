import React from 'react';
import { UploadCloud, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';

interface FileUploaderProps {
    isParsed: boolean;
    parsedLogsCount: number;
    onOpenFile: () => void;
    onClear: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isDragging: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    isLoading: boolean;
    loadingStage: 'reading' | 'parsing' | null;
    loadingFile: { name: string; size: string } | null;
    loadingProgress: number;
}

const FileUploader: React.FC<FileUploaderProps> = ({
    isParsed,
    parsedLogsCount,
    onOpenFile,
    onClear,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileSelect,
    isDragging,
    fileInputRef,
    isLoading,
    loadingStage,
    loadingFile,
    loadingProgress
}) => {
    return (
        <div className="glass-panel rounded-2xl overflow-hidden transition-all duration-300">
            <div
                onClick={!isParsed && !isLoading ? onOpenFile : undefined}
                onDragOver={!isLoading ? onDragOver : undefined}
                onDragLeave={!isLoading ? onDragLeave : undefined}
                onDrop={!isLoading ? onDrop : undefined}
                className={`relative flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl transition-all duration-300 ${
                    isLoading
                        ? 'border-indigo-500/40 bg-indigo-500/5 cursor-default'
                        : isDragging 
                            ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]' 
                            : 'border-slate-800 bg-slate-900/20 hover:border-slate-700 hover:bg-slate-900/30'
                } ${isParsed || isLoading ? 'cursor-default' : 'cursor-pointer group'}`}
            >
                <input
                    type="file"
                    ref={fileInputRef as React.RefObject<HTMLInputElement>}
                    onChange={onFileSelect}
                    className="hidden"
                    accept=".log, .txt, .csv"
                    disabled={isLoading}
                />

                {isLoading ? (
                    <div className="text-center space-y-5 py-4 animate-fade-in w-full">
                        <div className="relative inline-flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full bg-indigo-500/10 blur-xl animate-pulse" />
                            <div className="w-16 h-16 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-spin flex items-center justify-center">
                                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '3s' }} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-slate-100 tracking-tight">Processing Log File</h3>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/85 border border-slate-800">
                                <span className="text-xs font-mono text-indigo-300 truncate max-w-[160px] sm:max-w-xs">{loadingFile?.name}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">{loadingFile?.size}</span>
                            </div>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full max-w-sm mx-auto space-y-1.5">
                            <div className="flex justify-between items-center text-[10px] font-semibold uppercase tracking-wider">
                                <span className="text-indigo-400 animate-pulse">
                                    {loadingStage === 'reading' ? 'Phase 1 — Reading file...' : 'Phase 2 — Indexing & compiling...'}
                                </span>
                                <span className="text-slate-400 font-mono">{loadingProgress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-600 to-cyan-500 rounded-full transition-all duration-300"
                                    style={{ width: `${loadingStage === 'parsing' ? 100 : loadingProgress}%` }}
                                />
                            </div>
                            <p className="text-slate-500 text-[10px] text-center">Keep this window open — large files may take a moment.</p>
                        </div>
                    </div>
                ) : isParsed ? (
                    <div className="text-center space-y-4 animate-fade-in-up">
                        <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                            <CheckCircle2 size={32} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-100">Log File Loaded Successfully</h3>
                            <p className="text-sm text-slate-400 mt-1">
                                Analyzer processed <span className="text-emerald-400 font-semibold">{parsedLogsCount.toLocaleString()}</span> entries.
                            </p>
                        </div>
                        <button 
                            onClick={onClear} 
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 hover:border-slate-600 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                        >
                            <RefreshCw size={14} />
                            <span>Analyze Another File</span>
                        </button>
                    </div>
                ) : (
                    <div className="text-center space-y-4">
                        <div className="inline-flex p-4 rounded-full bg-slate-950/60 text-slate-400 border border-slate-800 group-hover:border-indigo-500/30 group-hover:text-indigo-400 transition-all duration-300">
                            <UploadCloud size={36} className="animate-pulse" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-base font-semibold text-slate-200">
                                Drag & drop your log file here
                            </p>
                            <p className="text-xs text-slate-500">
                                Supports .log, .txt, .csv (IIS or W3C formats)
                            </p>
                        </div>
                        <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold py-2.5 px-5 rounded-lg transition-all duration-200 shadow-lg shadow-indigo-600/20 group-hover:scale-[1.03] active:scale-[0.98] cursor-pointer">
                            Browse Local Files
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileUploader;
