import React from 'react';
import PropTypes from 'prop-types';
import { animationDurations, animationEasings } from '../../utils/animationTokens';

/**
 * PlayerControls - Audio player transport controls (prev, play/pause, next)
 * @param {Object} props
 * @param {boolean} props.isPlaying
 * @param {function} props.onPlay
 * @param {function} props.onPause
 * @param {function} props.onNext
 * @param {function} props.onPrevious
 * @param {boolean} props.canGoNext
 * @param {boolean} props.canGoPrevious
 * @param {boolean} props.disabled
 * @param {boolean} props.isController
 * @param {string} [props.audioUrl]
 */
export default function PlayerControls({
  isPlaying,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  canGoNext,
  canGoPrevious,
  disabled,
  isController,
  audioUrl,
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Previous Button */}
      <button
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform transition-opacity duration-200 border-none bg-transparent p-0 ${
          canGoPrevious ? 'text-white hover:text-primary' : 'text-neutral-500 cursor-not-allowed'
        }`}
        onClick={onPrevious}
        disabled={!canGoPrevious}
        aria-label="Previous track"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="19 20 9 12 19 4 19 20"></polygon>
          <line x1="5" y1="19" x2="5" y2="5"></line>
        </svg>
      </button>
      {/* Play/Pause Button */}
      <button
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform transition-opacity duration-200 ${
          isPlaying ? 'bg-white text-black' : 'bg-primary hover:bg-primary/90 text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        onClick={isPlaying ? onPause : onPlay}
        disabled={disabled || !isController || !audioUrl}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        )}
      </button>
      {/* Next Button */}
      <button
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform transition-opacity duration-200 border-none bg-transparent p-0 ${
          canGoNext ? 'text-white hover:text-primary' : 'text-neutral-500 cursor-not-allowed'
        }`}
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next track"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="5 4 15 12 5 20 5 4"></polygon>
          <line x1="19" y1="5" x2="19" y2="19"></line>
        </svg>
      </button>
    </div>
  );
}

PlayerControls.propTypes = {
  isPlaying: PropTypes.bool.isRequired,
  onPlay: PropTypes.func.isRequired,
  onPause: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  onPrevious: PropTypes.func.isRequired,
  canGoNext: PropTypes.bool.isRequired,
  canGoPrevious: PropTypes.bool.isRequired,
  disabled: PropTypes.bool,
  isController: PropTypes.bool,
  audioUrl: PropTypes.string,
};
