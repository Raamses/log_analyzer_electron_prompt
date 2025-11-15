import React from 'react';
import LogSourceCard from './LogSourceCard';

interface InputViewProps {
  onOpenFile: () => void;
  error: string;
}

const InputView: React.FC<InputViewProps> = ({ onOpenFile, error }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-full max-w-4xl p-8 bg-gray-800 rounded-lg shadow-lg text-center">
        <h2 className="text-2xl font-bold mb-4">Select a Log Source</h2>
        <p className="text-gray-400 mb-8">Choose a log file from your local machine to begin analysis.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LogSourceCard
            title="IIS Log File"
            description="Standard IIS log file format."
            onSelect={onOpenFile}
          />
          <LogSourceCard
            title="Azure APGW Log File"
            description="Azure Application Gateway access log."
            onSelect={onOpenFile}
          />
        </div>
        {error && <div className="mt-6 text-red-400 bg-red-900 p-3 rounded-lg">{error}</div>}
      </div>
    </div>
  );
};

export default InputView;
