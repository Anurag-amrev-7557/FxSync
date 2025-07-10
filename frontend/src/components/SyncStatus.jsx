import React from 'react';

const statusConfig = {
  'In Sync': {
    styles: 'text-green-400 bg-green-500/20 border-green-500/30',
    dotColor: 'bg-green-400',
    quality: 'excellent',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        <path d="M9 12l2 2 4-4"/>
        <path d="M12 6v6"/>
        <path d="M12 18v-2"/>
      </svg>
    )
  },
  'Drifted': {
    styles: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
    dotColor: 'bg-yellow-400',
    quality: 'warning',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
        <path d="M8 12h8"/>
        <path d="M12 8v8"/>
      </svg>
    )
  },
  'Re-syncing...': {
    styles: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
    dotColor: 'bg-blue-400',
    quality: 'syncing',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
        <path d="M21 2v6h-6"/>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
        <path d="M3 22v-6h6"/>
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
      </svg>
    )
  },
  'Sync failed': {
    styles: 'text-red-400 bg-red-500/20 border-red-500/30',
    dotColor: 'bg-red-400',
    quality: 'error',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
        <circle cx="12" cy="12" r="10"/>
        <path d="M15 9l-6 6"/>
        <path d="M9 9l6 6"/>
        <path d="M12 2v4"/>
        <path d="M12 18v4"/>
        <path d="M4.93 4.93l2.83 2.83"/>
        <path d="M16.24 16.24l2.83 2.83"/>
      </svg>
    )
  },
  'Synced': {
    styles: 'text-green-400 bg-green-500/20 border-green-500/30',
    dotColor: 'bg-green-400',
    quality: 'excellent',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        <path d="M9 12l2 2 4-4"/>
        <path d="M12 6v6"/>
        <path d="M12 18v-2"/>
        <path d="M6 12h2"/>
        <path d="M16 12h2"/>
      </svg>
    )
  },
  'Still drifted': {
    styles: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
    dotColor: 'bg-orange-400',
    quality: 'poor',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        <path d="M8 12h8"/>
        <path d="M12 8v8"/>
        <path d="M9 9l6 6"/>
        <path d="M15 9l-6 6"/>
      </svg>
    )
  },
  'Auto-resyncing...': {
    styles: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
    dotColor: 'bg-purple-400',
    quality: 'syncing',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        <path d="M12 6v6l4 2"/>
        <path d="M8 12h8"/>
        <path d="M12 8v8"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    )
  }
};

// Helper function to determine status config based on status text
const getStatusConfig = (status) => {
  // Check for improvement messages (e.g., "Improved 0.123s")
  if (status.startsWith('Improved')) {
    return {
      styles: 'text-green-400 bg-green-500/20 border-green-500/30',
      dotColor: 'bg-green-400',
      quality: 'excellent',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M9 12l2 2 4-4"/>
          <path d="M12 6v6"/>
          <path d="M12 18v-2"/>
          <path d="M6 12h2"/>
          <path d="M16 12h2"/>
        </svg>
      )
    };
  }
  
  // Check for cooldown messages (e.g., "Wait 1s")
  if (status.startsWith('Wait')) {
    return {
      styles: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
      dotColor: 'bg-yellow-400',
      quality: 'warning',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
          <path d="M8 12h8"/>
          <path d="M12 8v8"/>
        </svg>
      )
    };
  }
  
  // Return exact match or default
  return statusConfig[status] || {
    styles: 'text-neutral-400 bg-neutral-800 border-neutral-700',
    dotColor: 'bg-neutral-400',
    quality: 'unknown',
    icon: null
  };
};

// Device type icons configuration
const deviceTypeIcons = {
  'mobile': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
      <path d="M8 6h8"/>
      <path d="M8 10h8"/>
      <path d="M8 14h4"/>
    </svg>
  ),
  'tablet': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
      <path d="M6 6h12"/>
      <path d="M6 10h12"/>
      <path d="M6 14h8"/>
    </svg>
  ),
  'desktop': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
      <path d="M4 7h16"/>
      <path d="M4 11h16"/>
      <path d="M4 15h8"/>
    </svg>
  ),
  'laptop': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="2" y1="14" x2="22" y2="14"/>
      <path d="M4 7h16"/>
      <path d="M4 11h16"/>
      <path d="M4 15h8"/>
    </svg>
  ),
  'tv': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
      <polyline points="17,2 12,7 7,2"/>
      <path d="M4 11h16"/>
      <path d="M4 15h16"/>
      <path d="M4 19h8"/>
    </svg>
  ),
  'smartphone': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
      <circle cx="12" cy="6" r="1"/>
      <path d="M8 10h8"/>
      <path d="M8 14h8"/>
    </svg>
  ),
  'unknown': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
};

// Network quality icons configuration
const networkQualityIcons = {
  'excellent': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v6"/>
      <path d="M12 17v6"/>
      <path d="M4.22 4.22l4.24 4.24"/>
      <path d="M15.54 15.54l4.24 4.24"/>
      <path d="M1 12h6"/>
      <path d="M17 12h6"/>
    </svg>
  ),
  'good': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v6"/>
      <path d="M12 17v6"/>
      <path d="M4.22 4.22l4.24 4.24"/>
      <path d="M15.54 15.54l4.24 4.24"/>
    </svg>
  ),
  'fair': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v6"/>
      <path d="M12 17v6"/>
    </svg>
  ),
  'poor': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  'wifi': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
      <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  ),
  'ethernet': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 21h10"/>
      <path d="M17 21v-4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4"/>
      <path d="M7 3h10"/>
      <path d="M17 3v4a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V3"/>
      <path d="M3 7h18"/>
      <path d="M3 11h18"/>
      <path d="M3 15h18"/>
    </svg>
  ),
  'cellular': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      <path d="M6 12h4"/>
      <path d="M14 12h4"/>
      <path d="M18 12h4"/>
    </svg>
  ),
  'unknown': (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
};

