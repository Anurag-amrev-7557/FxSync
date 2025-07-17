import React from 'react';
import PropTypes from 'prop-types';

/**
 * TrackInfo - Animated track title (and optional metadata) for AudioPlayer
 * @param {Object} props
 * @param {string} props.title
 * @param {boolean} props.animating
 * @param {string} props.direction - 'up' or 'down'
 * @param {string} [props.className]
 */
export default function TrackInfo({ title, animating, direction, className = '' }) {
  return (
    <span
      className={`inline-block text-lg font-semibold text-white transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
        ${animating && direction === 'up' ? 'opacity-0 translate-x-6 scale-95' : ''}
        ${animating && direction === 'down' ? 'opacity-0 -translate-x-6 scale-95' : ''}
        ${!animating ? 'opacity-100 translate-x-0 scale-100' : ''}
        ${className}`}
      style={{
        willChange: 'opacity, transform',
        transitionProperty: 'opacity, transform',
      }}
    >
      {title || 'Unknown Track'}
    </span>
  );
}

TrackInfo.propTypes = {
  title: PropTypes.string,
  animating: PropTypes.bool,
  direction: PropTypes.oneOf(['up', 'down']),
  className: PropTypes.string
}; 