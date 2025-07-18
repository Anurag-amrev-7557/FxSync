// Animation tokens for durations and easings
export const animationDurations = {
  fast: '150ms',
  normal: '300ms',
  slow: '500ms',
  extraSlow: '700ms',
};

export const animationEasings = {
  standard: 'cubic-bezier(0.22,1,0.36,1)',
  easeIn: 'cubic-bezier(0.4,0,1,1)',
  easeOut: 'cubic-bezier(0,0,0.2,1)',
  easeInOut: 'cubic-bezier(0.4,0,0.2,1)',
};

// Usage example:
// import { animationDurations, animationEasings } from './animationTokens';
// style={{ transitionDuration: animationDurations.normal, transitionTimingFunction: animationEasings.standard }} 