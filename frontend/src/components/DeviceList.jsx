import React, { useState, useEffect } from 'react';
import { useStaggeredAnimation } from '../hooks/useSmoothAppearance';

const DeviceList = React.memo(function DeviceList({ clients = [], controllerClientId, clientId, socket, mobile = false, isAudioTabActive = false }) {
  const isController = controllerClientId && clientId && controllerClientId === clientId;
  const [shouldAnimate, setShouldAnimate] = useState(false);
  
  // Smooth staggered animation for client list
  const clientAnimations = useStaggeredAnimation(clients, 50, 'animate-slide-in-left');

  // Trigger animation for mobile device list
  useEffect(() => {
    if (mobile) {
      // Small delay to ensure the component is mounted
      const timer = setTimeout(() => {
        setShouldAnimate(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mobile]);

  // Trigger animation when audio tab becomes active
  useEffect(() => {
    if (mobile && isAudioTabActive) {
      setShouldAnimate(false);
      const timer = setTimeout(() => {
        setShouldAnimate(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [mobile, isAudioTabActive]);

  const handleOfferController = (targetClientId) => {
    if (!socket || !isController) return;
    
    socket.emit('offer_controller', { 
      sessionId: socket.sessionId, 
      targetClientId 
    }, (res) => {
      if (res && res.success) {
        // Success - the target will receive the offer
        console.log('Controller offer sent successfully');
      } else {
        console.warn('Failed to send controller offer:', res);
      }
    });
  };

  // --- MOBILE LAYOUT ---
  if (mobile) {
    return (
      <div className={`space-y-2 px-2 pt-2 pb-4 ${shouldAnimate ? 'animate-slide-down-from-top' : 'opacity-0 -translate-y-full'}`}>
        {/* Sticky header for mobile */}
        <div className="sticky top-0 z-20 bg-neutral-900/80 backdrop-blur border-b border-neutral-800 flex items-center gap-2 px-2 py-2 rounded-t-xl shadow-md">
          <div className="w-7 h-7 bg-neutral-800 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold text-base leading-tight">Devices</h3>
            <p className="text-neutral-400 text-xs">{clients.length} device{clients.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {/* Device List */}
        <div className="bg-neutral-900/80 rounded-xl border border-neutral-800 overflow-hidden shadow-lg">
          {clients.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                </svg>
              </div>
              <p className="text-neutral-400 text-sm">No devices connected</p>
              <p className="text-neutral-500 text-xs mt-1">Share the room code to invite others</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {clients.map((c, index) => (
                <li
                  key={c.id}
                  className={`flex items-center px-3 py-3 transition-all duration-300 group gap-3 ${
                    c.clientId === controllerClientId ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-neutral-800/60'
                  } ${clientAnimations[index]?.animationClass || ''}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    c.clientId === controllerClientId ? 'bg-primary/20' : 'bg-neutral-800'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={
                      c.clientId === controllerClientId ? 'text-primary' : 'text-neutral-400'
                    }>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm truncate ${
                        c.clientId === controllerClientId ? 'text-primary' : 'text-white'
                      }`}>
                        {c.displayName || c.clientId || c.id}
                      </span>
                      {c.clientId === clientId && (
                        <span className="px-1.5 py-0.5 bg-neutral-700 text-neutral-300 rounded text-xs ml-1">You</span>
                      )}
                    </div>
                    <p className="text-neutral-400 text-xs truncate">
                      {c.deviceInfo || 'Unknown device'}
                    </p>
                  </div>
                  {c.clientId === controllerClientId ? (
                    <div className="flex flex-col items-end gap-1 ml-2">
                      <span className="px-2 py-1 bg-primary/20 border border-primary/30 rounded text-xs text-primary font-medium">Controller</span>
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    </div>
                  ) : isController && (
                    <button
                      onClick={() => handleOfferController(c.clientId)}
                      className="ml-2 px-3 py-1.5 bg-gradient-to-r from-neutral-900/90 via-neutral-800/80 to-neutral-900/90 hover:from-neutral-800/95 hover:via-neutral-700/90 hover:to-neutral-800/95 text-neutral-300 hover:text-white text-xs font-semibold rounded-lg transition-all duration-500 hover:scale-105 flex items-center gap-2 shadow-lg border border-neutral-700/40 hover:border-neutral-600/60 backdrop-blur-md"
                      title={`Offer controller role to ${c.displayName || c.clientId}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 group-hover:text-white transition-all duration-500">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                        <path d="M2 17l10 5 10-5"></path>
                        <path d="M2 12l10 5 10-5"></path>
                      </svg>
                      <span className="font-bold tracking-wide">Make Controller</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // --- DESKTOP LAYOUT (default) ---
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">Connected Devices</h3>
            <p className="text-neutral-400 text-xs">{clients.length} device{clients.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Device List */}
      <div className="bg-neutral-900/50 rounded-lg border border-neutral-800 overflow-hidden">
        {clients.length === 0 ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
              </svg>
            </div>
            <p className="text-neutral-400 text-sm">No devices connected</p>
            <p className="text-neutral-500 text-xs mt-1">Share the room code to invite others</p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {clients.map((c, index) => (
              <li
                key={c.id}
                className={`flex items-center p-4 transition-all duration-300 group ${
                  c.clientId === controllerClientId ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-neutral-800/50'
                } ${clientAnimations[index]?.animationClass || ''}`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    c.clientId === controllerClientId ? 'bg-primary/20' : 'bg-neutral-800'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={
                      c.clientId === controllerClientId ? 'text-primary' : 'text-neutral-400'
                    }>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm truncate ${
                        c.clientId === controllerClientId ? 'text-primary' : 'text-white'
                      }`}>
                        {c.displayName || c.clientId || c.id}
                      </span>
                      {c.clientId === clientId && (
                        <span className="px-1.5 py-0.5 bg-neutral-700 text-neutral-300 rounded text-xs">You</span>
                      )}
                    </div>
                    <p className="text-neutral-400 text-xs truncate">
                      {c.deviceInfo || 'Unknown device'}
                    </p>
                  </div>
                </div>
                
                {c.clientId === controllerClientId ? (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    <span className="px-2 py-1 bg-primary/20 border border-primary/30 rounded text-xs text-primary font-medium">
                      Controller
                    </span>
                  </div>
                ) : isController && (
                  <div className="opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-x-3 group-hover:translate-x-0">
                    <button
                      onClick={() => handleOfferController(c.clientId)}
                      className="relative px-4 py-2.5 bg-gradient-to-r from-neutral-900/90 via-neutral-800/80 to-neutral-900/90 hover:from-neutral-800/95 hover:via-neutral-700/90 hover:to-neutral-800/95 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl transition-all duration-500 hover:scale-105 flex items-center gap-2.5 shadow-2xl hover:shadow-neutral-900/50 border border-neutral-700/40 hover:border-neutral-600/60 backdrop-blur-md group/btn overflow-hidden"
                      title={`Offer controller role to ${c.displayName || c.clientId}`}
                    >
                      {/* Animated background gradient */}
                      <div className="absolute inset-0 bg-gradient-to-r from-neutral-600/10 via-neutral-500/5 to-neutral-600/10 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-700 animate-pulse"></div>
                      
                      {/* Icon with enhanced styling */}
                      <div className="relative w-3.5 h-3.5 bg-gradient-to-br from-neutral-600/80 to-neutral-700/90 rounded-full flex items-center justify-center group-hover/btn:from-neutral-500/90 group-hover/btn:to-neutral-600/95 transition-all duration-500 hover:scale-110 shadow-inner">
                        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 group-hover/btn:text-white transition-all duration-500 group-hover/btn:scale-110">
                          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                          <path d="M2 17l10 5 10-5"></path>
                          <path d="M2 12l10 5 10-5"></path>
                        </svg>
                      </div>
                      
                      {/* Text with enhanced typography */}
                      <span className="relative font-bold tracking-wide group-hover/btn:tracking-wider transition-all duration-500">
                        Make Controller
                      </span>
                      
                      {/* Subtle glow effect */}
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-neutral-600/0 via-neutral-500/5 to-neutral-600/0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-700"></div>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});

export default DeviceList; 