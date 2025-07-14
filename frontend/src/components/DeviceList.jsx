import React, { useState, useEffect } from 'react';
import { useStaggeredAnimation } from '../hooks/useSmoothAppearance';

// Helper: Minimalist & Modern Device avatar with status indicator (Black & White Dark Theme)
function DeviceAvatar({ isController, isCurrentUser }) {
  return (
    <div
      className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200
        ${isController ? 'bg-gradient-to-br from-white/10 to-white/5 shadow-md' : 'bg-black/80'}
        ${isCurrentUser ? 'ring-1 ring-white/60' : ''}
      `}
      style={{
        boxShadow: isController
          ? '0 2px 8px 0 rgba(255,255,255,0.10)'
          : '0 1px 3px 0 rgba(0,0,0,0.10)',
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isController ? "#fff" : "#bbb"}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-colors duration-200"
        style={{
          filter: isController ? 'drop-shadow(0 0 2px #fff8)' : 'none',
        }}
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      {(isController || isCurrentUser) && (
        <span
          className={`absolute -bottom-1 -right-1 rounded-full border-2 border-black/90
            ${isController
              ? 'w-2.5 h-2.5 bg-white animate-pulse shadow'
              : isCurrentUser
              ? 'w-2 h-2 bg-white/80'
              : ''}
          `}
          style={{
            boxShadow: isController
              ? '0 0 4px 1px #fff'
              : undefined,
            opacity: 0.95,
          }}
        />
      )}
    </div>
  );
}

// Helper: Empty state illustration
function EmptyState({ mobile }) {
  return (
    <div className="p-6 text-center flex flex-col items-center justify-center gap-2">
      <div className="w-14 h-14 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-xl flex items-center justify-center mx-auto mb-2 shadow-inner">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
        </svg>
      </div>
      <p className="text-neutral-400 text-base font-medium">No devices connected</p>
      <p className="text-neutral-500 text-xs mt-1">Share the room code to invite others</p>
      {mobile && (
        <div className="mt-2 flex items-center justify-center gap-1 text-xs text-neutral-500">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block mr-1" viewBox="0 0 24 24">
            <path d="M17 8a5 5 0 0 1-10 0"></path>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          Waiting for others to join...
        </div>
      )}
    </div>
  );
}

// Helper: Minimalist Controller badge
function ControllerBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 rounded-full text-xs text-primary font-semibold">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
        style={{ minWidth: 12, minHeight: 12 }}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      <span className="font-medium tracking-tight">Controller</span>
    </span>
  );
}

// Helper: Make Controller button (minimalist, modern)
function MakeControllerButton({ onClick, displayName }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/80 hover:bg-primary/90 border border-primary/20 hover:border-primary/60 text-primary hover:text-white text-xs font-semibold transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      title={`Offer controller role to ${displayName}`}
      tabIndex={0}
    >
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 group-hover:bg-white/10 transition-colors duration-200">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary group-hover:text-white transition-colors duration-200"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </span>
      <span className="tracking-tight font-medium">Make Controller</span>
    </button>
  );
}

const DeviceList = React.memo(function DeviceList({ clients = [], controllerClientId, clientId, socket, mobile = false, isAudioTabActive = false }) {
  const isController = controllerClientId && clientId && controllerClientId === clientId;
  const [shouldAnimate, setShouldAnimate] = useState(false);

  // Smooth staggered animation for client list
  const clientAnimations = useStaggeredAnimation(clients, 50, 'animate-slide-in-left');

  // Trigger animation for mobile device list
  useEffect(() => {
    if (mobile) {
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
        // Optionally show a toast/snackbar here for better UX
        // e.g. toast.success('Controller offer sent!')
        // For now, just log:
        console.log('Controller offer sent successfully');
      } else {
        // Optionally show a toast/snackbar here for better UX
        console.warn('Failed to send controller offer:', res);
      }
    });
  };

  // --- MOBILE LAYOUT ---
  if (mobile) {
    return (
      <div className={`space-y-2 px-2 pt-2 pb-4 transition-all duration-500 ${shouldAnimate ? 'animate-slide-down-from-top' : 'opacity-0 -translate-y-full'}`}>
        {/* Sticky header for mobile */}
        <div className="sticky top-0 z-20 bg-gradient-to-b from-neutral-900/90 to-neutral-900/80 backdrop-blur border-b border-neutral-800 flex items-center gap-2 px-2 py-2 rounded-t-xl shadow-md">
          <div className="w-7 h-7 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-lg flex items-center justify-center shadow">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold text-base leading-tight tracking-wide">Devices</h3>
            <p className="text-neutral-400 text-xs">{clients.length} device{clients.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {/* Device List */}
        <div className="bg-gradient-to-br from-neutral-900/90 to-neutral-900/80 rounded-xl border border-neutral-800 overflow-hidden shadow-xl">
          {clients.length === 0 ? (
            <EmptyState mobile />
          ) : (
            <ul className="divide-y divide-neutral-800">
              {clients.map((c, index) => {
                const isCurrentUser = c.clientId === clientId;
                const isCurrentController = c.clientId === controllerClientId;
                return (
                  <li
                    key={c.id}
                    className={`flex items-center px-3 py-3 transition-all duration-300 group gap-3 relative
                      ${isCurrentController ? 'bg-primary/10 border-l-4 border-l-primary shadow-md' : 'hover:bg-neutral-800/60'}
                      ${clientAnimations[index]?.animationClass || ''}
                    `}
                  >
                    <DeviceAvatar isController={isCurrentController} isCurrentUser={isCurrentUser} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm truncate transition-colors duration-200
                          ${isCurrentController ? 'text-primary' : isCurrentUser ? 'text-accent' : 'text-white'}
                        `}>
                          {c.displayName || c.clientId || c.id}
                        </span>
                        {isCurrentUser && (
                          <span className="px-1.5 py-0.5 bg-accent/20 text-accent rounded text-xs ml-1 font-medium border border-accent/30">You</span>
                        )}
                      </div>
                      <p className="text-neutral-400 text-xs truncate">
                        {c.deviceInfo || 'Unknown device'}
                      </p>
                    </div>
                    {isCurrentController ? (
                      <div className="flex flex-col items-end gap-1 ml-2">
                        <ControllerBadge />
                      </div>
                    ) : isController && !isCurrentUser && (
                      <div className="ml-2">
                        <MakeControllerButton
                          onClick={() => handleOfferController(c.clientId)}
                          displayName={c.displayName || c.clientId}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
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
          <div className="w-8 h-8 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-lg flex items-center justify-center shadow">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold text-base tracking-wide">Connected Devices</h3>
            <p className="text-neutral-400 text-xs">{clients.length} device{clients.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Device List */}
      <div className="bg-gradient-to-br from-neutral-900/80 to-neutral-900/60 rounded-xl border border-neutral-800 overflow-hidden shadow-xl">
        {clients.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-neutral-800">
            {clients.map((c, index) => {
              const isCurrentUser = c.clientId === clientId;
              const isCurrentController = c.clientId === controllerClientId;
              return (
                <li
                  key={c.id}
                  className={`flex items-center p-4 transition-all duration-300 group relative
                    ${isCurrentController ? 'bg-primary/10 border-l-4 border-l-primary shadow-md' : 'hover:bg-neutral-800/50'}
                    ${clientAnimations[index]?.animationClass || ''}
                  `}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <DeviceAvatar isController={isCurrentController} isCurrentUser={isCurrentUser} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm truncate transition-colors duration-200
                          ${isCurrentController ? 'text-primary' : isCurrentUser ? 'text-accent' : 'text-white'}
                        `}>
                          {c.displayName || c.clientId || c.id}
                        </span>
                      </div>
                      <p className="text-neutral-400 text-xs truncate">
                        {c.deviceInfo || 'Unknown device'}
                      </p>
                    </div>
                  </div>
                  {isCurrentController ? (
                    <div className="flex items-center gap-1 ml-2">
                      <ControllerBadge />
                      {isCurrentUser && (
                        <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20 shadow-none">You</span>
                      )}
                    </div>
                  ) : isController && !isCurrentUser ? (
                    <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 ml-2">
                      <MakeControllerButton
                        onClick={() => handleOfferController(c.clientId)}
                        displayName={c.displayName || c.clientId}
                        className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 shadow-none"
                      />
                    </div>
                  ) : isCurrentUser ? (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20 shadow-none">You</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
});

export default DeviceList;