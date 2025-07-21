import React, { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * ProgressBar - Audio player progress bar with custom thumb and seek support
 * @param {Object} props
 * @param {number} props.currentTime
 * @param {number} props.duration
 * @param {function} props.onSeek
 * @param {boolean} props.disabled
 */
export default function ProgressBar({ currentTime, duration, onSeek, disabled, onSeekStart, onSeekEnd, isDragging, tooltipTime, thin }) {
  const percent = isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0;
  const [dragging, setDragging] = useState(false);

  // Handlers for drag start/end
  const handleSeekStart = (e) => {
    setDragging(true);
    if (onSeekStart) onSeekStart(e);
  };
  const handleSeekEnd = (e) => {
    setDragging(false);
    if (onSeekEnd) onSeekEnd(e);
  };

  // Keyboard support for left/right arrow keys
  const handleKeyDown = (e) => {
    if (disabled) return;
    let newValue = currentTime;
    if (e.key === 'ArrowLeft') {
      newValue = Math.max(0, currentTime - 5); // 5s step
      onSeek(newValue);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      newValue = Math.min(duration, currentTime + 5);
      onSeek(newValue);
      e.preventDefault();
    }
  };

  // Tooltip time to show (prefer prop, fallback to currentTime)
  const tooltip = typeof tooltipTime === 'number' ? tooltipTime : currentTime;

  // Format time helper
  const formatTime = (t) => {
    if (typeof t !== 'number' || isNaN(t) || t < 0) return '0:00';
    const totalSeconds = Math.floor(t);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}`;
    }
    return `${minutes}:${seconds}`;
  };

  return (
    <div className="relative">
      <div className={thin ? "h-0.5 rounded-full overflow-hidden" : "h-1 rounded-full overflow-hidden"} style={{ background: 'rgba(255,255,255,0.18)' }}>
        <div 
          className={thin ? "h-0.5 bg-white rounded-full transition-all duration-300" : "h-full bg-white rounded-full transition-all duration-300"}
          style={{ width: `${percent}%` }}
        />
      </div>
      {/* Custom Thumb (hide in thin mode) */}
      {!thin && (
        <div 
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border border-neutral-300 transition-all duration-200 ${dragging || isDragging ? 'ring-2 ring-primary scale-110' : 'hover:scale-110'}`}
          style={{ left: `${percent}%`, transform: 'translate(-50%, -50%)' }}
        />
      )}
      {/* Tooltip on drag (hide in thin mode) */}
      {!thin && (dragging || isDragging) && (
        <div
          className="absolute z-10 left-0"
          style={{
            top: '-2.2em',
            left: `calc(${percent}% - 1.5em)`
          }}
        >
          <div className="px-2 py-1 rounded bg-neutral-900 text-white text-xs shadow-lg border border-neutral-700 select-none">
            {formatTime(tooltip)}
          </div>
        </div>
      )}
      <input
        type="range"
        min={0}
        max={isFinite(duration) ? duration : 0}
        step={0.01}
        value={isFinite(currentTime) ? currentTime : 0}
        onChange={e => onSeek(Number(e.target.value))}
        onMouseDown={handleSeekStart}
        onTouchStart={handleSeekStart}
        onMouseUp={handleSeekEnd}
        onTouchEnd={handleSeekEnd}
        onKeyDown={handleKeyDown}
        aria-valuenow={currentTime}
        aria-valuemax={duration}
        aria-valuemin={0}
        aria-label="Seek audio"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={disabled}
      />
    </div>
  );
}

ProgressBar.propTypes = {
  currentTime: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
  onSeek: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  onSeekStart: PropTypes.func,
  onSeekEnd: PropTypes.func,
  isDragging: PropTypes.bool,
  tooltipTime: PropTypes.number,
  thin: PropTypes.bool,
}; 