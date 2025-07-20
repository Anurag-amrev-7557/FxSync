// DeviceList.jsx
//
// Displays a list of connected devices in a session, with controller management, search/filter, and responsive layouts for mobile and desktop.
// Features:
// - Modern, accessible UI with controller and current user highlighting
// - Virtualized list for large device counts
// - Search/filter bar and optional sorting (controller, current user, others)
// - Toast/snackbar feedback for controller actions
// - Polished empty state with animation
// - Performance optimizations and PropTypes for maintainability
//
// Recent improvements: unified visual style, accessibility, performance, search/filter, sorting, feedback, and code quality.

import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { useStaggeredAnimation } from '../hooks/useSmoothAppearance';
import { VariableSizeList as List } from 'react-window';
import { ReducedMotionContext } from '../App';
import PropTypes from 'prop-types';
import useDeviceType from '../hooks/useDeviceType';

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
      <div className="w-16 h-16 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-inner animate-float">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500 animate-pulse-slow">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          <circle cx="18" cy="7" r="2.5" fill="#222" stroke="#444" strokeWidth="1.2" />
        </svg>
      </div>
      <p className="text-neutral-200 text-base font-semibold">No devices connected yet</p>
      <p className="text-neutral-400 text-xs mt-1">Share your room code to invite friends and sync up!</p>
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
function MakeControllerButton({ onClick, displayName, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/80 hover:bg-primary/90 border border-primary/20 hover:border-primary/60 text-primary hover:text-white text-xs font-semibold transition-all duration-200 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:bg-primary/80 active:scale-95 mobile-make-controller ${className}`}
      title={`Offer controller role to ${displayName}`}
      tabIndex={0}
      aria-label={`Offer controller role to ${displayName}`}
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

// Memoized list item renderer for react-window (mobile and desktop)
const DeviceListItem = React.memo(function DeviceListItem({ c, index, clientId, controllerClientId, isController, handleOfferController, clientAnimations }) {
  const isCurrentUser = c.clientId === clientId;
  const isCurrentController = c.clientId === controllerClientId;
  return (
    <li
      key={c.clientId || c.id}
      className={`flex items-center p-4 transition-all duration-300 group relative
        ${isCurrentController ? 'bg-primary/10 border-l-4 border-l-primary shadow-md' : 'hover:bg-neutral-800/50'}
        ${clientAnimations[index]?.animationClass || ''}
        focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:bg-primary/10 active:scale-[0.98]`
      }
      tabIndex={0}
      aria-label={`Device: ${c.displayName || c.clientId || c.id}`}
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
});

// --- SmoothList for animated dimension changes ---
function SmoothList({ items, renderItem, getKey }) {
  const [renderedItems, setRenderedItems] = useState(items);
  const [leaving, setLeaving] = useState([]);

  // Handle items leaving (for exit animation)
  useEffect(() => {
    // Find removed items
    const removed = renderedItems.filter(
      oldItem => !items.some(newItem => getKey(newItem) === getKey(oldItem))
    );
    if (removed.length > 0) {
      setLeaving(leaving => [...leaving, ...removed.map(getKey)]);
      // Remove after animation
      setTimeout(() => {
        setRenderedItems(current => current.filter(item => !removed.includes(item)));
        setLeaving(current => current.filter(key => !removed.map(getKey).includes(key)));
      }, 500); // match transition duration
    } else {
      setRenderedItems(items);
    }
  }, [items, getKey, renderedItems]);

  // Add new items immediately
  useEffect(() => {
    setRenderedItems(current => {
      const currentKeys = current.map(getKey);
      const newItems = items.filter(item => !currentKeys.includes(getKey(item)));
      return [...current, ...newItems];
    });
  }, [items, getKey]);

  return (
    <ul className="smooth-list">
      {renderedItems.map((item, idx) => {
        const key = getKey(item);
        const isLeaving = leaving.includes(key);
        return renderItem(item, idx, isLeaving);
      })}
    </ul>
  );
}

const DeviceList = React.memo(function DeviceList({ clients = [], controllerClientId, clientId, socket, dropdown = false }) {
  const isController = controllerClientId && clientId && controllerClientId === clientId;
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const deviceListScrollRef = useRef(null);
  const deviceListVirtRef = useRef();
  const reducedMotion = useContext(ReducedMotionContext);
  const { isMobile } = useDeviceType();
  // Add state for toast/snackbar feedback
  const [toast, setToast] = useState(null);
  // Add state for search/filter
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(handler);
  }, [search]);

  // Filtered clients
  const filteredClients = useMemo(() => {
    if (!debouncedSearch) return clients;
    const q = debouncedSearch.toLowerCase();
    return clients.filter(c =>
      (c.displayName && c.displayName.toLowerCase().includes(q)) ||
      (c.clientId && c.clientId.toLowerCase().includes(q)) ||
      (c.deviceInfo && c.deviceInfo.toLowerCase().includes(q))
    );
  }, [clients, debouncedSearch]);

  // Sort filteredClients: controller first, then current user, then others
  const sortedClients = useMemo(() => {
    if (filteredClients.length <= 1) return filteredClients;
    return [...filteredClients].sort((a, b) => {
      // Controller first
      if (a.clientId === controllerClientId) return -1;
      if (b.clientId === controllerClientId) return 1;
      // Current user second
      if (a.clientId === clientId) return -1;
      if (b.clientId === clientId) return 1;
      // Otherwise, keep order
      return 0;
    });
  }, [filteredClients, controllerClientId, clientId]);

  // Use reducedMotion to skip or minimize animations
  useEffect(() => {
    if (reducedMotion) {
      setShouldAnimate(false);
    }
  }, [reducedMotion]);

  // Smooth staggered animation for client list
  const clientAnimations = reducedMotion ? [] : useStaggeredAnimation(clients, 60, 'animate-slide-in-left');

  // Trigger animation for mobile device list
  useEffect(() => {
    if (isMobile) {
      const timer = setTimeout(() => {
        setShouldAnimate(true);
      }, 400); // was 100
      return () => clearTimeout(timer);
    }
  }, [isMobile]);

  // Trigger animation when audio tab becomes active
  useEffect(() => {
    if (isMobile) {
      const timer = setTimeout(() => {
        setShouldAnimate(false);
      }, 400); // was 50
      return () => clearTimeout(timer);
    }
  }, [isMobile]);

  // Restore scroll position for device list
  useEffect(() => {
    const savedOffset = sessionStorage.getItem('deviceListScrollOffset');
    if (deviceListVirtRef.current && savedOffset) {
      deviceListVirtRef.current.scrollTo(Number(savedOffset));
    }
    return () => {
      if (deviceListVirtRef.current) {
        sessionStorage.setItem('deviceListScrollOffset', deviceListVirtRef.current.state.scrollOffset);
      }
    };
  }, [clients.length]);

  useEffect(() => {
    const el = deviceListScrollRef.current;
    if (!el) return;
    const savedScroll = sessionStorage.getItem('deviceListScrollTop');
    if (savedScroll) {
      el.scrollTop = parseInt(savedScroll, 10);
    }
    return () => {
      if (el) sessionStorage.setItem('deviceListScrollTop', el.scrollTop);
    };
  }, []);

  const handleOfferController = useCallback((targetClientId) => {
    if (!socket || !isController) return;
    socket.emit('offer_controller', {
      sessionId: socket.sessionId,
      targetClientId
    }, (res) => {
      if (res && res.success) {
        setToast({ type: 'success', message: 'Controller offer sent!' });
      } else {
        setToast({ type: 'error', message: 'Failed to send controller offer.' });
      }
      setTimeout(() => setToast(null), 2500);
    });
  }, [socket, isController]);

  // Always use the ultra-minimalist desktop layout for all views
  return (
    <div className="py-2">
      <div className="flex items-center gap-2 px-3 pb-2">
        <svg width="18" height="18" viewBox="0 0 24 24" className="text-neutral-400">
          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" fill="none"/>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" fill="none"/>
        </svg>
        <span className="text-neutral-300 text-sm font-medium">
          {clients.length} Device{clients.length !== 1 ? 's' : ''}
        </span>
      </div>
      {clients.length > 10 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full px-3 py-2 rounded bg-transparent text-white placeholder-neutral-400 border-none focus:ring-2 focus:ring-primary/30 text-sm"
          aria-label="Search devices"
        />
      )}
      <div
        ref={deviceListScrollRef}
        className="overflow-y-auto"
        tabIndex="0"
        aria-label="Device list"
        style={{ background: 'none', maxHeight: 340 }}
      >
        {sortedClients.length === 0 ? (
          <EmptyState mobile={isMobile} />
        ) : sortedClients.length > 10 ? (
          <List
            ref={deviceListVirtRef}
            height={320}
            itemCount={sortedClients.length}
            itemSize={() => 44}
            width={'100%'}
            className=""
            tabIndex={0}
            aria-label="Device list"
          >
            {renderVirtListItem}
          </List>
        ) : (
          <SmoothList
            items={sortedClients}
            getKey={c => c.clientId || c.id}
            renderItem={(c, index, isLeaving) => {
              const isCurrentUser = c.clientId === clientId;
              const isController = controllerClientId === c.clientId;
              const canMakeController = !isController && clientId === controllerClientId;
              return (
                <li
                  key={c.clientId || c.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors duration-150 group smooth-list-item${isLeaving ? ' smooth-list-item-leave' : ' smooth-list-item-enter'}`}
                  style={{
                    borderBottom: index !== sortedClients.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none'
                  }}
                >
                  {/* Left: Avatar + Name + Tags */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center text-xs text-white font-semibold">
                      {c.displayName ? c.displayName.charAt(0).toUpperCase() : '?'}
                    </span>
                    <span className="text-neutral-200 text-sm truncate" title={c.displayName || c.clientId}>
                      {c.displayName || c.clientId}
                      {isCurrentUser && (
                        <span className="ml-2 px-2 py-0.5 rounded bg-primary/20 text-primary text-xs font-medium">You</span>
                      )}
                      {isController && (
                        <span className="ml-2 px-2 py-0.5 rounded bg-green-600/20 text-green-500 text-xs font-medium">Controller</span>
                      )}
                    </span>
                  </div>
                  {/* Right: Make Controller button (if present) */}
                  {canMakeController && (
                    <button
                      type="button"
                      className="ml-auto px-2 py-1 rounded-full border border-black text-black text-xs font-medium bg-white hover:bg-black hover:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/40 mobile-make-controller"
                      style={{
                        background: '#fff',
                        color: '#000',
                        borderColor: '#000',
                        transition: 'opacity 0.2s cubic-bezier(.4,0,.2,1), background 0.2s cubic-bezier(.4,0,.2,1), color 0.2s cubic-bezier(.4,0,.2,1), border-color 0.2s cubic-bezier(.4,0,.2,1)'
                      }}
                      aria-label={`Make ${c.displayName || c.clientId} controller`}
                      onClick={() => handleOfferController(c.clientId)}
                    >
                      Make Controller
                    </button>
                  )}
                </li>
              );
            }}
          />
        )}
      </div>
    </div>
  );
});

DeviceAvatar.propTypes = {
  isController: PropTypes.bool,
  isCurrentUser: PropTypes.bool,
};

EmptyState.propTypes = {
  mobile: PropTypes.bool,
};

MakeControllerButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  displayName: PropTypes.string,
  className: PropTypes.string,
};

DeviceListItem.propTypes = {
  c: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  clientId: PropTypes.string,
  controllerClientId: PropTypes.string,
  isController: PropTypes.bool,
  handleOfferController: PropTypes.func.isRequired,
  clientAnimations: PropTypes.array,
};

DeviceList.propTypes = {
  clients: PropTypes.array,
  controllerClientId: PropTypes.string,
  clientId: PropTypes.string,
  socket: PropTypes.object,
  dropdown: PropTypes.bool,
};

export default DeviceList;