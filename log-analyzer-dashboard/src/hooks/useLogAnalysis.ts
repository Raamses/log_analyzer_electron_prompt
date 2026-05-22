import { useState, useMemo } from 'react';
import { parseLogs, type LogEntry, getStayCategory, getOccupancyProfile } from '../utils/parser';
import { analyzeLogs } from '../utils/analytics';

export interface FilterState {
  search: string;
  statusCodes: number[];
  timeRange: [Date | null, Date | null];
  selectedIp: string | null;
  selectedEndpoint: string | null;
  selectedHotelCode: string | null;
  selectedComposition: string | null;
  selectedDeviceCategory: string | null;
  selectedStayCategory: string | null;
  selectedOccupancyProfile: string | null;
}

const matchLog = (
  log: LogEntry,
  filters: FilterState,
  excludeKey?: 'search' | 'statusCodes' | 'timeRange' | 'selectedIp' | 'selectedEndpoint' | 'selectedHotelCode' | 'selectedComposition' | 'selectedDeviceCategory' | 'selectedStayCategory' | 'selectedOccupancyProfile'
): boolean => {
  // Search Filter (URI or IP)
  if (excludeKey !== 'search' && filters.search) {
    const searchLower = filters.search.toLowerCase();
    if (!log.uriStem.toLowerCase().includes(searchLower) && !log.clientIp.includes(searchLower)) {
      return false;
    }
  }

  // Status Code Filter
  if (excludeKey !== 'statusCodes' && filters.statusCodes.length > 0) {
    if (!filters.statusCodes.includes(log.statusCode)) {
      return false;
    }
  }

  // Time Range Filter
  if (excludeKey !== 'timeRange') {
    if (filters.timeRange[0] && log.timestamp < filters.timeRange[0]) return false;
    if (filters.timeRange[1] && log.timestamp > filters.timeRange[1]) return false;
  }

  // Client IP Filter
  if (excludeKey !== 'selectedIp' && filters.selectedIp) {
    if (log.clientIp !== filters.selectedIp) return false;
  }

  // Endpoint Filter
  if (excludeKey !== 'selectedEndpoint' && filters.selectedEndpoint) {
    if (log.uriStem !== filters.selectedEndpoint) return false;
  }

  // Hotel Code Filter
  if (excludeKey !== 'selectedHotelCode' && filters.selectedHotelCode) {
    if (log.hotelCode !== filters.selectedHotelCode) return false;
  }

  // Composition Filter
  if (excludeKey !== 'selectedComposition' && filters.selectedComposition) {
    if (log.composition !== filters.selectedComposition) return false;
  }

  // Device Category Filter
  if (excludeKey !== 'selectedDeviceCategory' && filters.selectedDeviceCategory) {
    if (log.deviceCategory !== filters.selectedDeviceCategory) return false;
  }

  // Stay Category Filter
  if (excludeKey !== 'selectedStayCategory' && filters.selectedStayCategory) {
    if (getStayCategory(log.stayDuration) !== filters.selectedStayCategory) return false;
  }

  // Occupancy Profile Filter
  if (excludeKey !== 'selectedOccupancyProfile' && filters.selectedOccupancyProfile) {
    if (getOccupancyProfile(log.composition, log.totalGuests, log.childrenPresent) !== filters.selectedOccupancyProfile) return false;
  }

  return true;
};

