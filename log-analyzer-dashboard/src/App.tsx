import { useRef, useState, useEffect, lazy, Suspense } from 'react';
import { useLogAnalysis } from './hooks/useLogAnalysis';
import DashboardLayout from './components/DashboardLayout';
import FileUploader from './components/FileUploader';
import SummaryCard from './components/SummaryCard';
import { FilterChips } from './components/FilterChips';
import { isPrivateIp } from './utils/ipUtils';
import { Globe, Copy, Check, ExternalLink, ShieldAlert, ShieldCheck, Loader2, Lock, X } from 'lucide-react';

// Code-split: these components only render after a file is parsed (analytics && isParsed).
// Loading them lazily keeps the initial bundle under 300KB.
const ErrorSummary = lazy(() => import('./components/ErrorSummary'));
const TrafficSegmentation = lazy(() => import('./components/TrafficSegmentation'));
const ServerThroughput = lazy(() => import('./components/ServerThroughput'));
const VirtualizedLogViewer = lazy(() => import('./components/VirtualizedLogViewer'));
const StatusDistributionChart = lazy(() => import('./components/charts/StatusDistributionChart'));
const ThroughputChart = lazy(() => import('./components/charts/ThroughputChart'));
const LatencyOutliers = lazy(() => import('./components/LatencyOutliers'));

// Lazy fallback spinner
const LazyFallback = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
  </div>
);

interface GeoIpData {
    query: string;
    country?: string;
    regionName?: string;
    city?: string;
    zip?: string;
    lat?: number;
    lon?: number;
    isp?: string;
    org?: string;
    as?: string;
    isPrivate?: boolean;
}

interface CacheEntry {
    data: GeoIpData;
    timestamp: number;
}

const CACHE_KEY = 'iis_log_analyzer_geoip_cache_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const getCachedIpData = (ip: string): GeoIpData | null => {
    try {
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
            const cache: Record<string, CacheEntry> = JSON.parse(cachedRaw);
            const entry = cache[ip];
            if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
                return entry.data;
            }
        }
    } catch (e) {
        console.error('Error reading GeoIP cache', e);
    }
    return null;
};

