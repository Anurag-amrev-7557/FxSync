import { useState, useEffect, useCallback } from 'react';

/**
 * Enhanced custom hook for smooth element appearance with advanced features
 * @param {boolean} shouldShow - Whether the element should be visible
 * @param {Object} options - Configuration options
 * @param {number} options.delay - Delay before showing the element (in ms)
 * @param {string} options.animationClass - Tailwind animation class to use
 * @param {string} options.enterClass - Custom enter animation class
 * @param {string} options.exitClass - Custom exit animation class
 * @param {boolean} options.persistent - Whether to keep animation state after completion
 * @param {Function} options.onEnter - Callback when element enters
 * @param {Function} options.onExit - Callback when element exits
 * @param {boolean} options.resetOnShow - Whether to reset animation when showing again
 * @returns {object} - { isVisible, animationClass: string, hasAnimated, isExiting }
 */
export default function useSmoothAppearance(shouldShow, options = {}) {
  const {
    delay = 0,
    animationClass = 'animate-fade-in', // Should match new 0.5s duration, cubic-bezier
    enterClass = 'animate-slide-up',    // Should match new 0.5s duration, cubic-bezier
    exitClass = 'animate-slide-down',   // Should match new 0.5s duration, cubic-bezier
    persistent = false,
    onEnter,
    onExit,
    resetOnShow = false
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const entranceDuration = 500; // ms
  const exitDuration = 500; // ms

  useEffect(() => {
    if (shouldShow && !isVisible) {
      // Reset animation state if needed
      if (resetOnShow) {
        setHasAnimated(false);
        setAnimationKey(prev => prev + 1);
      }

      const timer = setTimeout(() => {
        setIsVisible(true);
        setIsExiting(false);
        // Trigger enter animation
        const animationTimer = setTimeout(() => {
          setHasAnimated(true);
          if (onEnter) onEnter();
        }, 50); // Small delay to ensure DOM update
        return () => clearTimeout(animationTimer);
      }, delay);
      return () => clearTimeout(timer);
    } else if (!shouldShow && isVisible) {
      // Handle exit animation
      setIsExiting(true);
      const exitTimer = setTimeout(() => {
        setIsVisible(false);
        if (!persistent) {
          setHasAnimated(false);
        }
        if (onExit) onExit();
      }, exitDuration); // Exit animation duration now 500ms
      return () => clearTimeout(exitTimer);
    }
  }, [shouldShow, isVisible, delay, persistent, resetOnShow, onEnter, onExit]);

  // Enhanced animation class logic
  const getAnimationClass = () => {
    if (!isVisible) return 'opacity-0 scale-95';
    if (isExiting) {
      return `${exitClass} opacity-0 scale-95`;
    }
    if (!hasAnimated) {
      return `${animationClass} ${enterClass}`;
    }
    return persistent ? '' : 'opacity-100 scale-100';
  };

  // Get transform styles for additional control
  const getTransformStyles = () => {
    if (!isVisible) {
      return {
        transform: 'translateY(20px) scale(0.95)',
        opacity: 0
      };
    }
    if (isExiting) {
      return {
        transform: 'translateY(-20px) scale(0.95)',
        opacity: 0
      };
    }
    return {
      transform: 'translateY(0) scale(1)',
      opacity: 1
    };
  };

  return {
    isVisible,
    animationClass: getAnimationClass(),
    hasAnimated,
    isExiting,
    animationKey,
    transformStyles: getTransformStyles(),
    // Utility methods
    reset: () => {
      setHasAnimated(false);
      setAnimationKey(prev => prev + 1);
    },
    forceShow: () => {
      setIsVisible(true);
      setHasAnimated(true);
      setIsExiting(false);
    },
    forceHide: () => {
      setIsVisible(false);
      setHasAnimated(false);
      setIsExiting(false);
    }
  };
}

/**
 * Enhanced hook for staggered animations with advanced features
 * @param {Array} items - Array of items to animate
 * @param {Object} options - Configuration options
 * @param {number} options.staggerDelay - Delay between each item animation (default: 100ms)
 * @param {string} options.animationClass - Tailwind animation class to use (default: 'animate-slide-up')
 * @param {boolean} options.reverse - Whether to animate from last to first item
 * @param {boolean} options.loop - Whether to continuously loop the animation
 * @param {number} options.loopDelay - Delay before restarting the loop (default: 2000ms)
 * @param {Function} options.onAnimationComplete - Callback when all animations complete
 * @returns {Object} - { animationStates, isComplete, resetAnimations }
 */
export function useStaggeredAnimation(items, options = {}) {
  const {
    staggerDelay = 80, // ultra-smooth default
    animationClass = 'animate-slide-up',
    reverse = false,
    loop = false,
    loopDelay = 2000,
    onAnimationComplete
  } = options;

  const [animatedItems, setAnimatedItems] = useState(new Set());
  const [isComplete, setIsComplete] = useState(false);
  const [isLooping, setIsLooping] = useState(false);

  const resetAnimations = useCallback(() => {
    setAnimatedItems(new Set());
    setIsComplete(false);
  }, []);

  const startAnimation = useCallback(() => {
    if (!items || items.length === 0) return;

    resetAnimations();
    const timers = [];
    const itemIndices = reverse ? 
      Array.from({ length: items.length }, (_, i) => items.length - 1 - i) : 
      Array.from({ length: items.length }, (_, i) => i);

    itemIndices.forEach((index, i) => {
      const timer = setTimeout(() => {
        setAnimatedItems(prev => {
          const newSet = new Set([...prev, index]);
          
          // Check if all items are animated
          if (newSet.size === items.length) {
            setIsComplete(true);
            if (onAnimationComplete) {
              onAnimationComplete();
            }
            
            // Handle looping
            if (loop && !isLooping) {
              setIsLooping(true);
              setTimeout(() => {
                setIsLooping(false);
                startAnimation();
              }, loopDelay);
            }
          }
          
          return newSet;
        });
      }, i * staggerDelay);
      timers.push(timer);
    });

    return timers;
  }, [items, staggerDelay, reverse, loop, loopDelay, onAnimationComplete, isLooping, resetAnimations]);

  useEffect(() => {
    const timers = startAnimation();
    
    return () => {
      if (timers) {
        timers.forEach(timer => clearTimeout(timer));
      }
    };
  }, [startAnimation]);

  // Enhanced animation states with additional properties
  const animationStates = items.map((_, index) => ({
    isVisible: animatedItems.has(index),
    animationClass: animatedItems.has(index) ? animationClass : 'opacity-0',
    delay: index * staggerDelay,
    isLast: index === items.length - 1,
    isFirst: index === 0,
    progress: animatedItems.has(index) ? 1 : 0
  }));

  return {
    animationStates,
    isComplete,
    resetAnimations,
    isLooping,
    totalDuration: items.length * staggerDelay
  };
}