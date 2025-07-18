import React from 'react';
import PropTypes from 'prop-types';

/**
 * ProgressBar - Audio player progress bar with custom thumb and seek support
 * @param {Object} props
 * @param {number} props.currentTime
 * @param {number} props.duration
 * @param {function} props.onSeek
 * @param {boolean} props.disabled
 */
export default function ProgressBar({ currentTime, duration, onSeek, disabled }) {
  const percent = isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0;
  return (
    <div className="relative">
      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-white rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      {/* Custom Thumb */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border border-neutral-300 transition-all duration-200 hover:scale-110"
        style={{ left: `${percent}%`, transform: 'translate(-50%, -50%)' }}
      />
      <input
        type="range"
        min={0}
        max={isFinite(duration) ? duration : 0}
        step={0.01}
        value={isFinite(currentTime) ? currentTime : 0}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={disabled}
        aria-label="Seek audio"
      />
    </div>
  );
}

ProgressBar.propTypes = {
  currentTime: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
  onSeek: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