// Helper function to get device type icon
const getDeviceTypeIcon = (deviceType) => {
  const normalizedType = deviceType?.toLowerCase() || 'unknown';
  return deviceTypeIcons[normalizedType] || deviceTypeIcons.unknown;
};

// Helper function to get network quality icon
const getNetworkQualityIcon = (networkQuality) => {
  const normalizedQuality = networkQuality?.toLowerCase() || 'unknown';
  return networkQualityIcons[normalizedQuality] || networkQualityIcons.unknown;
};

// Helper function to get sync quality indicator
const getSyncQualityIndicator = (quality, rtt, jitter, drift) => {
  if (quality === 'excellent') return { color: 'text-green-400', label: 'Excellent' };
  if (quality === 'warning') return { color: 'text-yellow-400', label: 'Fair' };
  if (quality === 'poor') return { color: 'text-red-400', label: 'Poor' };
  if (quality === 'syncing') return { color: 'text-blue-400', label: 'Syncing' };
  if (quality === 'error') return { color: 'text-red-400', label: 'Error' };
  
  // Calculate quality based on metrics if available
  if (rtt !== null && jitter !== null && drift !== null) {
    if (rtt < 30 && jitter < 10 && drift < 10) return { color: 'text-green-400', label: 'Excellent' };
    if (rtt < 80 && jitter < 25 && drift < 25) return { color: 'text-yellow-400', label: 'Fair' };
    return { color: 'text-red-400', label: 'Poor' };
  }
  
  return { color: 'text-neutral-400', label: 'Unknown' };
};

export default function SyncStatus({ 
  status, 
  showIcon = true, 
  compact = false, 
  showSmartSuggestion = false,
  rtt = null,
  jitter = null,
  drift = null,
  deviceType = null,
  networkQuality = null,
  showMetrics = false,
  mlInsights = null
}) {
  const config = getStatusConfig(status);
  const qualityIndicator = getSyncQualityIndicator(config.quality, rtt, jitter, drift);

  return (
    <div className="flex flex-col gap-1">
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium border transition-all duration-300 hover:scale-105 animate-fade-in-fast ${config.styles}`}>
        {showIcon && config.icon && (
          <div className="flex-shrink-0">
            {config.icon}
          </div>
        )}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dotColor}`}></div>
        {!compact && <span className="font-medium">{status}</span>}
      </div>
      
      {/* Enhanced sync quality indicator */}
      {showMetrics && (
        <div className="flex flex-col gap-1 text-xs">
          <div className={`font-medium ${qualityIndicator.color}`}>
            Sync Quality: {qualityIndicator.label}
          </div>
          
          {/* Device and network info */}
          {(deviceType || networkQuality) && (
            <div className="flex items-center gap-3 text-neutral-400">
              {deviceType && (
                <div className="flex items-center gap-1">
                  <div className="flex-shrink-0">
                    {getDeviceTypeIcon(deviceType)}
                  </div>
                  <span className="text-xs">{deviceType}</span>
                </div>
              )}
              {networkQuality && (
                <div className="flex items-center gap-1">
                  <div className="flex-shrink-0">
                    {getNetworkQualityIcon(networkQuality)}
                  </div>
                  <span className="text-xs">{networkQuality}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {rtt !== null && (
              <div className="text-neutral-400">
                RTT: <span className={rtt < 50 ? 'text-green-400' : rtt < 100 ? 'text-yellow-400' : 'text-red-400'}>
                  {rtt.toFixed(0)}ms
                </span>
              </div>
            )}
            {jitter !== null && (
              <div className="text-neutral-400">
                Jitter: <span className={jitter < 15 ? 'text-green-400' : jitter < 30 ? 'text-yellow-400' : 'text-red-400'}>
                  {jitter.toFixed(1)}ms
                </span>
              </div>
            )}
            {drift !== null && (
              <div className="text-neutral-400">
                Drift: <span className={Math.abs(drift) < 50 ? 'text-green-400' : Math.abs(drift) < 100 ? 'text-yellow-400' : 'text-red-400'}>
                  {drift.toFixed(0)}ms
                </span>
              </div>
            )}
          </div>
          
          {/* ML Insights */}
          {mlInsights && (
            <div className="mt-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded text-xs">
              <div className="flex items-center gap-1 text-purple-400 font-medium mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                  <path d="M9 12l2 2 4-4"/>
                  <path d="M12 6v6"/>
                  <path d="M12 18v-2"/>
                </svg>
                ML Insights
              </div>
              <div className="grid grid-cols-2 gap-1 text-neutral-400">
                {mlInsights.predictionModels > 0 && (
                  <div>Models: <span className="text-purple-400">{mlInsights.predictionModels}</span></div>
                )}
                {mlInsights.avgPredictionConfidence > 0 && (
                  <div>Confidence: <span className={mlInsights.avgPredictionConfidence > 0.7 ? 'text-green-400' : mlInsights.avgPredictionConfidence > 0.4 ? 'text-yellow-400' : 'text-red-400'}>
                    {(mlInsights.avgPredictionConfidence * 100).toFixed(0)}%
                  </span></div>
                )}
                {Object.keys(mlInsights.detectedPatterns || {}).length > 0 && (
                  <div>Patterns: <span className="text-purple-400">{Object.keys(mlInsights.detectedPatterns).length}</span></div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {showSmartSuggestion && (
        <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1 animate-pulse">
          💡 Consider manual resync for better sync
        </div>
      )}
    </div>
  );
}