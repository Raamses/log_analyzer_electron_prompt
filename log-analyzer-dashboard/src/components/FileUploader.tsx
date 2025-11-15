import React from 'react';

interface FileUploaderProps {
    isParsed: boolean;
    parsedLogsCount: number;
    onOpenFile: () => void;
    onClear: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    isDragging: boolean;
    logContent: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({ isParsed, parsedLogsCount, onOpenFile, onClear, onDragOver, onDragLeave, onDrop, isDragging, logContent }) => {
    return (
        <div
            onClick={onOpenFile}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`cursor-pointer bg-gray-900 p-6 rounded-xl border-2 border-dashed transition-all duration-300 ${isParsed ? 'h-28' : 'h-64'} ${isDragging ? 'border-blue-600' : 'border-gray-700 hover:border-gray-500'}`}
        >
            <textarea
                className={`w-full bg-gray-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 ${isParsed ? 'h-0 opacity-0' : 'h-40'}`}
                placeholder="Select or drop a log file to begin"
                value={logContent}
                readOnly
            />
            {isParsed ? (
                <div className="text-center text-green-400">
                    <p className="text-lg">Successfully parsed {parsedLogsCount} log entries.</p>
                    <button onClick={onClear} className="text-blue-400 hover:underline mt-2">
                        Analyze another file
                    </button>
                </div>
            ) : (
                <div className="mt-4 text-center">
                    <p className="text-gray-400">Drag & drop a log file here, or click to select</p>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg mt-4">
                        Select File
                    </button>
                </div>
            )}
        </div>
    );
};

export default FileUploader;
