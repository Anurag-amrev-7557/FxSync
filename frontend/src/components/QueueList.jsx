import React, { useCallback, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { MusicIcon, RemoveIcon } from './Icons';

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

// Helper to get padding class based on dragging state
function getPaddingClass(isDragging) {
  return isDragging ? 'p-2' : 'p-4';
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
  draggableProps,
  dragHandleProps,
  innerRef,
  isDragging,
  disableRemove,
}) {
  const isSelected = selectedTrackIdx === idx;
  const animationClass = queueAnimations[idx]?.animationClass || '';
  const durationStr = formatDuration(item.duration);

  // --- Swipe-to-remove state and handlers (mobile only) ---
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchDeltaX, setTouchDeltaX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [shouldAnimateBack, setShouldAnimateBack] = useState(false);
  const swipeThreshold = 80; // px

  // Only enable swipe on mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const handleTouchStart = (e) => {
    if (!isMobile || loading || disableRemove) return;
    if (e.touches && e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setSwiping(true);
    }
  };

  const handleTouchMove = (e) => {
    if (!isMobile || !swiping || loading || disableRemove) return;
    if (e.touches && e.touches.length === 1 && touchStartX !== null) {
      const deltaX = e.touches[0].clientX - touchStartX;
      setTouchDeltaX(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (!isMobile || !swiping || loading || disableRemove) {
      setTouchStartX(null);
      setTouchDeltaX(0);
      setSwiping(false);
      setShouldAnimateBack(false);
      return;
    }
    if (Math.abs(touchDeltaX) > swipeThreshold) {
      setRemoving(true);
      setTimeout(() => {
        handleRemove(idx);
        setRemoving(false);
      }, 200); // allow animation
    } else {
      // Animate back to position
      setShouldAnimateBack(true);
      setTimeout(() => {
        setShouldAnimateBack(false);
        setTouchDeltaX(0);
      }, 250);
    }
    setTouchStartX(null);
    setSwiping(false);
  };

  // Style for swipe translation
  let swipeX = touchDeltaX;
  if (removing) swipeX = touchDeltaX > 0 ? 500 : -500;
  if (shouldAnimateBack) swipeX = 0;

  const swipeStyle = isMobile && (swiping || removing || shouldAnimateBack)
    ? {
        transform: `translateX(${swipeX}px)`,
        transition:
          removing
            ? 'transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s cubic-bezier(0.4,0,0.2,1)'
            : shouldAnimateBack
              ? 'transform 0.25s cubic-bezier(0.4,0,0.2,1)'
              : 'none',
        opacity: removing ? 0 : 1,
        zIndex: 2,
        position: 'relative',
        willChange: 'transform',
      }
    : { position: 'relative', zIndex: 2 };

  // Only show red background if user has actually swiped (not just tapped)
  const hasSwiped = Math.abs(touchDeltaX) > 10;

  // Direction for icon/text
  const swipeDirection = touchDeltaX > 0 ? 'right' : 'left';

  return (
    <div
      className="relative"
      style={{ height: '5rem' }} // match h-20
    >
      {/* Red background revealed during swipe */}
      {isMobile && (removing || hasSwiped) && (
        <div
          className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none"
          style={{ background: 'rgba(239, 68, 68, 0.15)', zIndex: 1 }}
        >
          {/* Left side icon/text */}
          <span style={{ opacity: swipeDirection === 'left' ? 0 : 1, transition: 'opacity 0.2s' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M7 18c0 1.104.896 2 2 2h6c1.104 0 2-.896 2-2V8H7v10zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="#ef4444"/></svg>
          </span>
          {/* Right side icon/text */}
          <span style={{ opacity: swipeDirection === 'right' ? 0 : 1, transition: 'opacity 0.2s' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M7 18c0 1.104.896 2 2 2h6c1.104 0 2-.896 2-2V8H7v10zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="#ef4444"/></svg>
          </span>
        </div>
      )}
      {/* Swipable item */}
      <div
        ref={innerRef}
        {...draggableProps}
        {...dragHandleProps}
        className={`p-3 sm:p-4 h-20 sm:h-20 border-l-4 border-transparent hover:bg-primary/20 focus:bg-primary/30 transition-all duration-300 group cursor-pointer outline-none ${animationClass} ${isSelected ? 'border-primary bg-primary/20' : ''} ${isDragging ? 'bg-primary/30' : ''} ${isMobile && (swiping || removing) ? 'hide-scrollbar' : ''}`}
        style={swipeStyle || (draggableProps && draggableProps.style ? draggableProps.style : undefined)}
        onClick={() => onSelectTrack && onSelectTrack(idx)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTrack && onSelectTrack(idx);
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
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isSelected ? 'bg-white' : 'bg-neutral-800'}`}
            title={item.title || 'Unknown Track'}
          >
            <MusicIcon className={isSelected ? 'text-black drop-shadow-lg' : 'text-neutral-400'} />
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
              {item.artist && <span className="truncate max-w-[90vw] sm:max-w-xs" title={item.artist}>{item.artist}</span>}
              {item.album && <span className="hidden sm:inline">•</span>}
              {item.album && <span className="truncate max-w-[90vw] sm:max-w-xs" title={item.album}>{item.album}</span>}
              {durationStr && <span className="hidden sm:inline">•</span>}
              {durationStr && <span>{durationStr}</span>}
            </div>
            <p className="text-neutral-400 text-[10px] sm:text-xs truncate max-w-[90vw] sm:max-w-sm" title={item.url}>{item.url}</p>
          </div>
          {isSelected && (
            <EqualizerBars />
          )}
          {/* Hide delete button for mobile view entirely */}
          {isController && !isMobile && (
            <button
              className="opacity-100 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 sm:p-2.5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 ml-1 sm:ml-0 min-w-[36px] min-h-[36px]"
              onClick={e => { e.stopPropagation(); handleRemove(idx); }}
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
          border-radius: 2px;
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
  onReorder,
}) {
  // All hooks must be called before any early return
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 640 : false);

  // Update isMobile on resize
  React.useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 640);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const onDragEnd = useCallback((result) => {
    setIsDragging(false);
    if (!result || !result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;
    if (
      source.index < 0 ||
      source.index >= queue.length ||
      destination.index < 0 ||
      destination.index > queue.length
    ) {
      return;
    }
    // Defensive: avoid mutating original queue
    const newQueue = queue.slice();
    const [movedTrack] = newQueue.splice(source.index, 1);
    newQueue.splice(destination.index, 0, movedTrack);
    if (onReorder && typeof onReorder === 'function') {
      // Only call if the queue actually changed
      if (JSON.stringify(newQueue.map(t => t.url)) !== JSON.stringify(queue.map(t => t.url))) {
        onReorder(newQueue);
      }
    }
  }, [queue, onReorder]);

  const onDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  // Memoize queue rendering for performance
  const renderedQueue = useMemo(() => (
    queue.map((item, idx) => (
      <TrackRow
        key={item.url ? item.url : `queue-track-${idx}`}
        item={item}
        idx={idx}
        selectedTrackIdx={selectedTrackIdx}
        queueAnimations={queueAnimations}
        onSelectTrack={onSelectTrack}
        handleRemove={handleRemove}
        loading={loading}
        isController={isController}
        disableRemove={isDragging}
      />
    ))
  ), [queue, queueAnimations, selectedTrackIdx, onSelectTrack, handleRemove, loading, isController, isDragging]);

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

  // Controller: drag-and-drop enabled only on desktop
  if (isController && !isMobile) {
    return (
      <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart}>
        <Droppable droppableId="queue-list-droppable">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="divide-y divide-neutral-800 scrollable-container max-h-[60vh] sm:max-h-[70vh] overflow-y-auto"
              tabIndex={0}
              aria-label="Queue list"
              data-testid="queue-list"
            >
              {queue.map((item, idx) => (
                <Draggable key={item.url ? item.url : `queue-track-${idx}`} draggableId={item.url ? String(item.url) : `queue-track-${idx}`} index={idx}>
                  {(draggableProvided, snapshot) => (
                    <TrackRow
                      item={item}
                      idx={idx}
                      selectedTrackIdx={selectedTrackIdx}
                      queueAnimations={queueAnimations}
                      onSelectTrack={onSelectTrack}
                      handleRemove={handleRemove}
                      loading={loading}
                      isController={isController}
                      draggableProps={draggableProvided.draggableProps}
                      dragHandleProps={draggableProvided.dragHandleProps}
                      innerRef={draggableProvided.innerRef}
                      isDragging={snapshot.isDragging}
                      disableRemove={isDragging}
                    />
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );
  }

  // Non-controller: no drag-and-drop, but still memoized
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
      {queue.map((item, idx) => (
        <TrackRow
          key={item.url || idx}
          item={item}
          idx={idx}
          selectedTrackIdx={selectedTrackIdx}
          queueAnimations={queueAnimations}
          onSelectTrack={onSelectTrack}
          handleRemove={handleRemove}
          loading={loading}
          isController={isController}
          disableRemove={isDragging}
        />
      ))}
    </div>
  );
}

export default QueueList;