export const useLogAnalysis = () => {
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const [isParsed, setIsParsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'reading' | 'parsing' | null>(null);
  const [loadingFile, setLoadingFile] = useState<{ name: string; size: string } | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Filter State
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    statusCodes: [],
    timeRange: [null, null],
    selectedIp: null,
    selectedEndpoint: null,
    selectedHotelCode: null,
    selectedComposition: null,
    selectedDeviceCategory: null,
    selectedStayCategory: null,
    selectedOccupancyProfile: null,
  });

  // Filter Logs
  const filteredLogs = useMemo(() => {
    if (!isParsed) return [];
    return parsedLogs.filter(log => matchLog(log, filters));
  }, [parsedLogs, isParsed, filters]);

  // Dual-dataset: Filtered by all criteria EXCEPT Status Code
  const filteredLogsExceptStatus = useMemo(() => {
    if (!isParsed) return [];
    return parsedLogs.filter(log => matchLog(log, filters, 'statusCodes'));
  }, [parsedLogs, isParsed, filters]);

  // Dual-dataset: Filtered by all criteria EXCEPT Time Range
  const filteredLogsExceptTimeRange = useMemo(() => {
    if (!isParsed) return [];
    return parsedLogs.filter(log => matchLog(log, filters, 'timeRange'));
  }, [parsedLogs, isParsed, filters]);

  // Analyze Filtered Logs
  const analytics = useMemo(() => {
    const baseAnalytics = analyzeLogs(filteredLogs);
    if (!baseAnalytics) return null;

    // Use dual-dataset for status distribution (errorCodes) and throughput (timeSeriesData)
    const statusData = analyzeLogs(filteredLogsExceptStatus);
    const throughputData = analyzeLogs(filteredLogsExceptTimeRange);

    return {
      ...baseAnalytics,
      errorCodes: statusData ? statusData.errorCodes : {},
      timeSeriesData: throughputData ? throughputData.timeSeriesData : [],
    };
  }, [filteredLogs, filteredLogsExceptStatus, filteredLogsExceptTimeRange]);

  // Helper functions for updating filters
  const toggleStatus = (code: number) => {
    setFilters(prev => ({
      ...prev,
      statusCodes: prev.statusCodes.includes(code)
        ? prev.statusCodes.filter(c => c !== code)
        : [...prev.statusCodes, code]
    }));
  };

  const toggleIp = (ip: string) => {
    setFilters(prev => ({
      ...prev,
      selectedIp: prev.selectedIp === ip ? null : ip
    }));
  };

  const toggleEndpoint = (endpoint: string) => {
    setFilters(prev => ({
      ...prev,
      selectedEndpoint: prev.selectedEndpoint === endpoint ? null : endpoint
    }));
  };

  const toggleHotelCode = (code: string) => {
    setFilters(prev => ({
      ...prev,
      selectedHotelCode: prev.selectedHotelCode === code ? null : code
    }));
  };

  const toggleComposition = (comp: string) => {
    setFilters(prev => ({
      ...prev,
      selectedComposition: prev.selectedComposition === comp ? null : comp
    }));
  };

  const toggleDeviceCategory = (category: string) => {
    setFilters(prev => ({
      ...prev,
      selectedDeviceCategory: prev.selectedDeviceCategory === category ? null : category
    }));
  };

  const toggleStayCategory = (category: string) => {
    setFilters(prev => ({
      ...prev,
      selectedStayCategory: prev.selectedStayCategory === category ? null : category
    }));
  };

  const toggleOccupancyProfile = (profile: string) => {
    setFilters(prev => ({
      ...prev,
      selectedOccupancyProfile: prev.selectedOccupancyProfile === profile ? null : profile
    }));
  };

  const clearAllFilters = () => {
    if (parsedLogs.length > 0) {
      setFilters({
        search: '',
        statusCodes: [],
        timeRange: [parsedLogs[0].timestamp, parsedLogs[parsedLogs.length - 1].timestamp],
        selectedIp: null,
        selectedEndpoint: null,
        selectedHotelCode: null,
        selectedComposition: null,
        selectedDeviceCategory: null,
        selectedStayCategory: null,
        selectedOccupancyProfile: null
      });
    } else {
      setFilters({
        search: '',
        statusCodes: [],
        timeRange: [null, null],
        selectedIp: null,
        selectedEndpoint: null,
        selectedHotelCode: null,
        selectedComposition: null,
        selectedDeviceCategory: null,
        selectedStayCategory: null,
        selectedOccupancyProfile: null
      });
    }
  };

  // Function to update raw content (from file upload)
  const processFileContent = (content: string) => {
    setIsLoading(true);
    setLoadingStage('parsing');
    setLoadingFile({ name: 'Raw Log Input', size: `${(content.length / (1024 * 1024)).toFixed(1)} MB` });
    setError('');
    setParsedLogs([]);
    setIsParsed(false);

    setTimeout(() => {
      try {
        const { logs, error: parseError } = parseLogs(content);
        const sorted = [...logs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        setParsedLogs(sorted);
        setError(parseError);
        setIsParsed(sorted.length > 0);

        if (sorted.length > 0) {
          setFilters({
              search: '',
              statusCodes: [],
              timeRange: [sorted[0].timestamp, sorted[sorted.length - 1].timestamp],
              selectedIp: null,
              selectedEndpoint: null,
              selectedHotelCode: null,
              selectedComposition: null,
              selectedDeviceCategory: null,
              selectedStayCategory: null,
              selectedOccupancyProfile: null,
          });
        }
      } catch (err: any) {
        setError(err.message || 'Error parsing log content');
      } finally {
        setIsLoading(false);
        setLoadingStage(null);
      }
    }, 50);
  };

  const processFile = (file: File) => {
    setIsLoading(true);
    setLoadingStage('reading');
    setLoadingProgress(0);
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    setLoadingFile({ name: file.name, size: `${sizeInMB} MB` });
    setError('');
    setParsedLogs([]);
    setIsParsed(false);

    const worker = new Worker(
      new URL('../workers/logParser.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setLoadingStage(msg.stage as 'reading' | 'parsing');
        setLoadingProgress(msg.progress ?? 0);
      } else if (msg.type === 'done') {
        // Convert compact wire format back to full LogEntry with Date objects
        const sorted: LogEntry[] = (msg.logs as Array<{
          ts: number;
          uri: string;
          sc: number;
          tt: number;
          ip: string;
          method?: string;
          uaIdx?: number;
          scb?: number;
          csb?: number;
          hc?: string | null;
          comp?: string | null;
          sd?: number | null;
          tg?: number | null;
          cp?: boolean | null;
        }>).map(w => {
          const entry: LogEntry = {
            timestamp: new Date(w.ts),
            uriStem: w.uri,
            statusCode: w.sc,
            timeTaken: w.tt,
            clientIp: w.ip,
            method: w.method,
            hotelCode: w.hc,
            composition: w.comp,
            stayDuration: w.sd,
            totalGuests: w.tg,
            childrenPresent: w.cp,
            scBytes: w.scb,
            csBytes: w.csb,
          };
          if (w.uaIdx !== undefined && msg.uaDictionary && msg.uaDictionary[w.uaIdx]) {
            entry.userAgent = msg.uaDictionary[w.uaIdx].raw;
            entry.deviceCategory = msg.uaDictionary[w.uaIdx].category;
          }
          return entry;
        });

        // Already sorted by worker — no re-sort needed
        setParsedLogs(sorted);
        setIsParsed(sorted.length > 0);
        setError(sorted.length === 0 ? 'Successfully parsed, but no valid log entries were found.' : '');
        if (sorted.length > 0) {
          setFilters({
            search: '',
            statusCodes: [],
            timeRange: [sorted[0].timestamp, sorted[sorted.length - 1].timestamp],
            selectedIp: null,
            selectedEndpoint: null,
            selectedHotelCode: null,
            selectedComposition: null,
            selectedDeviceCategory: null,
            selectedStayCategory: null,
            selectedOccupancyProfile: null,
          });
        }
        setIsLoading(false);
        setLoadingStage(null);
        worker.terminate();
      } else if (msg.type === 'error') {
        setError(msg.error);
        setIsLoading(false);
        setLoadingStage(null);
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      setError(err.message || 'Error processing log file');
      setIsLoading(false);
      setLoadingStage(null);
      worker.terminate();
    };

    worker.postMessage(file);
  };

  const clearLogs = () => {
    setParsedLogs([]);
    setIsParsed(false);
    setError('');
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
    processFile,
    clearLogs,
    toggleStatus,
    toggleIp,
    toggleEndpoint,
    toggleHotelCode,
    toggleComposition,
    toggleDeviceCategory,
    toggleStayCategory,
    toggleOccupancyProfile,
    clearAllFilters,
    isLoading,
    loadingStage,
    loadingFile,
    loadingProgress
  };
};
