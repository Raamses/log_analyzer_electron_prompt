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
}

const FileUploader: React.FC<FileUploaderProps> = ({ isParsed, parsedLogsCount, onOpenFile, onClear, onDragOver, onDragLeave, onDrop, isDragging }) => {
    return (
        <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative group bg-card border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${isDragging ? 'border-primary bg-primary/10' : 'border-border/50 hover:border-primary'}`}
        >
            {isParsed ? (
                <div className="flex flex-col items-center justify-center h-full">
                    <p className="text-lg text-success font-semibold">Successfully parsed {parsedLogsCount} log entries.</p>
                    <button onClick={onClear} className="mt-4 bg-primary text-primary-foreground font-bold py-2 px-4 rounded-md hover:bg-primary/90 transition-colors">
                        Analyze another file
                    </button>
                </div>
            ) : (
                <div onClick={onOpenFile} className="cursor-pointer">
                    <p className="text-muted-foreground mb-4">Drag & drop a log file here, or click to select</p>
                    <button className="bg-secondary text-secondary-foreground font-bold py-3 px-6 rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        Select File
                    </button>
                </div>
            )}
        </div>
    );
};

export default FileUploader;
