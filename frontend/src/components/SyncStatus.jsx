import React from 'react';

const statusConfig = {
  'In Sync': {
    styles: 'text-green-400 bg-green-500/20 border-green-500/30',
    dotColor: 'bg-green-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22,4 12,14.01 9,11.01"></polyline>
      </svg>
    )
  },
  'Drifted': {
    styles: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
    dotColor: 'bg-yellow-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    )
  },
  'Re-syncing...': {
    styles: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
    dotColor: 'bg-blue-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
        <path d="M21 12a9 9 0 11-6.219-8.56"></path>
      </svg>
    )
  },
  'Sync failed': {
    styles: 'text-red-400 bg-red-500/20 border-red-500/30',
    dotColor: 'bg-red-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    )
  },
  'Synced': {
    styles: 'text-green-400 bg-green-500/20 border-green-500/30',
    dotColor: 'bg-green-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22,4 12,14.01 9,11.01"></polyline>
      </svg>
    )
  },
  'Still drifted': {
    styles: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
    dotColor: 'bg-orange-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
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
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22,4 12,14.01 9,11.01"></polyline>
        </svg>
      )
    };
  }
  
  // Check for cooldown messages (e.g., "Wait 1s")
  if (status.startsWith('Wait')) {
    return {
      styles: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
      dotColor: 'bg-yellow-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      )
    };
  }
  
  // Return exact match or default
  return statusConfig[status] || {
    styles: 'text-neutral-400 bg-neutral-800 border-neutral-700',
    dotColor: 'bg-neutral-400',
    icon: null
  };
};

export default function SyncStatus({ status, showIcon = true, compact = false, showSmartSuggestion = false }) {
  const config = getStatusConfig(status);

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
      
      {showSmartSuggestion && (
        <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1 animate-pulse">
          💡 Consider manual resync for better sync
        </div>
      )}
    </div>
  );
}