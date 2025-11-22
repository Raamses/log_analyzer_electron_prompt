import { useState, useMemo, useEffect } from 'react';
import { parseLogs, type LogEntry } from '../utils/parser';
import { analyzeLogs } from '../utils/analytics';

export interface FilterState {
  search: string;
  statusCodes: number[];
  timeRange: [Date | null, Date | null];
}

export const useLogAnalysis = () => {
  const [rawContent, setRawContent] = useState('');
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const [isParsed, setIsParsed] = useState(false);

  // Filter State
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    statusCodes: [],
    timeRange: [null, null],
  });

  // Parse Logs when content changes
  useEffect(() => {
    if (rawContent) {
      const { logs, error } = parseLogs(rawContent);
      setParsedLogs(logs);
      setError(error);
      setIsParsed(logs.length > 0);

      // Reset filters on new file load
      if (logs.length > 0) {
        const sorted = [...logs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        setFilters({
            search: '',
            statusCodes: [],
            timeRange: [sorted[0].timestamp, sorted[sorted.length - 1].timestamp]
        });
      }
    } else {
      setParsedLogs([]);
      setIsParsed(false);
      setError('');
    }
  }, [rawContent]);

  // Filter Logs
  const filteredLogs = useMemo(() => {
    if (!isParsed) return [];

    return parsedLogs.filter(log => {
      // Search Filter (URI or IP)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!log.uriStem.toLowerCase().includes(searchLower) && !log.clientIp.includes(searchLower)) {
          return false;
        }
      }

      // Status Code Filter
      if (filters.statusCodes.length > 0 && !filters.statusCodes.includes(log.statusCode)) {
        return false;
      }

      // Time Range Filter
      if (filters.timeRange[0] && log.timestamp < filters.timeRange[0]) return false;
      if (filters.timeRange[1] && log.timestamp > filters.timeRange[1]) return false;

      return true;
    });
  }, [parsedLogs, isParsed, filters]);

  // Analyze All Parsed Logs for dashboard stats
  const analytics = useMemo(() => analyzeLogs(parsedLogs), [parsedLogs]);

  // Function to update raw content (from file upload)
  const processFileContent = (content: string) => {
    setRawContent(content);
  };

  const clearLogs = () => {
    setRawContent('');
  };

  return {
    logs: filteredLogs,
    allLogs: parsedLogs,
    analytics,
    error,
    isParsed,
    filters,
    setFilters,
    processFileContent,
    clearLogs
  };
};