const setCachedIpData = (ip: string, data: GeoIpData) => {
    try {
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        const cache: Record<string, CacheEntry> = cachedRaw ? JSON.parse(cachedRaw) : {};
        cache[ip] = {
            data,
            timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('Error writing GeoIP cache', e);
    }
};

const Modal = ({ title, content, onClose }: { title: string, content: string, onClose: () => void }) => (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
        <div className="glass-panel rounded-2xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden border border-slate-800/80">
            <h2 className="text-xl font-extrabold mb-3 text-slate-100 tracking-tight">{title}</h2>
            <p className="text-slate-400 mb-6 text-sm leading-relaxed">{content}</p>
            <button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 focus:outline-none transition-all cursor-pointer">
                Close
            </button>
        </div>
    </div>
);

function App() {
  const {
    logs,
    allLogs,
    analytics,
    error,
    isParsed,
    filters,
    setFilters,
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
  } = useLogAnalysis();

  const [modalInfo, setModalInfo] = useState<{ title: string; content: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GeoIP / IP Intelligence states
  const [geoIpEnabled, setGeoIpEnabled] = useState<boolean>(() => {
      return localStorage.getItem('iis_log_analyzer_geoip_enabled') === 'true';
  });
  const [selectedIpIntel, setSelectedIpIntel] = useState<string | null>(null);
  const [intelData, setIntelData] = useState<GeoIpData | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [showPrivacyConfirmForIp, setShowPrivacyConfirmForIp] = useState<string | null>(null);
  const [copiedIp, setCopiedIp] = useState(false);

  // Sync setting state to local storage
  useEffect(() => {
      localStorage.setItem('iis_log_analyzer_geoip_enabled', String(geoIpEnabled));
  }, [geoIpEnabled]);

  // Helper to derive unique status codes from ALL logs for the filter sidebar
  const allStatusCodes = Array.from(new Set(allLogs.map(l => l.statusCode))).sort();

  const handleOpenFile = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          processFile(file);
      }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
          processFile(file);
      }
  };

  const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      clearLogs();
  };

  const handleCodeClick = (code: string) => {
      const numCode = parseInt(code, 10);
      if (!isNaN(numCode)) {
          toggleStatus(numCode);
      }
  };

  // IP Geolocation fetch handler
  const handleLookupIp = async (ip: string, bypassPrivacyCheck = false) => {
      // 1. Check if IP is private
      if (isPrivateIp(ip)) {
          const privateData: GeoIpData = {
              query: ip,
              isPrivate: true,
              org: 'Internal Network / Private IP Address',
              isp: 'IANA Special-Purpose Range (RFC 1918 / Loopback)',
              country: 'Local Network',
              regionName: 'Local Range',
              city: 'Local Host',
              zip: 'N/A'
          };
          setIntelData(privateData);
          setSelectedIpIntel(ip);
          setIntelLoading(false);
          setIntelError(null);
          return;
      }

      // 2. Check if GeoIP is enabled
      if (!geoIpEnabled && !bypassPrivacyCheck) {
          setShowPrivacyConfirmForIp(ip);
          return;
      }

      // 3. Clear confirm status and kick off loading
      setShowPrivacyConfirmForIp(null);
      setSelectedIpIntel(ip);
      setIntelLoading(true);
      setIntelError(null);
      setIntelData(null);

      // 4. Check cache first
      const cached = getCachedIpData(ip);
      if (cached) {
          setIntelData(cached);
          setIntelLoading(false);
          return;
      }

      // 5. Fetch IP Intelligence
      let data: GeoIpData | null = null;
      try {
          // Attempt using HTTPS ipapi.co
          const response = await fetch(`https://ipapi.co/${ip}/json/`);
          if (response.ok) {
              const res = await response.json();
              if (!res.error) {
                  data = {
                      query: ip,
                      country: res.country_name,
                      regionName: res.region,
                      city: res.city,
                      zip: res.postal,
                      lat: res.latitude,
                      lon: res.longitude,
                      isp: res.org,
                      org: res.org,
                      as: res.asn
                  };
              }
          }
      } catch (e) {
          console.warn('ipapi.co failed, trying ip-api.com', e);
      }

      if (!data) {
          try {
              // Fallback to HTTP ip-api.com
              const response = await fetch(`http://ip-api.com/json/${ip}`);
              if (!response.ok) {
                  throw new Error(`HTTP error! Status: ${response.status}`);
              }
              const res = await response.json();
              if (res.status === 'fail') {
                  throw new Error(res.message || 'Failed to lookup IP');
              }
              data = {
                  query: ip,
                  country: res.country,
                  regionName: res.regionName,
                  city: res.city,
                  zip: res.zip,
                  lat: res.lat,
                  lon: res.lon,
                  isp: res.isp,
                  org: res.org,
                  as: res.as
              };
          } catch (err: any) {
              setIntelError(err.message || 'Failed to retrieve IP intelligence');
              setIntelLoading(false);
              return;
          }
      }

      // Save to cache and state
      if (data) {
          setCachedIpData(ip, data);
          setIntelData(data);
      }
      setIntelLoading(false);
  };

  const handleCopyIp = (ip: string) => {
      navigator.clipboard.writeText(ip);
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 2000);
  };

  const handleEnableAndLookup = (ip: string) => {
      setGeoIpEnabled(true);
      handleLookupIp(ip, true);
  };

  return (
    <DashboardLayout 
      filters={filters} 
      setFilters={setFilters} 
      allStatusCodes={allStatusCodes}
      isParsed={isParsed}
      parsedLogsCount={allLogs.length}
      onClear={clearLogs}
      geoIpEnabled={geoIpEnabled}
      onToggleGeoIp={setGeoIpEnabled}
    >
      <div className="container mx-auto">
        {modalInfo && <Modal {...modalInfo} onClose={() => setModalInfo(null)} />}
        
        {/* Privacy confirmation modal */}
        {showPrivacyConfirmForIp && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
                <div className="glass-panel rounded-2xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden border border-slate-800/80">
                    <div className="flex items-center gap-3 text-amber-400 mb-4">
                        <Lock className="w-6 h-6 flex-shrink-0" />
                        <h3 className="text-lg font-bold tracking-tight text-slate-100">IP Privacy Protection</h3>
                    </div>
                    <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                        IP Intelligence requires querying external web services (<code className="text-indigo-300 font-mono">ipapi.co</code> and <code className="text-indigo-300 font-mono">ip-api.com</code>) with the client IP address: <span className="font-mono text-indigo-200 font-bold bg-indigo-500/10 px-2 py-0.5 rounded">{showPrivacyConfirmForIp}</span>.
                        <br /><br />
                        Sending client IP addresses to public APIs may violate strict corporate compliance or privacy regulations (like GDPR or HIPAA). Do you want to enable Geolocation APIs and proceed?
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setShowPrivacyConfirmForIp(null)}
                            className="flex-1 bg-slate-900 hover:bg-slate-850 active:scale-[0.98] border border-slate-800 text-slate-300 font-bold py-2.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => handleEnableAndLookup(showPrivacyConfirmForIp)}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 focus:outline-none transition-all cursor-pointer text-sm"
                        >
                            Enable & Lookup
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Detailed IP Intelligence Modal */}
        {selectedIpIntel && (
            <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
                <div className="glass-panel rounded-2xl p-6 max-w-lg w-full shadow-2xl relative overflow-hidden border border-slate-800/80 glow-indigo flex flex-col max-h-[90vh]">
                    <button 
                        onClick={() => setSelectedIpIntel(null)}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer transition-colors p-1"
                        aria-label="Close modal"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-3 text-indigo-400 mb-6">
                        <Globe className="w-6 h-6 flex-shrink-0" />
                        <h3 className="text-xl font-extrabold tracking-tight text-slate-100 font-sans">IP Address Intelligence</h3>
                    </div>

                    <div className="flex items-center justify-between bg-slate-900/60 border border-slate-900 px-4 py-3 rounded-xl mb-6">
                        <div className="font-mono text-sm sm:text-base font-bold text-indigo-300 select-all">
                            {selectedIpIntel}
                        </div>
                        <button
                            onClick={() => handleCopyIp(selectedIpIntel)}
                            className="text-xs bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer font-semibold"
                        >
                            {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedIp ? 'Copied' : 'Copy IP'}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1">
                        {intelLoading && (
                            <div className="flex flex-col items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Fetching Geolocation details...</span>
                            </div>
                        )}

                        {intelError && (
                            <div className="py-6 text-center">
                                <ShieldAlert className="w-12 h-12 text-red-500/70 mx-auto mb-4" />
                                <div className="text-sm font-bold text-red-400 mb-2">Lookup Failed</div>
                                <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">{intelError}</p>
                                <button
                                    onClick={() => handleLookupIp(selectedIpIntel)}
                                    className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold py-2 px-4 rounded-xl text-xs cursor-pointer transition-all shadow-md"
                                >
                                    Retry Lookup
                                </button>
                            </div>
                        )}

                        {intelData && (
                            <div className="space-y-6">
                                {intelData.isPrivate ? (
                                    <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex items-start gap-3.5">
                                        <ShieldCheck className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">Local Address detected</h4>
                                            <p className="text-xs text-slate-400 leading-relaxed font-sans font-medium">
                                                This IP belongs to a private network, intranet, or loopback device. It is not publicly routable, meaning no physical location or ISP records exist.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    (() => {
                                        const isCloud = /amazon|aws|google|microsoft|azure|cloudflare|digitalocean|hetzner|oracle|alibaba|hosting|datacenter|server/i.test(intelData.isp || intelData.org || '');
                                        return (
                                            <>
                                                {isCloud && (
                                                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex items-start gap-3.5">
                                                        <ShieldCheck className="w-6 h-6 text-indigo-400 flex-shrink-0 mt-0.5" />
                                                        <div>
                                                            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1">Cloud/Hosting Provider Detected</h4>
                                                            <p className="text-xs text-slate-400 leading-relaxed font-sans font-medium">
                                                                This traffic originates from a datacenter or cloud host infrastructure, rather than a residential end-user.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-slate-900/30 border border-slate-900/60 p-3.5 rounded-xl">
                                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 font-sans">Country</div>
                                                        <div className="text-xs text-slate-200 font-bold font-mono truncate">{intelData.country || 'Unknown'}</div>
                                                    </div>
                                                    <div className="bg-slate-900/30 border border-slate-900/60 p-3.5 rounded-xl">
                                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 font-sans">Region/State</div>
                                                        <div className="text-xs text-slate-200 font-bold font-mono truncate">{intelData.regionName || 'Unknown'}</div>
                                                    </div>
                                                    <div className="bg-slate-900/30 border border-slate-900/60 p-3.5 rounded-xl">
                                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 font-sans">City</div>
                                                        <div className="text-xs text-slate-200 font-bold font-mono truncate">{intelData.city || 'Unknown'}</div>
                                                    </div>
                                                    <div className="bg-slate-900/30 border border-slate-900/60 p-3.5 rounded-xl">
                                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 font-sans">Postal / Zip</div>
                                                        <div className="text-xs text-slate-200 font-bold font-mono truncate">{intelData.zip || 'Unknown'}</div>
                                                    </div>
                                                </div>

                                                <div className="bg-slate-900/30 border border-slate-900/60 p-4 rounded-xl space-y-3.5">
                                                    <div>
                                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 font-sans">ISP Name</div>
                                                        <div className="text-xs text-indigo-200 font-bold font-mono truncate">{intelData.isp || 'Unknown'}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 font-sans">ASN / Network Org</div>
                                                        <div className="text-xs text-slate-200 font-bold font-mono truncate">{intelData.as || intelData.org || 'Unknown'}</div>
                                                    </div>
                                                </div>

                                                {intelData.lat && intelData.lon && (
                                                    <div className="flex items-center justify-between bg-slate-900/40 border border-slate-900 p-3.5 rounded-xl">
                                                        <div className="text-xs font-sans text-slate-400 font-medium">
                                                            Coords: <code className="text-indigo-300 font-mono">{intelData.lat.toFixed(4)}, {intelData.lon.toFixed(4)}</code>
                                                        </div>
                                                        <button
                                                            onClick={() => window.open(`https://www.google.com/maps?q=${intelData?.lat},${intelData?.lon}`, '_blank')}
                                                            className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-colors border border-indigo-500/20 cursor-pointer"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                            Open Maps
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()
                                )}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-slate-900 pt-4 mt-6 flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={() => {
                                toggleIp(selectedIpIntel);
                                setSelectedIpIntel(null);
                            }}
                            disabled={intelLoading}
                            className={`flex-1 bg-slate-900 hover:bg-slate-850 text-indigo-400 hover:text-indigo-300 border border-slate-800 font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                intelLoading ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            Filter by this IP
                        </button>
                        <button
                            onClick={() => window.open(`https://www.abuseipdb.com/check/${selectedIpIntel}`, '_blank')}
                            className="bg-slate-900 hover:bg-slate-850 text-red-400 hover:text-red-300 border border-slate-800 font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            AbuseIPDB Report
                        </button>
                        <button
                            onClick={() => setSelectedIpIntel(null)}
                            className="bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold py-2 px-6 rounded-xl text-xs transition-all cursor-pointer"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )}

        <header className="text-center mb-10 pt-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-slate-100 via-indigo-200 to-cyan-300 bg-clip-text text-transparent tracking-tight font-sans">
            IIS Log Analyzer
          </h1>
          <p className="text-slate-400 mt-3 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
            A premium developer analytics dashboard for deep-diving into IIS W3C and Azure Application Gateway log files.
          </p>
        </header>

        <FileUploader
          isParsed={isParsed}
          parsedLogsCount={allLogs.length}
          onOpenFile={handleOpenFile}
          onClear={handleClear}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onFileSelect={handleFileSelect}
          isDragging={isDragging}
          fileInputRef={fileInputRef}
          isLoading={isLoading}
          loadingStage={loadingStage}
          loadingFile={loadingFile}
          loadingProgress={loadingProgress}
      />

      {analytics && isParsed && (
        <div className="mt-6">
          <FilterChips
            filters={filters}
            allLogs={allLogs}
            onClearSearch={() => setFilters(prev => ({ ...prev, search: '' }))}
            onClearStatus={toggleStatus}
            onClearTimeRange={() => setFilters(prev => ({ ...prev, timeRange: [allLogs[0].timestamp, allLogs[allLogs.length - 1].timestamp] }))}
            onClearIp={() => setFilters(prev => ({ ...prev, selectedIp: null }))}
            onClearEndpoint={() => setFilters(prev => ({ ...prev, selectedEndpoint: null }))}
            onClearHotelCode={() => setFilters(prev => ({ ...prev, selectedHotelCode: null }))}
            onClearComposition={() => setFilters(prev => ({ ...prev, selectedComposition: null }))}
            onClearDeviceCategory={() => setFilters(prev => ({ ...prev, selectedDeviceCategory: null }))}
            onClearStayCategory={() => setFilters(prev => ({ ...prev, selectedStayCategory: null }))}
            onClearOccupancyProfile={() => setFilters(prev => ({ ...prev, selectedOccupancyProfile: null }))}
            onResetAll={clearAllFilters}
          />
        </div>
      )}

      {error && <div className="mt-6 text-center text-red-400 bg-red-950/40 border border-red-900/20 p-4 rounded-2xl font-mono text-sm">{error}</div>}

      {analytics && isParsed && (
        <main className="mt-8">
          <Suspense fallback={<LazyFallback />}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SummaryCard title="Total Requests" value={analytics.totalRequests} />
            <SummaryCard title="Log Time Span" value={analytics.timeSpan} unit="min" />
            <ErrorSummary analytics={analytics} onCodeClick={handleCodeClick} />
            <TrafficSegmentation
              analytics={analytics}
              activeIp={filters.selectedIp}
              activeEndpoint={filters.selectedEndpoint}
              activeHotelCode={filters.selectedHotelCode}
              activeComposition={filters.selectedComposition}
              activeDeviceCategory={filters.selectedDeviceCategory}
              activeStayCategory={filters.selectedStayCategory}
              activeOccupancyProfile={filters.selectedOccupancyProfile}
              onToggleIp={toggleIp}
              onToggleEndpoint={toggleEndpoint}
              onToggleHotelCode={toggleHotelCode}
              onToggleComposition={toggleComposition}
              onToggleDeviceCategory={toggleDeviceCategory}
              onToggleStayCategory={toggleStayCategory}
              onToggleOccupancyProfile={toggleOccupancyProfile}
              onLookupIp={handleLookupIp}
            />
            <ServerThroughput analytics={analytics} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <StatusDistributionChart
              data={analytics.errorCodes}
              activeStatusCodes={filters.statusCodes}
              onSliceClick={toggleStatus}
            />
            <ThroughputChart
              data={analytics.timeSeriesData}
              timeRange={filters.timeRange}
              onRangeChange={(range) => setFilters(prev => ({ ...prev, timeRange: range }))}
            />
          </div>

          {analytics.performanceAnomalies && (
            <div className="mt-6">
              <LatencyOutliers
                anomalies={analytics.performanceAnomalies}
                onToggleIp={toggleIp}
                onToggleEndpoint={toggleEndpoint}
                onLookupIp={handleLookupIp}
              />
            </div>
          )}

          <div className="mt-8 glass-panel p-6 rounded-2xl">
            <div className="mb-4">
              <h2 className="text-lg font-bold tracking-tight text-white">Log Viewer Console</h2>
              <p className="text-xs text-slate-400 mt-1">Monospace terminal trace of all filtered transaction records</p>
            </div>
            <VirtualizedLogViewer
              logs={logs}
              onToggleIp={toggleIp}
              onLookupIp={handleLookupIp}
            />
          </div>
          </Suspense>
        </main>
      )}
      </div>
    </DashboardLayout>
  );
}

export default App;

