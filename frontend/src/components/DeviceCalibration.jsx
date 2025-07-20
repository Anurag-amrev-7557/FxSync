import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';

// Enhanced smooth progress hook with advanced spring physics and proper error handling
function useSmoothProgress(targetProgress, duration = 300) {
  const [currentProgress, setCurrentProgress] = useState(0);
  const animationRef = useRef(null);
  const startTimeRef = useRef(null);
  const startProgressRef = useRef(0);

  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startTime = performance.now();
    const startProgress = currentProgress;
    
    startTimeRef.current = startTime;
    startProgressRef.current = startProgress;

    const animate = (currentTime) => {
      try {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Enhanced spring easing with smoother motion
        const springProgress = 1 - Math.pow(2, -12 * progress) * Math.cos(progress * Math.PI * 2.5) * (1 - progress * 0.3) * (1 + Math.sin(progress * Math.PI * 1.5) * 0.05);
        
        const newProgress = startProgress + (targetProgress - startProgress) * springProgress;
        
        // Ensure progress never exceeds 100%
        const clampedNewProgress = Math.min(Math.max(newProgress, 0), 100);
        
        setCurrentProgress(clampedNewProgress);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      } catch (error) {
        console.warn('Animation error:', error);
        // Fallback to direct value
        setCurrentProgress(Math.min(targetProgress, 100));
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetProgress, duration]);

  return currentProgress;
}

/**
 * DeviceCalibration - Automatic device-specific latency measurement wizard
 * @param {Object} props
 * @param {function} props.onDone - Callback when calibration is complete
 * @param {Object} props.socket - Socket connection for network measurements
 * @param {function} props.onSkip - Optional callback when calibration is skipped
 * @param {string} props.theme - Theme ('dark' or 'light'), defaults to 'dark'
 */
