import React, { useId } from 'react';
import PropTypes from 'prop-types';
import { SparkleIcon } from './Icons';

const FeatureHighlight = ({ icon, text, tooltip, accent, delay = 0, tabIndex = 0, ariaLabel, ...props }) => {
  const tooltipId = useId();
  return (
    <div
      className={`relative flex items-center gap-2 text-xs sm:text-sm text-neutral-400 group cursor-pointer transition-all duration-300 hover:text-white hover:scale-105`}
      style={{ transitionDelay: `${delay}ms` }}
      tabIndex={tabIndex}
      role="button"
      aria-label={ariaLabel || text}
      aria-describedby={tooltipId}
      {...props}
    >
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br ${accent} transition-all duration-300 shadow-md`}
      >
        {icon}
      </div>
      <span className="transition-all duration-300 group-hover:translate-x-1 font-semibold">
        {text}
      </span>
      {/* Tooltip on hover/focus */}
      <div
        id={tooltipId}
        className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 opacity-0 group-hover:opacity-100 group-focus:opacity-100 pointer-events-none transition-opacity duration-300"
        role="tooltip"
        aria-live="polite"
      >
        <span className="px-2 py-1 rounded bg-neutral-900/90 text-xs text-neutral-200 shadow-lg border border-neutral-700 whitespace-nowrap">
          {tooltip}
        </span>
      </div>
      {/* Accent sparkle */}
      <SparkleIcon className="absolute -top-2 -right-2 w-3 h-3 text-white opacity-0 group-hover:opacity-80 transition-all duration-500 group-hover:animate-twinkle" />
    </div>
  );
};

FeatureHighlight.propTypes = {
  icon: PropTypes.node.isRequired,
  text: PropTypes.string.isRequired,
  tooltip: PropTypes.string.isRequired,
  accent: PropTypes.string.isRequired,
  delay: PropTypes.number,
  tabIndex: PropTypes.number,
  ariaLabel: PropTypes.string,
};

export default FeatureHighlight; 