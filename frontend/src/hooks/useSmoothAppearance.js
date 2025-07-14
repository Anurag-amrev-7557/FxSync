import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * Enhanced custom hook for smooth element appearance with advanced features
 * @param {boolean} shouldShow - Whether the element should be visible
 * @param {Object} options - Configuration options
 * @param {number} options.delay - Delay before showing the element (in ms)
 * @param {string} options.animationClass - Tailwind animation class to use
 * @param {string} options.enterClass - Custom enter animation class
 * @param {string} options.exitClass - Custom exit animation class
 * @param {number} options.enterDuration - Enter animation duration (ms)
 * @param {number} options.exitDuration - Exit animation duration (ms)
 * @param {boolean} options.spring - Use springy cubic-bezier for timing
 * @param {boolean} options.persistent - Whether to keep animation state after completion
 * @param {Function} options.onEnter - Callback when element enters
 * @param {Function} options.onExit - Callback when element exits
 * @param {boolean} options.resetOnShow - Whether to reset animation when showing again
 * @returns {object} - { isVisible, animationClass: string, hasAnimated, isEntering, isExiting, animationKey, transformStyles }
 */
export default function useSmoothAppearance(shouldShow, options = {}) {
  const {
    delay = 0,
    animationClass = 'animate-fade-in',
    enterClass = 'animate-slide-up',
    exitClass = 'animate-slide-down',
    enterDuration = 200,
    exitDuration = 200,
    spring = false,
    persistent = false,
    onEnter,
    onExit,
    resetOnShow = false
  } = options;

  // Reduced motion detection
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [isVisible, setIsVisible] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);

  const timerRef = useRef();
  const animationTimerRef = useRef();
  const exitTimerRef = useRef();

  useEffect(() => {
    // Cleanup any previous timers
    if (timerRef.current) clearTimeout(timerRef.current);
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);

    if (shouldShow && !isVisible) {
      if (resetOnShow) {
        setHasAnimated(false);
        setAnimationKey(prev => prev + 1);
      }
      timerRef.current = setTimeout(() => {
        setIsVisible(true);
        setIsExiting(false);
        setIsEntering(true);
        animationTimerRef.current = setTimeout(() => {
          setHasAnimated(true);
          setIsEntering(false);
          if (onEnter) onEnter();
        }, prefersReducedMotion ? 0 : enterDuration);
      }, delay);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
      };
    } else if (!shouldShow && isVisible) {
      setIsExiting(true);
      setIsEntering(false);
      exitTimerRef.current = setTimeout(() => {
        setIsVisible(false);
        if (!persistent) {
          setHasAnimated(false);
        }
        setIsExiting(false);
        if (onExit) onExit();
      }, prefersReducedMotion ? 0 : exitDuration);
      return () => {
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      };
    }
    // Cleanup on unmount
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [shouldShow, isVisible, delay, persistent, resetOnShow, onEnter, onExit, enterDuration, exitDuration, prefersReducedMotion]);

  // Memoized animation class logic
  const memoizedAnimationClass = useMemo(() => {
    if (prefersReducedMotion) return '';
    const willChange = 'will-change-transform will-change-opacity';
    const springy = spring ? 'transition-all' : '';
    const timing = spring ? 'ease-[cubic-bezier(0.22,1,0.36,1)]' : 'ease-in-out';
    const enter = `transition-all ${timing} duration-[${enterDuration}ms] ${willChange}`;
    const exit = `transition-all ${timing} duration-[${exitDuration}ms] ${willChange}`;
    if (!isVisible) return `${exit} opacity-0 scale-95 pointer-events-none`;
    if (isExiting) return `${exit} opacity-0 scale-95 pointer-events-none`;
    if (isEntering) return `${enter} opacity-100 scale-100`;
    if (!hasAnimated) return `${enter} opacity-100 scale-100`;
    return persistent ? '' : `opacity-100 scale-100 ${willChange}`;
  }, [prefersReducedMotion, spring, enterDuration, exitDuration, isVisible, isExiting, isEntering, hasAnimated, persistent]);

  // Memoized transform styles
  const memoizedTransformStyles = useMemo(() => {
    if (prefersReducedMotion) {
      return { opacity: isVisible ? 1 : 0, transform: 'none' };
    }
    if (!isVisible) {
      return {
        transform: 'translateY(20px) scale(0.95)',
        opacity: 0,
        willChange: 'transform, opacity'
      };
    }
    if (isExiting) {
      return {
        transform: 'translateY(-20px) scale(0.95)',
        opacity: 0,
        willChange: 'transform, opacity'
      };
    }
    return {
      transform: 'translateY(0) scale(1)',
      opacity: 1,
      willChange: 'transform, opacity'
    };
  }, [prefersReducedMotion, isVisible, isExiting]);

  return {
    isVisible,
    animationClass: memoizedAnimationClass,
    hasAnimated,
    isEntering,
    isExiting,
    animationKey,
    transformStyles: memoizedTransformStyles,
    reset: () => {
      setHasAnimated(false);
      setAnimationKey(prev => prev + 1);
    },
    forceShow: () => {
      setIsVisible(true);
      setHasAnimated(true);
      setIsExiting(false);
      setIsEntering(false);
    },
    forceHide: () => {
      setIsVisible(false);
      setHasAnimated(false);
      setIsExiting(false);
      setIsEntering(false);
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
    staggerDelay = 100,
    animationClass = 'animate-slide-up',
    reverse = false,
    loop = false,
    loopDelay = 2000,
    onAnimationComplete
  } = options;

  const [animatedItems, setAnimatedItems] = useState(new Set());
  const [isComplete, setIsComplete] = useState(false);
  const [isLooping, setIsLooping] = useState(false);

  const timersRef = useRef([]);

  const resetAnimations = useCallback(() => {
    setAnimatedItems(new Set());
    setIsComplete(false);
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const startAnimation = useCallback(() => {
    if (!items || items.length === 0) return;
    resetAnimations();
    const itemIndices = reverse ? 
      Array.from({ length: items.length }, (_, i) => items.length - 1 - i) : 
      Array.from({ length: items.length }, (_, i) => i);
    itemIndices.forEach((index, i) => {
      const timer = setTimeout(() => {
        setAnimatedItems(prev => {
          const newSet = new Set([...prev, index]);
          if (newSet.size === items.length) {
            setIsComplete(true);
            if (onAnimationComplete) {
              onAnimationComplete();
            }
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
      timersRef.current.push(timer);
    });
    return timersRef.current;
  }, [items, staggerDelay, reverse, loop, loopDelay, onAnimationComplete, isLooping, resetAnimations, setIsComplete, setAnimatedItems, setIsLooping]);

  useEffect(() => {
    const timers = startAnimation();
    return () => {
      if (timers) {
        timers.forEach(timer => clearTimeout(timer));
      }
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current = [];
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