export default function DeviceCalibration({ onDone, socket, onSkip, theme = 'dark' }) {
  // --- Accessibility: Focus trap, ARIA, keyboard nav ---
  const modalRef = useRef(null);
  const [focusableElements, setFocusableElements] = useState([]);
  
  // Update focusable elements when content changes
  useLayoutEffect(() => {
    if (!modalRef.current) return;
    const elements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    setFocusableElements(Array.from(elements));
  }, []);

  useEffect(() => {
    if (!modalRef.current || focusableElements.length === 0) return;
    
    // Focus first element
    focusableElements[0]?.focus();
    
    function trap(e) {
      if (e.key !== 'Tab') return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    
    modalRef.current.addEventListener('keydown', trap);
    return () => modalRef.current?.removeEventListener('keydown', trap);
  }, [focusableElements]);

  // --- Calibration steps ---
  const steps = [
    { key: 'latency', label: 'Audio Latency', desc: 'How quickly your device can play sound.' },
    { key: 'rtt', label: 'RTT', desc: 'Network round-trip time to server.' },
    { key: 'jitter', label: 'Jitter', desc: 'Network timing variability.' },
    { key: 'offset', label: 'Offset', desc: 'Clock difference with server.' },
  ];

  // --- Consolidated state management ---
  const [calibrationState, setCalibrationState] = useState({
    step: 0,
    measuring: true,
    calibrationDone: false,
    showButtons: false,
    showResults: false,
    error: null,
    miniProgress: 0,
    latency: null,
    rtt: null,
    jitter: null,
    offset: null,
    progressComplete: false,
  });

  const [manualOverride, setManualOverride] = useState(false);
  const [manualValues, setManualValues] = useState({ latency: '', rtt: '', jitter: '', offset: '' });
  const [calibrationKey, setCalibrationKey] = useState(0);
  const [ariaStatus, setAriaStatus] = useState('');
  const [copied, setCopied] = useState(false);

  // --- Reduced motion support ---
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // --- Standardized timing system ---
  const TIMING = {
    // Core timing values
    minStepTime: prefersReducedMotion ? 150 : 400,
    animationDuration: prefersReducedMotion ? '0.15s' : '0.3s',
    transitionDuration: prefersReducedMotion ? '0.15s' : '0.4s',
    progressAnimationTime: prefersReducedMotion ? 200 : 800,
    buttonDelay: prefersReducedMotion ? 300 : 600,
    
    // Animation durations
    fadeInUp: prefersReducedMotion ? '0.3s' : '0.6s',
    fadeInScale: prefersReducedMotion ? '0.4s' : '0.8s',
    shimmer: prefersReducedMotion ? '0s' : '2s',
    pulse: prefersReducedMotion ? '0s' : '2s',
    glowPulse: prefersReducedMotion ? '0s' : '2s',
    
    // Transition delays
    titleDelay: prefersReducedMotion ? '0.1s' : '0.2s',
    progressDelay: prefersReducedMotion ? '0.2s' : '0.4s',
    buttonTransitionDelay: prefersReducedMotion ? '0.3s' : '0.5s',
    checkmarkDelay: prefersReducedMotion ? '0.05s' : '0.1s',
    
    // Easing functions
    easeOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeBounce: 'cubic-bezier(.4,1,.4,1)',
    
    // Progress bar timing
    progressUpdateInterval: prefersReducedMotion ? 50 : 100,
    shimmerSpeed: prefersReducedMotion ? 0 : 0.003
  };

  // --- Progress calculation with proper state management and validation ---
  const progress = React.useMemo(() => {
    try {
      const { step, miniProgress, calibrationDone, showButtons, progressComplete } = calibrationState;
      
      // Validate state consistency
      if (calibrationDone && showButtons) {
        return 100;
      }
      if (progressComplete) {
        return 100;
      }
      
      const calculatedProgress = Math.round(((step + miniProgress / 100) / steps.length) * 100);
      return Math.max(0, Math.min(calculatedProgress, 100));
    } catch (error) {
      console.warn('Progress calculation error:', error);
      return 0;
    }
  }, [calibrationState.step, calibrationState.miniProgress, calibrationState.calibrationDone, calibrationState.showButtons, calibrationState.progressComplete]);

  // Ensure progress never goes backward
  const maxProgressRef = useRef(0);
  useLayoutEffect(() => {
    if (progress > maxProgressRef.current) {
      maxProgressRef.current = progress;
    }
  }, [progress]);

  const displayedProgress = Math.max(progress, maxProgressRef.current);
  const progressValue = Math.max(0, Math.min(displayedProgress, 100));
  
  // Ensure progress never exceeds 100%
  const clampedProgressValue = Math.min(progressValue, 100);

  // --- Ultra-smooth progress animation with balanced timing ---
  const smoothProgress = useSmoothProgress(clampedProgressValue, TIMING.progressAnimationTime);

  // --- Circular Progress Bar SVG ---
  const circleSize = 64;
  const strokeWidth = 2;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const tickPath = "M24 34 L30 40 L44 24";
  const tickLength = 28;
  const offsetValue = circumference * (1 - smoothProgress / 100);

  // --- Calibration logic with proper cleanup ---
  useEffect(() => {
    let cancelled = false;
    let timeouts = [];

    const addTimeout = (callback, delay) => {
      const timeout = setTimeout(callback, delay);
      timeouts.push(timeout);
      return timeout;
    };

    const cleanup = () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
      timeouts = [];
    };

    async function measureAll() {
      // Reset state
      setCalibrationState(prev => ({
        ...prev,
        calibrationDone: false,
        showButtons: false,
        showResults: false,
        error: null,
        step: 0,
        miniProgress: 0,
      }));
      setAriaStatus('');

      // --- Step 1: Audio Latency ---
      if (cancelled) return;
      
      setCalibrationState(prev => ({ ...prev, step: 0, miniProgress: 0 }));
      
      let measured = null;
      let audioError = null;
      
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.baseLatency && ctx.baseLatency > 0 && ctx.baseLatency < 1) {
          measured = ctx.baseLatency;
        } else {
          audioError = 'Could not measure audio latency (unsupported browser/device).';
        }
        await ctx.close();
      } catch (e) {
        audioError = 'AudioContext error: ' + (e.message || e);
      }

      if (cancelled) return;
      
      setCalibrationState(prev => ({ 
        ...prev, 
        latency: measured, 
        miniProgress: 100 
      }));

      await new Promise(resolve => {
        addTimeout(resolve, TIMING.minStepTime);
      });

      if (audioError) {
        if (cancelled) return;
        setCalibrationState(prev => ({
          ...prev,
          measuring: false,
          calibrationDone: false,
          showButtons: true,
          error: audioError,
        }));
        setAriaStatus('Calibration failed: ' + audioError);
        return;
      }

      // --- Step 2: RTT/Jitter/Offset ---
      if (cancelled) return;
      
      setCalibrationState(prev => ({ ...prev, step: 1, miniProgress: 0 }));
      
      let rttSamples = [];
      let offsetSamples = [];
      let socketError = null;

      if (socket && typeof socket.emit === 'function') {
        for (let i = 0; i < 5; ++i) {
          if (cancelled) return;
          
          await new Promise(resolve => {
            const clientSent = Date.now();
            let responded = false;
            
            const timeout = addTimeout(() => {
              if (!responded) {
                socketError = 'Network/server error during RTT test.';
                resolve();
              }
            }, 2000);

            socket.emit('time_sync', { clientSent }, (res) => {
              responded = true;
              clearTimeout(timeout);
              const clientReceived = Date.now();
              
              if (res && typeof res.serverTime === 'number' && typeof res.serverReceived === 'number') {
                const rttSample = clientReceived - clientSent;
                const offsetSample = res.serverTime + rttSample / 2 - clientReceived;
                rttSamples.push(rttSample);
                offsetSamples.push(offsetSample);
              }
              
              setCalibrationState(prev => ({
                ...prev,
                miniProgress: Math.round(((i + 1) / 5) * 100)
              }));
              
              addTimeout(resolve, 15);
            });
          });
          
          if (socketError) break;
        }
      } else {
        socketError = 'Socket not available.';
      }

      if (socketError) {
        if (cancelled) return;
        setCalibrationState(prev => ({
          ...prev,
          measuring: false,
          calibrationDone: false,
          showButtons: true,
          error: socketError,
        }));
        setAriaStatus('Calibration failed: ' + socketError);
        return;
      }

      // --- Step 3: Jitter/Offset Calculation ---
      if (cancelled) return;
      
      setCalibrationState(prev => ({ ...prev, step: 2, miniProgress: 0 }));
      
      await new Promise(resolve => {
        addTimeout(resolve, TIMING.minStepTime);
      });

      if (cancelled) return;

      if (rttSamples.length) {
        const avgRtt = rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length;
        const mean = avgRtt;
        const stddev = Math.sqrt(rttSamples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rttSamples.length);
        
        setCalibrationState(prev => ({
          ...prev,
          rtt: avgRtt,
          jitter: stddev,
        }));
      }

      if (offsetSamples.length) {
        const avgOffset = offsetSamples.reduce((a, b) => a + b, 0) / offsetSamples.length;
        setCalibrationState(prev => ({ ...prev, offset: avgOffset }));
      }

      setCalibrationState(prev => ({ ...prev, miniProgress: 100 }));

      // Wait for progress bar to reach 100% before completing
      const progressAnimationTime = TIMING.progressAnimationTime;
      await new Promise(resolve => {
        addTimeout(resolve, Math.max(TIMING.minStepTime, progressAnimationTime));
      });

      if (cancelled) return;

      // --- Step 4: Final completion step ---
      setCalibrationState(prev => ({ ...prev, step: 3, miniProgress: 100 }));
      
      // Ensure progress bar reaches 100% before final completion
      await new Promise(resolve => {
        addTimeout(resolve, TIMING.minStepTime);
      });

      if (cancelled) return;

      // Mark progress as complete
      setCalibrationState(prev => ({ ...prev, progressComplete: true }));

      // --- Store in localStorage ---
      const key = 'audioLatency_' + (navigator.userAgent || 'unknown');
      const data = {
        latency: measured,
        rtt: rttSamples.length ? rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length : null,
        jitter: rttSamples.length ? Math.sqrt(rttSamples.reduce((a, b) => a + Math.pow(b - (rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length)), 2), 0) / rttSamples.length : null,
        offset: offsetSamples.length ? offsetSamples.reduce((a, b) => a + b, 0) / offsetSamples.length : null,
      };
      localStorage.setItem(key, JSON.stringify(data));

      // --- Final state update ---
      setCalibrationState(prev => ({
        ...prev,
        measuring: false,
        calibrationDone: true,
        showResults: true,
      }));
      
      setAriaStatus('Calibration complete.');
      
      // Wait for animations to complete before showing buttons
      addTimeout(() => {
        if (!cancelled) {
          setCalibrationState(prev => ({ ...prev, showButtons: true }));
        }
      }, TIMING.buttonDelay);
    }

    measureAll();
    return cleanup;
  }, [socket, calibrationKey, TIMING.minStepTime]);

  // --- Performance monitoring ---
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const startTime = performance.now();
      return () => {
        const endTime = performance.now();
        if (endTime - startTime > 1000) {
          console.warn('DeviceCalibration: Long render time detected:', endTime - startTime, 'ms');
        }
      };
    }
  });

  // --- Event handlers ---
  const handleEnterRoom = useCallback(() => {
    setAriaStatus('Entering room.');
    onDone({ 
      latency: calibrationState.latency, 
      rtt: calibrationState.rtt, 
      jitter: calibrationState.jitter, 
      offset: calibrationState.offset 
    });
  }, [calibrationState, onDone]);

  const handleRecalibrate = useCallback(() => {
    setCalibrationKey(k => k + 1);
  }, []);

  const handleSkip = useCallback(() => {
    setAriaStatus('Calibration skipped.');
    if (onSkip) onSkip();
    else onDone({ latency: null, rtt: null, jitter: null, offset: null });
  }, [onSkip, onDone]);

  const handleManualOverride = useCallback(() => {
    setManualOverride(true);
    setCalibrationState(prev => ({ ...prev, showResults: true, showButtons: true }));
    setAriaStatus('Manual override.');
  }, []);

  const handleManualChange = useCallback((k, v) => {
    setManualValues(vals => ({ ...vals, [k]: v }));
  }, []);

  const handleManualSubmit = useCallback(() => {
    setAriaStatus('Manual calibration entered.');
    onDone({
      latency: parseFloat(manualValues.latency) || null,
      rtt: parseFloat(manualValues.rtt) || null,
      jitter: parseFloat(manualValues.jitter) || null,
      offset: parseFloat(manualValues.offset) || null,
    });
  }, [manualValues, onDone]);

  const handleCopy = useCallback(() => {
    const text = `Latency: ${calibrationState.latency}\nRTT: ${calibrationState.rtt}\nJitter: ${calibrationState.jitter}\nOffset: ${calibrationState.offset}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [calibrationState]);

  // --- Theme ---
  const isDark = theme === 'dark';



  // --- Enhanced CSS animations for ultra-smooth effects ---
  const shimmerKeyframes = `
    @keyframes shimmer {
      0% { transform: translateX(-100%) scaleX(0.5); opacity: 0; }
      25% { opacity: 1; }
      50% { transform: translateX(0%) scaleX(1); opacity: 1; }
      75% { opacity: 1; }
      100% { transform: translateX(100%) scaleX(0.5); opacity: 0; }
    }
    
    @keyframes pulse {
      0% { opacity: 0.8; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.02); }
      100% { opacity: 0.8; transform: scale(1); }
    }
    
    @keyframes breathe {
      0% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(1.05); opacity: 1; }
      100% { transform: scale(1); opacity: 0.9; }
    }
    
    @keyframes fadeInUp {
      0% { opacity: 0; transform: translateY(20px) scale(0.95); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    
    @keyframes fadeInScale {
      0% { opacity: 0; transform: scale(0.8); }
      100% { opacity: 1; transform: scale(1); }
    }
    
    @keyframes glowPulse {
      0% { box-shadow: 0 0 8px rgba(255,255,255,0.3); }
      50% { box-shadow: 0 0 16px rgba(255,255,255,0.5); }
      100% { box-shadow: 0 0 8px rgba(255,255,255,0.3); }
    }
    
    @keyframes fadeInScale {
      0% { opacity: 0; transform: scale(0.8); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;

  // Inject CSS animations
  useEffect(() => {
    if (prefersReducedMotion) return;
    
    const styleId = 'device-calibration-animations';
    let styleElement = document.getElementById(styleId);
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    
    styleElement.textContent = shimmerKeyframes;
    
    return () => {
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
    };
  }, [shimmerKeyframes, prefersReducedMotion]);

  // --- UI ---
  const { calibrationDone, showButtons, error, measuring } = calibrationState;
  const completedStep = calibrationDone && showButtons ? steps.length : calibrationState.step;

  return (
    <div
      ref={modalRef}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 transition-opacity duration-500 mb-0`}
                style={{ 
            minHeight: '100vh', 
            minWidth: '100vw',
            opacity: 1,
            transition: `opacity ${TIMING.transitionDuration} ${TIMING.easeOut}`,
            background: measuring 
              ? 'radial-gradient(circle at center, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.9) 100%)'
              : 'rgba(0,0,0,0.9)'
          }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calib-title"
      aria-describedby="calib-desc"
      aria-busy={measuring}
      aria-live="polite"
    >
      <div
        className="relative flex flex-col items-center mb-0 w-full max-w-sm sm:max-w-md md:max-w-lg mx-auto p-3 sm:p-6 md:p-10 rounded-xl sm:rounded-2xl bg-black border border-white/10 shadow-none"
        style={{
          background: 'rgba(0,0,0,1)',
          boxShadow: 'none',
          border: '1.5px solid #fff2',
          transition: `all ${TIMING.transitionDuration} ${TIMING.easeOut}`,
          animation: prefersReducedMotion ? 'none' : `fadeInUp ${TIMING.fadeInUp} ${TIMING.easeOut}`,
          transform: measuring ? 'scale(1)' : 'scale(1)',
          height: 'auto',
          overflow: 'hidden',
          padding: showButtons ? '40px 24px' : '32px 24px',
          transitionProperty: 'all, transform, opacity'
        }}
      >
        {/* Top: Enhanced circular progress or tick */}
        <div 
          className="flex items-center justify-center mb-3" 
          style={{ 
            height: circleSize
          }}
        >
          <svg
            width={circleSize}
            height={circleSize}
            viewBox={`0 0 ${circleSize} ${circleSize}`}
            className="block"
            aria-hidden="true"
            style={{ 
              display: 'block', 
              transition: `all ${TIMING.animationDuration} ${TIMING.easeOut}`,
              filter: measuring ? 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' : 'none'
            }}
          >
            {/* Track */}
            <circle
              cx={circleSize / 2}
              cy={circleSize / 2}
              r={radius}
              fill="none"
              stroke="#222"
              strokeWidth={strokeWidth}
              style={{
                transition: `stroke ${TIMING.animationDuration} ${TIMING.easeOut}, opacity ${TIMING.animationDuration} ${TIMING.easeOut}`,
                opacity: calibrationDone ? 0 : 1
              }}
            />
            {/* Enhanced Progress */}
            <circle
              cx={circleSize / 2}
              cy={circleSize / 2}
              r={radius}
              fill="none"
              stroke="#fff"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={calibrationDone ? 0 : offsetValue}
              strokeLinecap="round"
                              style={{
                  transition: calibrationDone
                    ? `stroke-dashoffset ${TIMING.animationDuration} ${TIMING.easeOut}, opacity ${TIMING.animationDuration} ${TIMING.easeOut}`
                    : `stroke-dashoffset 0.1s linear, opacity ${TIMING.animationDuration} ${TIMING.easeOut}`,
                  filter: measuring ? 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' : 'drop-shadow(0 0 2px #fff2)',
                  opacity: calibrationDone ? 0 : 1,
                  transitionDelay: calibrationDone ? TIMING.checkmarkDelay : '0s',
                  animation: measuring && !prefersReducedMotion ? `glowPulse ${TIMING.glowPulse} ease-in-out infinite` : 'none'
                }}
            />
            {/* Percentage */}
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="1rem"
              fill="#fff"
              fontFamily="monospace"
              fontWeight="400"
              style={{
                letterSpacing: '-0.04em',
                opacity: calibrationDone ? 0 : 0.7,
                userSelect: 'none',
                transition: `opacity ${TIMING.animationDuration} ${TIMING.easeOut}`,
              }}
            >
              {Math.round(smoothProgress)}%
            </text>
            {/* Checkmark */}
            <path
              d={tickPath}
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={tickLength}
              strokeDashoffset={calibrationDone ? 0 : tickLength}
                          style={{
              filter: 'drop-shadow(0 0 2px #fff2)',
              transition: calibrationDone
                ? `stroke-dashoffset ${TIMING.animationDuration} ${TIMING.checkmarkDelay} ${TIMING.easeBounce}, opacity ${TIMING.animationDuration} ${TIMING.easeOut}`
                : `stroke-dashoffset ${TIMING.animationDuration} ${TIMING.easeOut}`,
              opacity: calibrationDone ? 1 : 0,
            }}
            />
          </svg>
        </div>

        {/* Enhanced Title & subtitle */}
        <div 
          className="mb-4 sm:mb-6 flex flex-col items-center" 
          style={{ 
            transition: `all ${TIMING.animationDuration} ${TIMING.easeOut}`,
            animation: !prefersReducedMotion ? `fadeInScale ${TIMING.fadeInScale} ${TIMING.easeOut} ${TIMING.titleDelay} both` : 'none',
            marginBottom: '24px',
            transform: showButtons ? 'scale(0.95)' : 'scale(1)'
          }}
        >
          <span
            id="calib-title"
            className="text-base sm:text-lg md:text-xl font-semibold tracking-tight font-sans select-none text-white"
            style={{ 
              letterSpacing: '-0.01em',
              textShadow: measuring ? '0 0 8px rgba(255,255,255,0.3)' : 'none',
              transition: 'text-shadow 0.3s ease'
            }}
          >
            {calibrationDone ? 'Calibration Complete' : 'Device & Network Calibration'}
          </span>
          <span
            id="calib-desc"
            className="text-xs sm:text-sm text-center flex justify-center text-white/60 mt-1 font-sans select-none"
            style={{ 
              fontWeight: 400, 
              letterSpacing: '-0.01em',
              opacity: measuring ? 0.8 : 0.6,
              transition: 'opacity 0.3s ease'
            }}
          >
            {calibrationDone
              ? 'Your device and network are ready for perfectly synced music.'
              : 'Measuring your device and network timing for perfect music sync.'}
          </span>
        </div>

        {/* Ultra-smooth linear progress bar */}
        <div 
          className="w-full max-w-xs sm:max-w-sm"
          style={{
            transition: `all ${TIMING.animationDuration} ${TIMING.easeOut}`,
            opacity: !showButtons ? 1 : 0,
            transform: !showButtons ? (measuring ? 'scale(1.02)' : 'scale(1)') : 'scale(0.95)',
            pointerEvents: !showButtons ? 'auto' : 'none',
            height: showButtons ? '0px' : '20px',
            overflow: 'hidden',
            marginBottom: showButtons ? '0px' : '12px',
            transitionDelay: showButtons ? '0.3s' : '0s',
            animation: !prefersReducedMotion ? `fadeInScale ${TIMING.fadeInScale} ${TIMING.easeOut} ${TIMING.progressDelay} both` : 'none'
          }}
        >
          <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden relative">
            {/* Enhanced background glow effect */}
            <div
              className="absolute inset-0 rounded-full opacity-20"
              style={{
                background: 'linear-gradient(90deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
                transform: `scaleX(${smoothProgress / 100})`,
                transformOrigin: 'left center',
                transition: 'transform 0.1s linear',
                filter: measuring ? 'blur(0.5px)' : 'none'
              }}
            />
            {/* Enhanced main progress bar */}
            <div
              className="h-full rounded-full relative"
              style={{
                width: `${smoothProgress}%`,
                background: measuring 
                  ? 'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.9) 100%)'
                  : 'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.9) 100%)',
                boxShadow: measuring
                  ? `0 0 ${12 + (smoothProgress / 8)}px rgba(255,255,255,${0.4 + (smoothProgress / 150)})`
                  : `0 0 ${8 + (smoothProgress / 10)}px rgba(255,255,255,${0.3 + (smoothProgress / 200)})`,
                transition: 'width 0.1s linear, box-shadow 0.1s linear, background 0.3s ease',
                animation: measuring && !prefersReducedMotion ? `pulse ${TIMING.pulse} ease-in-out infinite` : 'none'
              }}
            >
              {/* Enhanced animated shimmer effect */}
              <div
                className="absolute inset-0 rounded-full opacity-40"
                style={{
                  background: measuring
                    ? 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)'
                    : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                  animation: prefersReducedMotion ? 'none' : `shimmer ${TIMING.shimmer} ease-in-out infinite`,
                  filter: measuring ? 'blur(0.3px)' : 'none'
                }}
              />
              {/* Completion sparkle effect */}
              {smoothProgress >= 99.5 && !prefersReducedMotion && (
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, transparent 70%)',
                    animation: 'fadeInScale 0.5s ease-out',
                    opacity: 0.6
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Bottom: Enter button and info */}
        <div 
          className="flex flex-col items-center w-full max-w-xs sm:max-w-sm" 
          style={{
            transition: `all ${TIMING.animationDuration} ${TIMING.easeOut}`,
            opacity: calibrationDone && showButtons ? 1 : 0,
            transform: calibrationDone && showButtons ? 'scale(1)' : 'scale(0.95)',
            pointerEvents: calibrationDone && showButtons ? 'auto' : 'none',
            overflow: 'hidden',
            marginTop: '0px',
            height: calibrationDone && showButtons ? 'auto' : '0px',
            transitionDelay: calibrationDone && showButtons ? TIMING.buttonTransitionDelay : '0s',
            animation: calibrationDone && showButtons && !prefersReducedMotion ? `fadeInScale ${TIMING.fadeInScale} ${TIMING.easeOut} ${TIMING.progressDelay} both` : 'none'
          }}
        >
          <button
            className="w-full py-2 sm:py-3 md:py-[6px] rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white"
            style={{ 
              transition: `all ${TIMING.animationDuration} ${TIMING.easeOut}`,
              boxShadow: '0 4px 12px rgba(255,255,255,0.2)',
              transform: 'translateY(0)',
              animation: !prefersReducedMotion ? `fadeInScale ${TIMING.fadeInScale} ${TIMING.easeOut} ${TIMING.progressDelay} both` : 'none'
            }}
            onMouseEnter={(e) => {
              if (!prefersReducedMotion) {
                e.target.style.transform = 'translateY(-2px) scale(1.02)';
                e.target.style.boxShadow = '0 6px 20px rgba(255,255,255,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0) scale(1)';
              e.target.style.boxShadow = '0 4px 12px rgba(255,255,255,0.2)';
            }}
            onClick={handleEnterRoom}
            tabIndex={0}
          >
            Enter Room
          </button>
          <div className="mt-3 sm:mt-4 text-xs sm:text-sm text-white/40 text-center font-sans select-none">
            For best results, use your device's native speakers.
          </div>
        </div>
        
        {/* Enhanced ARIA live region for screen readers */}
        <div 
          className="sr-only" 
          aria-live="polite" 
          aria-atomic="true"
          role="status"
        >
          {ariaStatus}
          {measuring && `Progress: ${Math.round(smoothProgress)}%`}
        </div>
      </div>
    </div>
  );
} 