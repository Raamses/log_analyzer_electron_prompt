import React from 'react';

interface InsightBlockProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

const InsightBlock = ({ title, children, className }: InsightBlockProps) => (
  <div className={`bg-gray-800/50 border border-gray-700 rounded-2xl shadow-lg backdrop-blur-sm ${className}`}>
    <div className="p-6">
      <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
      {children}
    </div>
  </div>
);

export default InsightBlock;
