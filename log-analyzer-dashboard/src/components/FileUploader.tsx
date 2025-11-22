import React from 'react';

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
    logContent: string;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const FileUploader: React.FC<FileUploaderProps> = ({ isParsed, parsedLogsCount, onOpenFile, onClear, onDragOver, onDragLeave, onDrop, onFileSelect, isDragging, logContent, fileInputRef }) => {
    return (
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <div
                onClick={!isParsed ? onOpenFile : undefined}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors duration-300 ${
                    isDragging ? 'border-primary' : 'border-gray-600 hover:border-gray-500'
                } ${isParsed ? 'cursor-default' : 'cursor-pointer'}`}
            >
                <input
                    type="file"
                    ref={fileInputRef as React.RefObject<HTMLInputElement>}
                    onChange={onFileSelect}
                    className="hidden"
                    accept=".log, .txt, .csv"
                />

                {isParsed ? (
                    <div className="text-center">
                        <p className="text-lg text-green-400">Successfully parsed {parsedLogsCount} log entries.</p>
                        <button onClick={onClear} className="mt-4 text-sm font-semibold text-primary hover:text-primary-hover">
                            Analyze another file
                        </button>
                    </div>
                ) : (
                    <div className="text-center">
                        <p className="mb-4 text-gray-400">Drag & drop a log file here, or click to select</p>
                        <button className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md">
                            Select File
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileUploader;
