import React, { useState } from 'react';

export default function ResyncAnalytics({ resyncHistory, resyncStats, isVisible = false }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isVisible || resyncHistory.length === 0) {
    return null;
  }

  const getResultColor = (result) => {
    switch (result) {
      case 'success': return 'text-green-400';
      case 'partial': return 'text-orange-400';
      case 'failed': return 'text-red-400';
      default: return 'text-neutral-400';
    }
  };

  const getResultIcon = (result) => {
    switch (result) {
      case 'success':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22,4 12,14.01 9,11.01"></polyline>
          </svg>
        );
      case 'partial':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        );
      case 'failed':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        );
      default:
        return null;
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  const successRate = resyncStats.totalResyncs > 0 
    ? Math.round((resyncStats.successfulResyncs / resyncStats.totalResyncs) * 100) 
    : 0;

  return (
    <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-white">Resync Analytics</h4>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-neutral-400 hover:text-white transition-colors"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6,9 12,15 18,9"></polyline>
          </svg>
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="text-center">
          <div className="text-white font-medium">{resyncStats.totalResyncs}</div>
          <div className="text-neutral-400">Total</div>
        </div>
        <div className="text-center">
          <div className="text-green-400 font-medium">{successRate}%</div>
          <div className="text-neutral-400">Success</div>
        </div>
        <div className="text-center">
          <div className="text-neutral-400 font-medium">{resyncStats.averageDrift}s</div>
          <div className="text-neutral-400">Avg Drift</div>
        </div>
      </div>

      {/* Detailed History */}
      {isExpanded && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {resyncHistory.map((entry, index) => (
            <div key={index} className="flex items-center justify-between text-xs bg-neutral-800/50 rounded p-2">
              <div className="flex items-center gap-2">
                <div className={`${getResultColor(entry.result)}`}>
                  {getResultIcon(entry.result)}
                </div>
                <div>
                  <div className="text-white">{entry.message}</div>
                  <div className="text-neutral-400">{formatTimeAgo(entry.timestamp)}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-neutral-300">{entry.drift}s</div>
                <div className="text-neutral-500">{entry.duration}ms</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 