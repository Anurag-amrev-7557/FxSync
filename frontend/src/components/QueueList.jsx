import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { MusicIcon, RemoveIcon } from './Icons';
import useDeviceType from '../hooks/useDeviceType';
// Add Vibrant color extraction
let Vibrant = null;
async function loadVibrant() {
  if (Vibrant) return Vibrant;
  if (window.Vibrant) {
    Vibrant = window.Vibrant;
    return Vibrant;
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/node-vibrant@3.1.6/dist/vibrant.min.js';
    script.onload = () => {
      Vibrant = window.Vibrant;
      resolve(Vibrant);
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}
const colorCache = {};

// Helper to format duration (e.g., 90 -> 1:30)
function formatDuration(duration) {
  if (!duration) return null;
  if (typeof duration === 'string') return duration;
  const d = Number(duration);
  if (isNaN(d) || d <= 0) return null;
  const min = Math.floor(d / 60);
  const sec = Math.floor(d % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}



// Memoized Track Row for performance
const TrackRow = React.memo(function TrackRow({
  item,
  idx,
  selectedTrackIdx,
  queueAnimations,
  onSelectTrack,
  handleRemove,
  loading,
  isController,
  disableRemove,
  pendingRemoveId,
  confirmRemove,
  onOptimisticRemove, // <-- new prop
  isAnimatingOut, // <-- new prop
}) {
  const trackId = item.url || item.id || item.title;
  const isSelected = selectedTrackIdx === idx;
  const animationClass = queueAnimations[idx]?.animationClass || '';
  const durationStr = formatDuration(item.duration);

  // Only animate on first appearance
  const hasAnimatedRef = useRef(new Set());
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [fadeIn, setFadeIn] = useState(false); // NEW: for fade-in animation

  useEffect(() => {
    // Staggered fade-in for each row
    const timeout = setTimeout(() => setFadeIn(true), 60 + idx * 40);
    return () => clearTimeout(timeout);
  }, [idx]);

  useEffect(() => {
    if (!hasAnimatedRef.current.has(trackId)) {
      setShouldAnimate(true);
      hasAnimatedRef.current.add(trackId);
    } else {
      setShouldAnimate(false);
    }
  }, [trackId]);

  const appliedAnimationClass = shouldAnimate ? animationClass : '';

  // --- Swipe-to-remove state and handlers (mobile only) ---
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchDeltaX, setTouchDeltaX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [collapsing, setCollapsing] = useState(false); // NEW: for collapse animation
  const [shouldAnimateBack, setShouldAnimateBack] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(null); // Store direction for removal animation
  const [removalDirection, setRemovalDirection] = useState(null); // Separate state for removal direction
  const removalPositionRef = useRef(null); // Direct ref for removal position
  const swipeThreshold = 80; // px
  const removalSwipeX = useRef(null);
  const [removalKey, setRemovalKey] = useState(0);
  const lockedRemovalDirection = useRef(null);
  const rowRef = useRef(null);
  const collapseRef = useRef(null);

  // Only enable swipe on mobile
  const { isMobile } = useDeviceType();

  // Listen for collapse transition end to remove from queue
  useEffect(() => {
    if (!collapsing) return;
    const node = collapseRef.current;
    if (!node) return;
    let called = false;
    const handleTransitionEnd = (e) => {
      if (e.propertyName === 'height') {
        console.log('[QueueList] transitionend: height, calling confirmRemove for', trackId);
        called = true;
        if (confirmRemove) confirmRemove(trackId);
      }
    };
    node.addEventListener('transitionend', handleTransitionEnd);
    // Fallback: call confirmRemove after 600ms if transitionend doesn't fire
    const fallbackTimeout = setTimeout(() => {
      if (!called) {
        console.warn('[QueueList] Fallback: transitionend did not fire, calling confirmRemove for', trackId);
        if (confirmRemove) confirmRemove(trackId);
      }
    }, 600);
    return () => {
      node.removeEventListener('transitionend', handleTransitionEnd);
      clearTimeout(fallbackTimeout);
    };
  }, [collapsing, confirmRemove, trackId]);

  // Listen for transition end to remove from queue (for swipe out)
  useEffect(() => {
    if (!isRemoving) return;
    const node = rowRef.current;
    if (!node) return;
    const handleTransitionEnd = (e) => {
      if (e.propertyName === 'transform') {
        // Instead of removing immediately, start collapse
        setIsRemoving(false);
        setCollapsing(true);
      }
    };
    node.addEventListener('transitionend', handleTransitionEnd);
    return () => node.removeEventListener('transitionend', handleTransitionEnd);
  }, [isRemoving]);

  const handleTouchStart = (e) => {
    if (!isMobile || !isController || loading || disableRemove) return;
    if (e.touches && e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setSwiping(true);
      setSwipeDirection(null); // Reset direction
      setRemovalDirection(null); // Reset removal direction
      removalPositionRef.current = null; // Reset removal position
    }
  };

  const handleTouchMove = (e) => {
    if (!isMobile || !isController || !swiping || loading || disableRemove) return;
    if (e.touches && e.touches.length === 1 && touchStartX !== null) {
      const deltaX = e.touches[0].clientX - touchStartX;
      setTouchDeltaX(deltaX);
      // Set direction as soon as there is any movement
      if (deltaX !== 0) {
        setSwipeDirection(deltaX > 0 ? 'right' : 'left');
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isMobile || !isController || !swiping || loading || disableRemove) {
      setTouchStartX(null);
      setTouchDeltaX(0);
      setSwiping(false);
      setShouldAnimateBack(false);
      setSwipeDirection(null);
      setRemovalDirection(null);
      removalPositionRef.current = null;
      removalSwipeX.current = null;
      lockedRemovalDirection.current = null;
      return;
    }
    if (Math.abs(touchDeltaX) > swipeThreshold) {
      // Store direction before clearing touchDeltaX
      const finalDirection = touchDeltaX > 0 ? 'right' : 'left';
      setSwipeDirection(finalDirection);
      setRemovalDirection(finalDirection); // Set removal direction
      lockedRemovalDirection.current = finalDirection; // <-- lock direction for animation
      setIsRemoving(true);
    } else {
      // Animate back to position
      setShouldAnimateBack(true);
      setTimeout(() => {
        setShouldAnimateBack(false);
        setTouchDeltaX(0);
        setSwipeDirection(null);
        setRemovalDirection(null);
        removalPositionRef.current = null;
        removalSwipeX.current = null;
        lockedRemovalDirection.current = null;
        setRemovalKey(k => k + 1);
      }, 250);
    }
    setTouchStartX(null);
    setSwiping(false);
  };

  // Style for swipe translation - completely isolate removal animation
  let swipeX = 0;
  if (isRemoving) {
    swipeX = lockedRemovalDirection.current === 'right' ? 500 : -500;
  } else if (shouldAnimateBack) {
    swipeX = 0;
  } else if (swiping) {
    swipeX = touchDeltaX;
  }

  // Collapsing style
  const collapseStyle = collapsing
    ? {
        height: 0,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        transition: 'height 0.44s cubic-bezier(0.22,0.61,0.36,1), margin 0.44s cubic-bezier(0.22,0.61,0.36,1), padding 0.44s cubic-bezier(0.22,0.61,0.36,1)',
      }
    : {
        height: '5rem',
        transition: 'height 0.44s cubic-bezier(0.22,0.61,0.36,1), margin 0.44s cubic-bezier(0.22,0.61,0.36,1), padding 0.44s cubic-bezier(0.22,0.61,0.36,1)',
      };

  const swipeStyle = isMobile && (swiping || isRemoving || shouldAnimateBack)
    ? {
        transform: `translateX(${swipeX}px)` + (isRemoving ? ' scale(0.92) translateY(8px)' : ''),
        filter: isRemoving ? 'blur(1.5px) brightness(0.95)' : 'none',
        boxShadow: isRemoving ? '0 8px 32px 0 rgba(0,0,0,0.18)' : '0 2px 8px 0 rgba(0,0,0,0.08)',
        transition:
          isRemoving
            ? 'transform 0.44s cubic-bezier(0.22,0.61,0.36,1), opacity 0.44s cubic-bezier(0.22,0.61,0.36,1), filter 0.44s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.44s cubic-bezier(0.22,0.61,0.36,1)'
            : shouldAnimateBack
              ? 'transform 0.25s cubic-bezier(0.4,0,0.2,1)'
              : 'none',
        opacity: isRemoving ? 0 : 1,
        zIndex: 99,
        position: isRemoving ? 'absolute' : 'relative',
        left: 0,
        width: '100%',
        willChange: 'transform, opacity, filter, box-shadow',
      }
    : { position: 'relative', zIndex: 2 };

  // Only show red background if user has actually swiped (not just tapped)
  const hasSwiped = Math.abs(touchDeltaX) > 10 || isRemoving;

  const iconDirection = (isRemoving && lockedRemovalDirection.current)
    ? lockedRemovalDirection.current
    : swipeDirection;

  useEffect(() => {
    console.log('[TrackRow] Rendered for', trackId, 'collapsing:', collapsing);
  }, [trackId, collapsing]);

  // Add a handler for desktop delete
  const handleDesktopRemove = (trackId) => {
    if (!isMobile) {
      setCollapsing(true);
    }
    handleRemove(trackId);
  };

  // Dominant color burst logic
  const [dominantColor, setDominantColor] = useState('#18181b');
  useEffect(() => {
    let cancelled = false;
    async function extractColor() {
      if (item.albumArt) {
        if (colorCache[item.albumArt]) {
          setDominantColor(colorCache[item.albumArt]);
          return;
        }
        try {
          await loadVibrant();
          const palette = await window.Vibrant.from(item.albumArt).getPalette();
          let color = palette?.Vibrant?.getHex?.() || palette?.DarkVibrant?.getHex?.() || palette?.Muted?.getHex?.() || '#18181b';
          colorCache[item.albumArt] = color;
          if (!cancelled) setDominantColor(color);
        } catch (e) {
          if (!cancelled) setDominantColor('#18181b');
        }
      } else {
        setDominantColor('#18181b');
      }
    }
    extractColor();
    return () => { cancelled = true; };
  }, [item.albumArt]);

  // Color burst animation on select
  const [showBurst, setShowBurst] = useState(false);
  useEffect(() => {
    if (isSelected) {
      setShowBurst(true);
      const timeout = setTimeout(() => setShowBurst(false), 700);
      return () => clearTimeout(timeout);
    } else {
      setShowBurst(false);
    }
  }, [isSelected]);

  return (
    <div
      ref={collapseRef}
      className={`relative track-row-animate${fadeIn ? ' queue-fade-in' : ''}`}
      style={collapseStyle}
    >
      {/* Color stream burst effect (only on select, flows left to right) */}
      {showBurst && (
        <div
          className="absolute top-0 left-0 h-full z-0 pointer-events-none"
          style={{
            width: '60%',
            minWidth: 120,
            maxWidth: 260,
            background: `linear-gradient(90deg, ${dominantColor} 0%, ${dominantColor}33 60%, transparent 100%)`,
            filter: 'blur(12px) brightness(1.08) saturate(1.08)',
            opacity: 0.22,
            borderRadius: '14px',
            animation: 'color-stream-burst-minimal 0.9s cubic-bezier(0.4,0,0.2,1) forwards',
            boxShadow: `0 0 32px 0 ${dominantColor}22`,
          }}
        />
      )}
      <style>{`
        @keyframes color-stream-burst-minimal {
          0% {
            transform: translateX(-30%) scaleX(0.92);
            opacity: 0.22;
          }
          60% {
            opacity: 0.22;
          }
          100% {
            transform: translateX(60%) scaleX(1.04);
            opacity: 0;
          }
        }
      `}</style>
      {/* Red background revealed during swipe */}
      {isMobile && (isRemoving || hasSwiped) && (
        <div
          className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none"
          style={{ background: 'rgba(239, 68, 68, 0.15)', zIndex: 1 }}
        >
          {/* Left side icon/text */}
          <span style={{ opacity: iconDirection === 'right' ? 1 : 0, transition: 'opacity 0.2s' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M7 18c0 1.104.896 2 2 2h6c1.104 0 2-.896 2-2V8H7v10zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="#ef4444"/></svg>
          </span>
          {/* Right side icon/text */}
          <span style={{ opacity: iconDirection === 'left' ? 1 : 0, transition: 'opacity 0.2s' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M7 18c0 1.104.896 2 2 2h6c1.104 0 2-.896 2-2V8H7v10zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="#ef4444"/></svg>
          </span>
        </div>
      )}
      {/* Swipable item */}
      <div
        ref={rowRef}
        className={`p-3 sm:p-4 h-20 sm:h-20 border-l-4 border-transparent hover:bg-primary/20 focus:bg-primary/30 transition-all duration-300 group cursor-pointer outline-none ${appliedAnimationClass} ${isSelected ? '' : ''} ${isMobile && (swiping || isRemoving) ? 'hide-scrollbar' : ''} ${isRemoving ? 'removing' : ''}`}
        style={swipeStyle}
        onClick={() => isController && onSelectTrack && onSelectTrack(idx)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            isController && onSelectTrack && onSelectTrack(idx);
          }
        }}
        title={isSelected ? 'Currently Playing' : 'Click to play'}
        tabIndex={0}
        aria-current={isSelected ? 'true' : undefined}
        aria-label={`Track ${idx + 1}: ${item.title || 'Unknown Track'}`}
        data-testid={`queue-track-${idx}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center gap-2 sm:gap-3 relative z-10">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isSelected ? 'bg-white' : 'bg-neutral-800'}`}
            title={item.title || 'Unknown Track'}
          >
            {item.albumArt ? (
              <img
                src={item.albumArt}
                alt={item.title ? `Album art for ${item.title}` : 'Album Art'}
                className="w-10 h-10 object-cover rounded-lg transition-all duration-300 shadow-md"
                style={{ minWidth: 32, minHeight: 32, background: isSelected ? '#fff' : '#18181b' }}
                loading="lazy"
                draggable={false}
              />
            ) : (
              <span style={{ marginLeft: '-2px', display: 'inline-flex' }}>
                <MusicIcon className={isSelected ? 'text-black drop-shadow-lg' : 'text-neutral-400'} />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
              
              <h4
                className={`truncate transition-all duration-300 ${
                  isSelected
                    ? 'text-base sm:text-lg font-extrabold text-primary drop-shadow-md relative'
                    : 'text-white font-medium text-xs sm:text-sm'
                }`}
                style={isSelected ? { position: 'relative' } : undefined}
                title={item.title || 'Unknown Track'}
              >
                {item.title || 'Unknown Track'}
                {isSelected && (
                  <span
                    className="absolute left-0 bottom-0 w-full h-[7px] pointer-events-none"
                    aria-hidden="true"
                    style={{
                      display: 'block',
                      height: '7px',
                      width: '0%',
                      background: 'none',
                      transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                      animation: 'wavy-underline-grow 0.5s cubic-bezier(0.4,0,0.2,1) forwards',
                      zIndex: 1,
                    }}
                  >
                    <svg
                      viewBox="0 0 100 7"
                      preserveAspectRatio="none"
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                      }}
                    >
                      <path
                        d="M0,3.5 Q1.25,2 2.5,3.5 Q3.75,5 5,3.5 Q6.25,2 7.5,3.5 Q8.75,5 10,3.5 Q11.25,2 12.5,3.5 Q13.75,5 15,3.5 Q16.25,2 17.5,3.5 Q18.75,5 20,3.5 Q21.25,2 22.5,3.5 Q23.75,5 25,3.5 Q26.25,2 27.5,3.5 Q28.75,5 30,3.5 Q31.25,2 32.5,3.5 Q33.75,5 35,3.5 Q36.25,2 37.5,3.5 Q38.75,5 40,3.5 Q41.25,2 42.5,3.5 Q43.75,5 45,3.5 Q46.25,2 47.5,3.5 Q48.75,5 50,3.5 Q51.25,2 52.5,3.5 Q53.75,5 55,3.5 Q56.25,2 57.5,3.5 Q58.75,5 60,3.5 Q61.25,2 62.5,3.5 Q63.75,5 65,3.5 Q66.25,2 67.5,3.5 Q68.75,5 70,3.5 Q71.25,2 72.5,3.5 Q73.75,5 75,3.5 Q76.25,2 77.5,3.5 Q78.75,5 80,3.5 Q81.25,2 82.5,3.5 Q83.75,5 85,3.5 Q86.25,2 87.5,3.5 Q88.75,5 90,3.5 Q91.25,2 92.5,3.5 Q93.75,5 95,3.5 Q96.25,2 97.5,3.5 Q98.75,5 100,3.5"
                        stroke="#fff"
                        strokeWidth="1.5"
                        fill="transparent"
                        style={{
                          strokeDasharray: 200,
                          strokeDashoffset: 200,
                          animation: 'wavy-underline-path 0.5s cubic-bezier(0.4,0,0.2,1) forwards',
                        }}
                      />
                    </svg>
                  </span>
                )}
                <style>
                  {`
                    @keyframes wavy-underline-grow {
                      from { width: 0%; }
                      to { width: 100%; }
                    }
                    @keyframes wavy-underline-path {
                      from { stroke-dashoffset: 200; }
                      to { stroke-dashoffset: 0; }
                    }
                  `}
                </style>
              </h4>
            </div>
            <div className="text-[10px] sm:text-xs text-neutral-400 truncate flex flex-col sm:flex-row flex-wrap gap-x-2 gap-y-0.5 items-start sm:items-center">
              {/* Mobile: single row, flex, with separators */}
              <div className="flex flex-row flex-wrap gap-x-1 gap-y-0.5 items-center sm:hidden">
                {(() => {
                  let artists = item.artist;
                  if (Array.isArray(artists)) artists = artists.filter(Boolean);
                  else if (typeof artists === 'string') artists = artists.split(',').map(a => a.trim()).filter(Boolean);
                  else artists = [];
                  const shown = artists.slice(0, 2);
                  return shown.map((a, i) => (
                    <span key={i} className="truncate max-w-[40vw]" title={a}>{a}</span>
                  )).concat(artists.length > 2 ? <span key="more">...</span> : []);
                })()}
                {item.artist && item.album && <span>•</span>}
                {item.album && (
                  <span className="truncate max-w-[40vw]" title={item.album}>{item.album}</span>
                )}
                {(item.artist || item.album) && durationStr && <span>•</span>}
                {durationStr && <span>{durationStr}</span>}
              </div>
              {/* Desktop: keep previous layout */}
              <span className="hidden sm:flex flex-row flex-wrap gap-x-2 gap-y-0.5 items-center">
                {(() => {
                  let artists = item.artist;
                  if (Array.isArray(artists)) artists = artists.filter(Boolean);
                  else if (typeof artists === 'string') artists = artists.split(',').map(a => a.trim()).filter(Boolean);
                  else artists = [];
                  const shown = artists.slice(0, 2);
                  return shown.map((a, i) => (
                    <span key={i} className="truncate max-w-xs" title={a}>{a}</span>
                  )).concat(artists.length > 2 ? <span key="more">...</span> : []);
                })()}
                {item.album && <span>•</span>}
                {item.album && <span className="truncate max-w-xs" title={item.album}>{item.album}</span>}
                {durationStr && <span>•</span>}
                {durationStr && <span>{durationStr}</span>}
              </span>
            </div>
          </div>
          {isSelected && (
            <EqualizerBars />
          )}
          {/* Hide delete button for mobile view entirely */}
          {isController && !isMobile && (
            <button
              className="opacity-100 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 sm:p-2.5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 ml-1 sm:ml-0 min-w-[36px] min-h-[36px]"
              onClick={e => { e.stopPropagation(); console.log('[TrackRow] Delete button clicked for', trackId); handleDesktopRemove(trackId); }}
              disabled={loading || disableRemove}
              title="Remove track"
              aria-label={`Remove track ${item.title || 'Unknown Track'}`}
              tabIndex={0}
            >
              <RemoveIcon />
            </button>
          )}
        </div>
        {/* Hide scrollbar for this row while swiping/removing */}
        <style>{`
          .hide-scrollbar {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
            overflow-x: hidden !important;
            overflow-y: hidden !important;
          }
          .hide-scrollbar::-webkit-scrollbar {
            display: none !important;
          }
        `}</style>
      </div>
    </div>
  );
});

// EqualizerBars: minimalist animated equalizer for selected track
const EqualizerBars = React.memo(function EqualizerBars() {
  // 5 bars, each with a different animation delay
  return (
    <div className="flex items-end h-8 w-8 justify-end ml-2 sm:ml-4">
      {[0, 1, 2, 3].map(i => (
        <span key={i} className={`eq-bar eq-bar-${i + 1}`} />
      ))}
      <style>{`
        .eq-bar {
          display: inline-block;
          width: 2.5px;
          margin: 0 1px;
          background: #fff;
          border-radius: 5rem;
          opacity: 0.97;
          height: 60%;
          animation: eq-bar-bounce-bw 1.1s infinite cubic-bezier(0.4,0,0.2,1);
        }
        .eq-bar-1 { animation-delay: 0s; }
        .eq-bar-2 { animation-delay: 0.15s; }
        .eq-bar-3 { animation-delay: 0.3s; }
        .eq-bar-4 { animation-delay: 0.45s; }
        @keyframes eq-bar-bounce-bw {
          0% { height: 60%; background: #fff; }
          20% { height: 90%; background: #eee; }
          40% { height: 40%; background: #ccc; }
          60% { height: 80%; background: #fff; }
          80% { height: 30%; background: #bbb; }
          100% { height: 60%; background: #fff; }
        }
      `}</style>
    </div>
  );
});

function QueueList({
  queue,
  queueAnimations = [],
  selectedTrackIdx,
  onSelectTrack,
  isController,
  handleRemove,
  loading,
  List,
  queueListRef,
  queueScrollRef,
  pendingRemoveId,
  confirmRemove,
  pendingRemoveIds = [],
  onRemoveAnimationEnd,
}) {
  // All hooks must be called before any early return
  const { isMobile } = useDeviceType();

  // Local cache of animating-out items
  const [optimisticRemovals, setOptimisticRemovals] = useState([]); // [{id, item, direction, uniqueKey}]

  // Remove from cache after animation
  const handleOptimisticRemove = useCallback((trackId, uniqueKey) => {
    console.log('[QueueList] handleOptimisticRemove called for', trackId, 'uniqueKey:', uniqueKey);
    setOptimisticRemovals(removals => removals.filter(r => r.uniqueKey !== uniqueKey));
  }, []);

  // When a swipe triggers removal, add to optimisticRemovals
  const handleRemoveWithOptimism = useCallback((trackId, item, direction = 'right') => {
    console.log('[QueueList] handleRemoveWithOptimism called for', trackId, 'direction:', direction);
    setOptimisticRemovals(removals => {
      // Use a unique key for each removal instance
      const uniqueKey = `${trackId}-removing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (removals.some(r => r.id === trackId)) return removals;
      return [...removals, { id: trackId, item: { ...item }, direction, uniqueKey }];
    });
    if (handleRemove) {
      console.log('[QueueList] handleRemove called for', trackId);
      handleRemove(trackId);
    }
  }, [handleRemove]);

  // Clear all optimisticRemovals when the queue updates to match backend exactly
  useEffect(() => {
    setOptimisticRemovals([]);
  }, [queue]);

  // Now do early return
  if (!queue || queue.length === 0) {
    return (
      <div className="p-8 text-center" ref={queueListRef}>
        <div className="w-16 h-16 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-4">
          <MusicIcon className="text-neutral-400" width={24} height={24} />
        </div>
        <p className="text-neutral-400 text-sm mb-1">No tracks in queue</p>
        <p className="text-neutral-500 text-xs">
          {isController ? 'Add audio URLs or upload MP3s to get started' : 'The controller will add tracks here'}
        </p>
      </div>
    );
  }

  // Only render the backend queue, do not merge in optimisticRemovals
  const fullList = queue.map((item, idx) => ({ item, idx, isAnimatingOut: false, uniqueKey: item.url || item.id || item.title }));

  // Single non-drag version for all users
  return (
    <div
      ref={el => {
        if (queueScrollRef) {
          if (typeof queueScrollRef === 'function') queueScrollRef(el);
          else if (queueScrollRef.current) queueScrollRef.current = el;
        }
      }}
      className="divide-y divide-neutral-800 scrollable-container max-h-[60vh] sm:max-h-[70vh] overflow-y-auto"
      tabIndex={0}
      aria-label="Queue list"
      data-testid="queue-list"
    >
      {fullList.map(({ item, idx, isAnimatingOut, direction, uniqueKey }) => (
        <TrackRow
          key={uniqueKey}
          item={item}
          idx={idx}
          selectedTrackIdx={selectedTrackIdx}
          queueAnimations={queueAnimations}
          onSelectTrack={onSelectTrack}
          handleRemove={(trackId) => handleRemoveWithOptimism(trackId, item, direction)}
          loading={loading}
          isController={isController}
          disableRemove={false}
          pendingRemoveId={pendingRemoveId}
          confirmRemove={confirmRemove}
          isAnimatingOut={isAnimatingOut}
          onOptimisticRemove={(trackId) => handleOptimisticRemove(trackId, uniqueKey)}
        />
      ))}
    </div>
  );
}

export default QueueList;