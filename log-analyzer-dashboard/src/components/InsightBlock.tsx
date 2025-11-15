import React from 'react';

interface InsightBlockProps {
  title: string;
  metric: string;
  change: string;
  chart: React.ReactNode;
}

const InsightBlock: React.FC<InsightBlockProps> = ({ title, metric, change, chart }) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h3 className="text-md font-semibold text-gray-400">{title}</h3>
      <div className="flex items-baseline mt-2">
        <p className="text-3xl font-bold">{metric}</p>
        <p className={`text-sm ml-2 ${change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>{change}</p>
      </div>
      <div className="mt-4 h-24">{chart}</div>
    </div>
  );
};

export default InsightBlock;
