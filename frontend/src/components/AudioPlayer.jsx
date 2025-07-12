import React, { useEffect, useRef, useState } from 'react';
import SyncStatus from './SyncStatus';
import useSmoothAppearance from '../hooks/useSmoothAppearance';
import LoadingSpinner from './LoadingSpinner';
import ResyncAnalytics from './ResyncAnalytics';

// Add global error handlers
if (typeof window !== 'undefined' && !window._audioPlayerErrorHandlerAdded) {
  window.addEventListener('unhandledrejection', function(event) {
    // Remove all console.log, console.warn, and console.error statements
  });
  window.addEventListener('error', function(event) {
    // Remove all console.log, console.warn, and console.error statements
  });
  window._audioPlayerErrorHandlerAdded = true;
}

const DRIFT_THRESHOLD = 0.05; // seconds - reduced for better detection (was 0.12)
const PLAY_OFFSET = 0.35; // seconds (350ms future offset for play events)
const DEFAULT_AUDIO_LATENCY = 0.08; // 80ms fallback if not measured
const MICRO_DRIFT_THRESHOLD = 0.04; // seconds (was 0.08)
const MICRO_RATE_CAP = 0.03; // max playbackRate delta (was 0.07)
const MICRO_CORRECTION_WINDOW = 250; // ms (was 420)
const DRIFT_JITTER_BUFFER = 1; // consecutive drift detections before correction (reduced from 2)
const RESYNC_COOLDOWN_MS = 2000; // minimum time between manual resyncs
const RESYNC_HISTORY_SIZE = 5; // number of recent resyncs to track
const SMART_RESYNC_THRESHOLD = 0.5; // drift threshold for smart resync suggestion
const MICRO_DRIFT_MIN = 0.01; // 10ms
const MICRO_DRIFT_MAX = 0.1;  // 100ms
const MICRO_RATE_CAP_MICRO = 0.003; // max playbackRate delta for micro-correction

// Enhanced drift correction constants
const MEDIUM_DRIFT_THRESHOLD = 0.25; // seconds - use rate adjustment for drifts up to this
const LARGE_DRIFT_THRESHOLD = 0.5; // seconds - use seeking for drifts larger than this
const RATE_CORRECTION_DURATION = 2000; // ms - how long to apply rate correction
const RATE_CORRECTION_STRENGTH = 0.8; // how aggressive rate correction should be (0-1)
const SEEK_FALLBACK_THRESHOLD = 1.0; // seconds - only seek for very large drifts

// Large gap detection constants
const LARGE_GAP_THRESHOLD = 5.0; // seconds - for gaps larger than 5 seconds, force immediate correction
const EMERGENCY_SEEK_THRESHOLD = 10.0; // seconds - for gaps larger than 10 seconds, force immediate seek

// Enhanced sync optimization constants
const ADAPTIVE_SYNC_INTERVALS = {
  excellent: 1500, // 1.5s for excellent network
  good: 1000,      // 1s for good network  
  fair: 800,       // 800ms for fair network
  poor: 600        // 600ms for poor network
};

const RATE_TRANSITION_STEPS = 5; // Number of steps for gradual rate transitions
const RATE_TRANSITION_DURATION = 300; // ms per step
const MICRO_CORRECTION_HYSTERESIS = 0.005; // 5ms hysteresis to prevent oscillation
const ENHANCED_DRIFT_PREDICTION_WINDOW = 10; // seconds for enhanced prediction
const SYNC_STATE_VALIDATION_TIMEOUT = 5000; // 5s timeout for sync state validation

function isFiniteNumber(n) {
  return typeof n === 'number' && isFinite(n);
}

/**
 * Safely sets the currentTime of an audio element, handling cases where the audio is not yet ready.
 * - If the audio is ready, sets currentTime immediately.
 * - If not, waits for 'loadedmetadata' or 'canplay' events, whichever comes first.
 * - Handles edge cases and logs detailed context for debugging.
 * - Prevents duplicate event listeners and cleans up properly.
 * - Optionally, can force a reload if duration is NaN and value is 0 (common browser bug).
 */
function setCurrentTimeSafely(audio, value, setCurrentTime) {
  const logContext = {
    value,
    readyState: audio ? audio.readyState : null,
    duration: audio ? audio.duration : null,
    src: audio ? audio.currentSrc : null,
  };

  // Early return if value is not finite
  if (!isFiniteNumber(value)) {
    // Enhanced: throw for dev, warn for prod
    if (process.env.NODE_ENV === 'development') {
      throw new Error('setCurrentTimeSafely: value is not finite: ' + JSON.stringify(logContext));
    } else {
      console.warn('setCurrentTimeSafely: value is not finite', logContext);
    }
    return;
  }

  // Early return if audio element doesn't exist
  if (!audio) {
    console.warn('setCurrentTimeSafely: audio element not available', logContext);
    return;
  }

  // Helper to actually set currentTime and update state
  const doSet = (context, eventType = 'immediate') => {
    try {
      // Only set if different to avoid unnecessary seeks
      if (Math.abs(audio.currentTime - value) > 0.01) {
        audio.currentTime = value;
        // Don't update displayed time immediately to avoid timer jumps
        // The timeupdate event will handle this smoothly
        // setCurrentTime(value);
        // Optionally, fire a custom event for debugging
        // audio.dispatchEvent(new CustomEvent('currentTimeSetSafely', { detail: { value, eventType } }));
        // Enhanced: log only in dev
        if (process.env.NODE_ENV === 'development') {
          console.log(`[setCurrentTimeSafely] Set currentTime (${eventType})`, { ...context, actual: audio.currentTime });
        }
      }
    } catch (e) {
      console.warn(`[setCurrentTimeSafely] Failed to set currentTime (${eventType}):`, context, e);
    }
  };

  // If audio is ready and duration is known, set immediately
  if (
    audio.readyState >= 1 &&
    audio.duration &&
    isFinite(audio.duration)
  ) {
    doSet(logContext, 'immediate');
    return;
  }

  // If duration is NaN and value is 0, try to force reload (browser bug workaround)
  if (audio.duration === undefined || isNaN(audio.duration)) {
    if (value === 0 && audio.src && !audio.src.includes('forceReload')) {
      // Append a dummy query param to force reload
      audio.src = audio.src + (audio.src.includes('?') ? '&' : '?') + 'forceReload=' + TimingUtils.getTimeFor('network');
      // Optionally, log
      if (process.env.NODE_ENV === 'development') {
        console.log('[setCurrentTimeSafely] Forcing reload due to NaN duration', logContext);
      }
    }
  }

  // Otherwise, defer until audio is ready
  let handled = false;
  const cleanup = () => {
    audio.removeEventListener('loadedmetadata', onLoaded);
    audio.removeEventListener('canplay', onCanPlay);
  };

  const onLoaded = () => {
    if (handled) return;
    handled = true;
    const context = {
      value,
      readyState: audio.readyState,
      duration: audio.duration,
      src: audio.currentSrc,
      event: 'loadedmetadata',
    };
    if (audio.duration && isFinite(audio.duration)) {
      doSet(context, 'loadedmetadata');
    } else {
      console.warn('[setCurrentTimeSafely] Still not ready after loadedmetadata', context);
    }
    cleanup();
  };

  const onCanPlay = () => {
    if (handled) return;
    handled = true;
    const context = {
      value,
      readyState: audio.readyState,
      duration: audio.duration,
      src: audio.currentSrc,
      event: 'canplay',
    };
    if (audio.duration && isFinite(audio.duration)) {
      doSet(context, 'canplay');
    } else {
      console.warn('[setCurrentTimeSafely] Still not ready after canplay', context);
    }
    cleanup();
  };

  audio.addEventListener('loadedmetadata', onLoaded, { once: true });
  audio.addEventListener('canplay', onCanPlay, { once: true });

  // Enhanced: fallback timeout in case events never fire (e.g., broken stream)
  setTimeout(() => {
    if (!handled) {
      handled = true;
      const context = {
        value,
        readyState: audio.readyState,
        duration: audio.duration,
        src: audio.currentSrc,
        event: 'timeout',
      };
      if (audio.duration && isFinite(audio.duration)) {
        doSet(context, 'timeout');
      } else {
        console.warn('[setCurrentTimeSafely] Timeout waiting for audio readiness', context);
      }
      cleanup();
    }
  }, 3000);
}

// Enhanced timing utilities for high-precision audio synchronization
const TimingUtils = {
  // Get high-resolution absolute time (Unix timestamp equivalent)
  getAbsoluteTime: () => {
    if (window.performance && window.performance.timeOrigin) {
      return performance.timeOrigin + performance.now();
    }
    return Date.now();
  },

  // Get high-resolution relative time (monotonic, for duration calculations)
  getRelativeTime: () => {
    if (window.performance && window.performance.now) {
      return performance.now();
    }
    return Date.now();
  },

  // Get audio-specific time if available
  getAudioTime: (audioContext) => {
    if (audioContext && typeof audioContext.currentTime === 'number') {
      return audioContext.currentTime * 1000; // Convert to milliseconds
    }
    return TimingUtils.getRelativeTime();
  },

  // Get the most appropriate time for a given use case
  getTimeFor: (useCase = 'sync') => {
    switch (useCase) {
      case 'audio':
        // For audio operations, prefer audio context time
        return TimingUtils.getRelativeTime();
      case 'network':
        // For network operations, prefer absolute time
        return TimingUtils.getAbsoluteTime();
      case 'sync':
      default:
        // For sync operations, prefer high-resolution time
        return TimingUtils.getRelativeTime();
    }
  },

  // Measure time difference with high precision
  timeDiff: (start, end) => {
    return end - start;
  },

  // Check if timing is available and reliable
  isTimingReliable: () => {
    return !!(window.performance && window.performance.now);
  },

  // Atomic time operations to prevent race conditions
  atomicTimeUpdate: (callback) => {
    const startTime = TimingUtils.getTimeFor('sync');
    const result = callback();
    const endTime = TimingUtils.getTimeFor('sync');
    return {
      result,
      duration: endTime - startTime,
      timestamp: startTime
    };
  },

  // Debounced time operations to prevent excessive updates
  debouncedTimeUpdate: (() => {
    let timeoutId = null;
    return (callback, delay = 16) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        callback();
        timeoutId = null;
      }, delay);
    };
  })(),

  // Batch time operations for efficiency
  batchTimeOperations: (operations) => {
    const startTime = TimingUtils.getTimeFor('sync');
    const results = operations.map(op => op());
    const endTime = TimingUtils.getTimeFor('sync');
    return {
      results,
      batchDuration: endTime - startTime,
      timestamp: startTime
    };
  }
};

// Enhanced drift prediction and adaptive sync utilities
const EnhancedSyncUtils = {
  // Enhanced drift prediction using multiple algorithms
  predictDriftEnhanced: (driftHistory, timeHorizon = 5) => {
    if (!driftHistory || driftHistory.length < 3) return 0;
    
    const recent = driftHistory.slice(-5);
    const weights = [0.1, 0.15, 0.2, 0.25, 0.3]; // Weighted average favoring recent data
    
    // Defensive: ensure all drift values are valid numbers
    const validRecent = recent.filter(d => typeof d.drift === 'number' && isFinite(d.drift));
    if (validRecent.length < 3) return 0;
    
    // Linear regression prediction
    const n = validRecent.length;
    const sumX = validRecent.reduce((sum, _, i) => sum + i, 0);
    const sumY = validRecent.reduce((sum, d) => sum + d.drift, 0);
    const sumXY = validRecent.reduce((sum, d, i) => sum + i * d.drift, 0);
    const sumXX = validRecent.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Weighted average prediction
    const weightedAvg = validRecent.reduce((sum, d, i) => sum + d.drift * weights[i], 0);
    
    // Exponential smoothing prediction
    const alpha = 0.3;
    const smoothed = validRecent.reduce((prev, d) => alpha * d.drift + (1 - alpha) * prev, validRecent[0].drift);
    
    // Combine predictions with confidence weighting
    const linearPrediction = slope * timeHorizon + intercept;
    const weightedPrediction = weightedAvg + slope * timeHorizon * 0.5;
    const smoothedPrediction = smoothed + slope * timeHorizon * 0.3;
    
    // Calculate prediction confidence based on drift variance
    const avgDrift = validRecent.reduce((sum, d) => sum + d.drift, 0) / n;
    const variance = validRecent.reduce((sum, d) => sum + Math.pow(d.drift - avgDrift, 2), 0) / n;
    const confidence = Math.max(0.1, Math.min(1.0, 1 - variance * 10));
    
    // Weighted combination based on confidence
    const finalPrediction = (
      linearPrediction * confidence * 0.4 +
      weightedPrediction * confidence * 0.4 +
      smoothedPrediction * confidence * 0.2
    );
    
    return Math.max(0, finalPrediction);
  },

  // Adaptive sync interval based on network quality and drift patterns
  getAdaptiveSyncInterval: (networkStability, syncQuality, driftVariance) => {
    // Defensive: ensure all parameters are valid numbers
    const stability = typeof networkStability === 'number' && isFinite(networkStability) ? networkStability : 1.0;
    const quality = typeof syncQuality === 'number' && isFinite(syncQuality) ? syncQuality : 1.0;
    const variance = typeof driftVariance === 'number' && isFinite(driftVariance) ? driftVariance : 0.0;
    
    // Base interval on network stability
    let baseInterval = ADAPTIVE_SYNC_INTERVALS.good;
    
    if (stability > 0.8) {
      baseInterval = ADAPTIVE_SYNC_INTERVALS.excellent;
    } else if (stability > 0.6) {
      baseInterval = ADAPTIVE_SYNC_INTERVALS.good;
    } else if (stability > 0.4) {
      baseInterval = ADAPTIVE_SYNC_INTERVALS.fair;
    } else {
      baseInterval = ADAPTIVE_SYNC_INTERVALS.poor;
    }
    
    // Adjust based on sync quality
    if (quality < 0.5) {
      baseInterval *= 0.7; // More frequent sync for poor quality
    } else if (quality > 0.8) {
      baseInterval *= 1.2; // Less frequent sync for excellent quality
    }
    
    // Adjust based on drift variance (more frequent for erratic drift)
    if (variance > 0.01) {
      baseInterval *= 0.8;
    } else if (variance < 0.001) {
      baseInterval *= 1.1;
    }
    
    return Math.max(500, Math.min(3000, baseInterval)); // Clamp between 500ms and 3s
  },

  // Gradual rate transition to prevent audio artifacts
  gradualRateTransition: (audio, targetRate, duration = RATE_TRANSITION_DURATION) => {
    const startRate = audio.playbackRate;
    const rateDiff = targetRate - startRate;
    const stepSize = rateDiff / RATE_TRANSITION_STEPS;
    const stepDuration = duration / RATE_TRANSITION_STEPS;
    
    let currentStep = 0;
    let timeoutId = null;
    
    const transitionStep = () => {
      if (currentStep >= RATE_TRANSITION_STEPS) {
        audio.playbackRate = targetRate; // Ensure final rate is exact
        return;
      }
      
      currentStep++;
      const newRate = startRate + (stepSize * currentStep);
      audio.playbackRate = newRate;
      
      timeoutId = setTimeout(transitionStep, stepDuration);
    };
    
    transitionStep();
    
    // Return cleanup function to prevent memory leaks
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  },

  // Enhanced sync state validation with timeout
  validateSyncState: (state, timeout = SYNC_STATE_VALIDATION_TIMEOUT) => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ valid: false, reason: 'timeout' });
      }, timeout);
      
      try {
        // Basic structure validation
        if (!state || typeof state !== 'object') {
          clearTimeout(timer);
          resolve({ valid: false, reason: 'invalid_structure' });
          return;
        }
        
        // Required fields validation
        const requiredFields = ['timestamp', 'lastUpdated', 'isPlaying'];
        const missingFields = requiredFields.filter(field => !(field in state));
        
        if (missingFields.length > 0) {
          clearTimeout(timer);
          resolve({ valid: false, reason: 'missing_fields', fields: missingFields });
          return;
        }
        
        // Type validation
        if (typeof state.timestamp !== 'number' || typeof state.lastUpdated !== 'number' || typeof state.isPlaying !== 'boolean') {
          clearTimeout(timer);
          resolve({ valid: false, reason: 'invalid_types' });
          return;
        }
        
        // Value validation
        if (!isFinite(state.timestamp) || !isFinite(state.lastUpdated)) {
          clearTimeout(timer);
          resolve({ valid: false, reason: 'non_finite_values' });
          return;
        }
        
        if (state.timestamp < 0 || state.lastUpdated < 0) {
          clearTimeout(timer);
          resolve({ valid: false, reason: 'negative_values' });
          return;
        }
        
        // Reasonable range validation
        if (state.timestamp > 86400) { // More than 24 hours
          clearTimeout(timer);
          resolve({ valid: false, reason: 'unreasonable_timestamp' });
          return;
        }
        
        // Time consistency validation
        const timeDiff = Math.abs(state.timestamp - state.lastUpdated);
        if (timeDiff > 3600) { // More than 1 hour difference
          clearTimeout(timer);
          resolve({ valid: false, reason: 'inconsistent_times' });
          return;
        }
        
        clearTimeout(timer);
        resolve({ valid: true, state });
        
      } catch (error) {
        clearTimeout(timer);
        resolve({ valid: false, reason: 'validation_error', error: error.message });
      }
    });
  },

  // Enhanced error recovery with exponential backoff
  retryWithBackoff: async (operation, maxRetries = 3, baseDelay = 100) => {
    let lastError;
    
    // Defensive: ensure operation is a function
    if (typeof operation !== 'function') {
      throw new Error('Operation must be a function');
    }
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
};

// Enhanced state management for atomic operations
const AudioStateManager = {
  // Atomic state updates to prevent race conditions
  atomicUpdate: (currentState, updates) => {
    const newState = { ...currentState, ...updates };
    return {
      previous: currentState,
      current: newState,
      changes: Object.keys(updates),
      timestamp: typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
        ? TimingUtils.getTimeFor('sync') 
        : Date.now()
    };
  },

  // State validation
  validateState: (state) => {
    const required = ['isPlaying', 'currentTime', 'duration', 'syncStatus'];
    const missing = required.filter(key => !(key in state));
    return {
      valid: missing.length === 0,
      missing,
      timestamp: typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
        ? TimingUtils.getTimeFor('sync') 
        : Date.now()
    };
  },

  // State synchronization
  syncState: (localState, remoteState) => {
    const syncResult = {
      synced: false,
      conflicts: [],
      timestamp: typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
        ? TimingUtils.getTimeFor('sync') 
        : Date.now()
    };

    // Check for conflicts
    if (localState.isPlaying !== remoteState.isPlaying) {
      syncResult.conflicts.push('playbackState');
    }
    if (Math.abs(localState.currentTime - remoteState.currentTime) > 0.1) {
      syncResult.conflicts.push('currentTime');
    }

    // Resolve conflicts (prefer remote state for sync)
    if (syncResult.conflicts.length > 0) {
      syncResult.synced = true;
      return {
        ...localState,
        ...remoteState,
        lastSync: syncResult.timestamp
      };
    }

    return localState;
  }
};

// Enhanced seeking and sync utilities
const SeekSyncUtils = {
  // Atomic seek operation with state validation
  atomicSeek: (audio, targetTime, setCurrentTime, validateCallback) => {
    if (!audio || !isFiniteNumber(targetTime)) {
      return { success: false, error: 'Invalid parameters' };
    }

    const beforeState = {
      currentTime: audio.currentTime,
      isPlaying: !audio.paused,
      playbackRate: audio.playbackRate,
      timestamp: typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
        ? TimingUtils.getTimeFor('sync') 
        : Date.now()
    };

    try {
      // Validate before seeking
      if (validateCallback && !validateCallback(beforeState)) {
        return { success: false, error: 'Validation failed' };
      }

      // Perform seek
      setCurrentTimeSafely(audio, targetTime, setCurrentTime);

      // Wait for seek to complete
      return new Promise((resolve) => {
        const checkSeek = () => {
          const afterState = {
            currentTime: audio.currentTime,
            isPlaying: !audio.paused,
            playbackRate: audio.playbackRate,
            timestamp: typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
              ? TimingUtils.getTimeFor('sync') 
              : Date.now()
          };

          const seekCompleted = Math.abs(audio.currentTime - targetTime) < 0.05;
          
          if (seekCompleted) {
            resolve({
              success: true,
              before: beforeState,
              after: afterState,
              seekDuration: afterState.timestamp - beforeState.timestamp
            });
          } else {
            // Continue checking
            setTimeout(checkSeek, 10);
          }
        };
        
        // Start checking immediately
        checkSeek();
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Smart seeking that adapts to audio state
  smartSeek: (audio, targetTime, setCurrentTime, options = {}) => {
    const {
      forceSeek = false,
      preservePlayback = true,
      validateBefore = true,
      maxRetries = 3
    } = options;

    return new Promise(async (resolve) => {
      let attempts = 0;
      let lastError = null;

      const attemptSeek = async () => {
        attempts++;
        
        try {
          const wasPlaying = !audio.paused;
          const originalRate = audio.playbackRate;

          // Pause temporarily if needed for precise seeking
          if (validateBefore && wasPlaying) {
            audio.pause();
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          const result = await SeekSyncUtils.atomicSeek(
            audio, 
            targetTime, 
            setCurrentTime,
            validateBefore ? (state) => state.currentTime >= 0 : null
          );

          // Restore playback state if needed
          if (preservePlayback && wasPlaying && !audio.paused) {
            audio.play().catch(() => {});
          }

          if (result.success) {
            resolve(result);
          } else {
            throw new Error(result.error);
          }
        } catch (error) {
          lastError = error;
          
          if (attempts < maxRetries) {
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 50));
            await attemptSeek();
          } else {
            resolve({ success: false, error: lastError.message, attempts });
          }
        }
      };

      await attemptSeek();
    });
  },

  // Batch seek operations for multiple audio elements
  batchSeek: (audioElements, targetTime, setCurrentTime) => {
    const operations = audioElements.map(audio => 
      () => SeekSyncUtils.atomicSeek(audio, targetTime, setCurrentTime)
    );
    
    return TimingUtils.batchTimeOperations(operations);
  }
};

// Enhanced sync utilities with state awareness
const SyncUtils = {
  // Atomic sync operation that works in all states
  atomicSync: (audio, expectedTime, setCurrentTime, options = {}) => {
    const {
      forceSync = false,
      preserveState = true,
      validateAfter = true,
      syncTimeout = 2000
    } = options;

    return new Promise(async (resolve) => {
      const syncStart = typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
        ? TimingUtils.getTimeFor('sync') 
        : Date.now();
      const initialState = {
        currentTime: audio.currentTime,
        isPlaying: !audio.paused,
        playbackRate: audio.playbackRate,
        timestamp: syncStart
      };

      try {
        // Calculate drift
        const drift = Math.abs(audio.currentTime - expectedTime);
        
        // Determine sync strategy based on drift and state
        let syncStrategy = 'none';
        if (drift > 0.1 || forceSync) {
          if (drift > 5.0) {
            syncStrategy = 'emergency_seek';
          } else if (drift > 0.5) {
            syncStrategy = 'rate_correction';
          } else {
            syncStrategy = 'micro_correction';
          }
        }

        let syncResult = { success: false, strategy: syncStrategy };

        switch (syncStrategy) {
          case 'emergency_seek':
            syncResult = await SeekSyncUtils.smartSeek(audio, expectedTime, setCurrentTime, {
              forceSeek: true,
              preservePlayback: preserveState
            });
            break;

          case 'rate_correction':
            // Use rate correction for medium drifts
            const rateAdjustment = (expectedTime - audio.currentTime) / 2.0; // 2 second correction
            const newRate = Math.max(0.5, Math.min(2.0, 1 + rateAdjustment));
            
            audio.playbackRate = newRate;
            
            // Restore rate after correction
            setTimeout(() => {
              audio.playbackRate = initialState.playbackRate;
            }, 2000);
            
            syncResult = { success: true, rate: newRate };
            break;

          case 'micro_correction':
            // Use micro-correction for small drifts
            const microRate = 1 + (expectedTime - audio.currentTime) * 0.1;
            audio.playbackRate = Math.max(0.95, Math.min(1.05, microRate));
            
            setTimeout(() => {
              audio.playbackRate = initialState.playbackRate;
            }, 500);
            
            syncResult = { success: true, micro: true };
            break;

          default:
            syncResult = { success: true, noAction: true };
        }

        // Validate sync result
        if (validateAfter && syncResult.success) {
          const finalDrift = Math.abs(audio.currentTime - expectedTime);
          syncResult.finalDrift = finalDrift;
          syncResult.improvement = drift - finalDrift;
        }

        syncResult.duration = (typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
          ? TimingUtils.getTimeFor('sync') 
          : Date.now()) - syncStart;
        resolve(syncResult);

      } catch (error) {
        resolve({
          success: false,
          error: error.message,
          duration: (typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
            ? TimingUtils.getTimeFor('sync') 
            : Date.now()) - syncStart
        });
      }
    });
  },

  // Continuous sync monitoring
  continuousSync: (audio, getExpectedTime, setCurrentTime, options = {}) => {
    const {
      interval = 1000,
      threshold = 0.1,
      maxCorrections = 10,
      onSync = () => {}
    } = options;

    let correctionCount = 0;
    let isActive = false;

    const syncInterval = setInterval(async () => {
      if (!isActive || correctionCount >= maxCorrections) return;

      try {
        const expectedTime = getExpectedTime();
        if (!isFiniteNumber(expectedTime)) return;

        const drift = Math.abs(audio.currentTime - expectedTime);
        
        if (drift > threshold) {
          correctionCount++;
          const result = await SyncUtils.atomicSync(audio, expectedTime, setCurrentTime);
          onSync(result);
        }
      } catch (error) {
        console.warn('Continuous sync error:', error);
      }
    }, interval);

    return {
      start: () => { isActive = true; },
      stop: () => { isActive = false; },
      reset: () => { correctionCount = 0; },
      destroy: () => {
        clearInterval(syncInterval);
        isActive = false;
      }
    };
  },

  // Manual resync with enhanced reliability
  manualResync: async (audio, getExpectedTime, setCurrentTime, options = {}) => {
    const {
      forceSync = true,
      preserveState = true,
      retryCount = 3,
      onProgress = () => {}
    } = options;

    let lastError = null;
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        onProgress({ attempt, total: retryCount, status: 'syncing' });
        
        // Handle both synchronous and asynchronous getExpectedTime functions
        let expectedTime;
        if (typeof getExpectedTime === 'function') {
          const result = getExpectedTime();
          if (result && typeof result.then === 'function') {
            // Async function
            expectedTime = await result;
          } else {
            // Sync function
            expectedTime = result;
          }
        } else {
          expectedTime = getExpectedTime;
        }

        // Enhanced validation
        if (expectedTime === null || expectedTime === undefined) {
          throw new Error('No sync state received from server');
        }
        
        if (!isFiniteNumber(expectedTime)) {
          throw new Error(`Invalid expected time: ${expectedTime} (type: ${typeof expectedTime})`);
        }
        
        if (expectedTime < 0) {
          throw new Error(`Expected time cannot be negative: ${expectedTime}`);
        }

        // Additional validation for reasonable time values
        if (expectedTime > 86400) { // More than 24 hours
          throw new Error(`Expected time seems unreasonable: ${expectedTime} seconds`);
        }

        const result = await SyncUtils.atomicSync(audio, expectedTime, setCurrentTime, {
          forceSync,
          preserveState,
          validateAfter: true
        });

        if (result.success) {
          onProgress({ attempt, total: retryCount, status: 'success', result });
          return result;
        } else {
          throw new Error(result.error || 'Sync failed');
        }
      } catch (error) {
        lastError = error;
        onProgress({ attempt, total: retryCount, status: 'error', error });
        
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[ManualResync] Attempt ${attempt} failed:`, error.message);
        }
        
        if (attempt < retryCount) {
          // Wait before retry with exponential backoff
          const delay = Math.pow(2, attempt) * 200;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
};

// Optimized helper to get the most accurate server time for syncing
function getNow(getServerTime) {
  // Use high-resolution timing for local fallback
  const localNow = () => {
    if (typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function') {
      return TimingUtils.getTimeFor('sync');
    }
    return Date.now();
  };

  if (typeof getServerTime === 'function') {
    try {
      const now = getServerTime();
      if (typeof now === 'number' && isFinite(now) && now > 0) {
        return now;
      } else {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[AudioPlayer][getNow] getServerTime() returned invalid value:', now, 'Falling back to high-res local time.');
        }
        return localNow();
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('[AudioPlayer][getNow] getServerTime threw error:', e, 'Falling back to high-res local time.');
      }
      return localNow();
    }
  } else {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[AudioPlayer][getNow] getServerTime is missing! Falling back to high-res local time. This may cause sync drift.');
    }
    return localNow();
  }
}

export default function AudioPlayer({
  disabled = false,
  socket,
  isSocketConnected,
  controllerId,
  controllerClientId,
  clientId,
  clients = [],
  getServerTime,
  mobile = false,
  isAudioTabActive = false,
  currentTrack = null,
  rtt = null,
  ultraPreciseOffset,
  timeOffset, // fallback
  sessionSyncState = null,
  forceNtpBatchSync,
}) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioError, setAudioError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [syncStatus, setSyncStatus] = useState('In Sync');
  const [lastSync, setLastSync] = useState(TimingUtils.getTimeFor('sync'));
  const audioRef = useRef(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [audioLatency, setAudioLatency] = useState(DEFAULT_AUDIO_LATENCY); // measured latency in seconds
  const playRequestedAt = useRef(null);
  const audioContextRef = useRef(null);
  const lastCorrectionRef = useRef(0);
  const CORRECTION_COOLDOWN = 1500; // ms
  const correctionInProgressRef = useRef(false);
  const [displayedCurrentTime, setDisplayedCurrentTime] = useState(0);
  const [correctionInProgress, setCorrectionInProgress] = useState(false);

  // Enhanced state management for atomic operations
  const [audioState, setAudioState] = useState({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    syncStatus: 'In Sync',
    lastSync: TimingUtils.getTimeFor('sync'),
    isSeeking: false,
    correctionInProgress: false,
    rateCorrectionActive: false,
    resyncInProgress: false
  });

  // iOS-specific optimizations
  const [isIOS, setIsIOS] = useState(false);
  const [audioContext, setAudioContext] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [audioSource, setAudioSource] = useState(null);
  const [isAudioContextReady, setIsAudioContextReady] = useState(false);

  // State update function with atomic operations
  const updateAudioState = (updates) => {
    const stateUpdate = AudioStateManager.atomicUpdate(audioState, updates);
    setAudioState(stateUpdate.current);
    return stateUpdate;
  };

  // Use controllerClientId/clientId for sticky controller logic
  const isController = controllerClientId && clientId && controllerClientId === clientId;
  
  // Smooth appearance hooks for loading states and status changes
  const audioLoaded = useSmoothAppearance(!loading && !audioError, 200, 'animate-fade-in-slow');
  const syncStatusVisible = useSmoothAppearance(syncStatus !== 'In Sync', 100, 'animate-bounce-in');

  // Modern smooth transition for track title (single element, fade/slide/scale)
  const [displayedTitle, setDisplayedTitle] = useState(currentTrack?.title || '');
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState('up');

  // Enhanced resync state
  const [resyncHistory, setResyncHistory] = useState([]);
  const [lastResyncTime, setLastResyncTime] = useState(0);
  const [resyncInProgress, setResyncInProgress] = useState(false);
  const [smartResyncSuggestion, setSmartResyncSuggestion] = useState(false);
  const [resyncStats, setResyncStats] = useState({
    totalResyncs: 0,
    successfulResyncs: 0,
    failedResyncs: 0,
    averageDrift: 0,
    lastDrift: 0
  });
  
  // Rate correction status for UI feedback
  const [rateCorrectionActive, setRateCorrectionActive] = useState(false);

  // Jitter buffer: only correct drift if sustained for N checks
  const driftCountRef = useRef(0);
  
  // Enhanced drift correction state
  const rateCorrectionRef = useRef({
    active: false,
    startTime: 0,
    targetDrift: 0,
    originalRate: 1,
    correctionId: 0,
    cleanupTransition: null
  });

  // Advanced auto-sync state management
  const autoSyncRef = useRef({
    lastDrift: 0,
    driftTrend: 0, // positive = drifting forward, negative = drifting backward
    driftVelocity: 0, // rate of drift change
    consecutiveCorrections: 0,
    lastCorrectionTime: 0,
    adaptiveThreshold: DRIFT_THRESHOLD,
    syncQuality: 1.0, // 0-1, higher = better sync
    networkStability: 1.0, // 0-1, higher = more stable
    correctionSuccessRate: 1.0, // 0-1, success rate of recent corrections
    driftHistory: [], // last 20 drift measurements
    syncMode: 'normal' // 'normal', 'aggressive', 'conservative'
  });

  // --- Offset selection with best practices ---
  const [smoothedOffset, setSmoothedOffset] = useState(timeOffset || 0);
  useEffect(() => {
    let nextOffset = timeOffset || 0;
    if (
      typeof ultraPreciseOffset === 'number' &&
      Math.abs(ultraPreciseOffset) < 1000 && // sanity check: < 1s
      !isNaN(ultraPreciseOffset)
    ) {
      nextOffset = ultraPreciseOffset;
    }
    // Smooth transition if offset changes by more than 50ms
    if (Math.abs(smoothedOffset - nextOffset) > 50) {
      const step = (nextOffset - smoothedOffset) / 5;
      let i = 0;
      const smooth = () => {
        setSmoothedOffset(prev => {
          const newVal = prev + step;
          if (i++ < 4) {
            setTimeout(smooth, 30);
          } else {
            return nextOffset;
          }
          return newVal;
        });
      };
      smooth();
    } else {
      setSmoothedOffset(nextOffset);
    }
    if (typeof ultraPreciseOffset === 'number' && (isNaN(ultraPreciseOffset) || Math.abs(ultraPreciseOffset) > 1000)) {
      console.warn('[AudioPlayer] Ignoring suspicious ultraPreciseOffset:', ultraPreciseOffset);
    }
  }, [ultraPreciseOffset, timeOffset]);

  useEffect(() => {
    if ((currentTrack?.title || '') !== displayedTitle) {
      setAnimating(true);
      setDirection('up');
      setTimeout(() => {
        setDirection('down');
        setDisplayedTitle(currentTrack?.title || '');
        setTimeout(() => {
          setAnimating(false);
        }, 320); // match in duration
      }, 320); // match out duration
    }
  }, [currentTrack?.title]);

  // Trigger animation for mobile audio player
  useEffect(() => {
    if (mobile && !loading && !audioError) {
      // Small delay to ensure the component is mounted
      const timer = setTimeout(() => {
        setShouldAnimate(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mobile, loading, audioError]);

  // Trigger animation when audio tab becomes active
  useEffect(() => {
    if (mobile && isAudioTabActive && !loading && !audioError) {
      setShouldAnimate(false);
      const timer = setTimeout(() => {
        setShouldAnimate(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [mobile, isAudioTabActive, loading, audioError]);

  // Set audio source to currentTrack.url if available
  useEffect(() => {
    if (currentTrack && currentTrack.url) {
      let url = currentTrack.url;
      // If url is relative, prepend backend URL
      if (url.startsWith('/audio/')) {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        // Remove trailing slash if present
        url = backendUrl.replace(/\/$/, '') + url;
      }
      console.log('AudioPlayer: Setting audioUrl to', url);
      
      // Reset audio state for new track
      const audio = audioRef.current;
      if (audio) {
        // Reset audio element state for new track
        audio.currentTime = 0;
        audio.playbackRate = 1;
        
        // Clear any active rate corrections
        if (rateCorrectionRef.current.active) {
          if (rateCorrectionRef.current.cleanupTransition) {
            rateCorrectionRef.current.cleanupTransition();
            rateCorrectionRef.current.cleanupTransition = null;
          }
          rateCorrectionRef.current.active = false;
          setRateCorrectionActive(false);
        }
        
        // Reset correction state
        correctionInProgressRef.current = false;
        setCorrectionInProgress(false);
        driftCountRef.current = 0;
        
        // Clear drift history for new track
        if (autoSyncRef.current) {
          autoSyncRef.current.driftHistory = [];
          autoSyncRef.current.consecutiveCorrections = 0;
          autoSyncRef.current.lastCorrectionTime = 0;
          autoSyncRef.current.adaptiveThreshold = DRIFT_THRESHOLD;
        }
        
        // Reset displayed time and current time, but don't reset duration immediately
        setDisplayedCurrentTime(0);
        setCurrentTime(0);
        
        // Force immediate update of displayed time to ensure UI reflects the reset
        setTimeout(() => {
          setDisplayedCurrentTime(0);
          setCurrentTime(0);
        }, 10);
        
        // Don't reset duration to 0 immediately - let the new track set its duration
        // setDuration(0);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[AudioPlayer] Track changed, reset audio state for:', currentTrack.title);
        }
      }
      
      setAudioUrl(url);
      setLoading(false);
      setAudioError(null);
    }
  }, [currentTrack]);

  // Auto-play audio for listeners when audioUrl changes and should be playing
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isController && isPlaying && audioUrl) {
      // Try to play the audio (catch errors silently)
      audio.play().catch(() => {});
    }
  }, [audioUrl, isPlaying, isController]);

  // Track change sync reset
  useEffect(() => {
    if (!currentTrack) return;
    
    // When track changes, ensure all listeners are properly synced
    if (!isController && socket && socket.sessionId) {
      // Request fresh sync state for the new track
      setTimeout(() => {
        socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
          if (state && typeof state.timestamp === 'number') {
            const audio = audioRef.current;
            if (audio && audio.readyState >= 2) {
              const now = getNow(getServerTime);
              const rttComp = rtt ? rtt / 2000 : 0;
              const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
              
              if (isFiniteNumber(expected) && expected >= 0) {
                setCurrentTimeSafely(audio, expected, setCurrentTime);
                setIsPlaying(state.isPlaying);
                
                if (process.env.NODE_ENV === 'development') {
                  console.log('[AudioPlayer] Track change sync reset:', {
                    trackTitle: currentTrack.title,
                    expectedTime: expected,
                    isPlaying: state.isPlaying
                  });
                }
              }
            }
          }
        });
      }, 100); // Small delay to ensure track is loaded
    }
  }, [currentTrack?.id]); // Only trigger on track ID change

  // Periodic duration check to ensure duration is always available
  useEffect(() => {
    if (!audioUrl) return;
    
    const checkDuration = () => {
      const audio = audioRef.current;
      if (audio && audio.readyState >= 1) {
        const currentDuration = audio.duration;
        if (currentDuration && isFinite(currentDuration) && currentDuration > 0 && currentDuration !== duration) {
          setDuration(currentDuration);
          if (process.env.NODE_ENV === 'development') {
            console.log('[AudioPlayer] Duration updated via periodic check:', currentDuration);
          }
        }
      }
    };
    
    // Check immediately
    checkDuration();
    
    // Check periodically for the first few seconds
    const interval = setInterval(checkDuration, 500);
    const timeout = setTimeout(() => {
      clearInterval(interval);
    }, 5000); // Stop checking after 5 seconds
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [audioUrl, duration]);

  // Fetch default audio URL only if no currentTrack
  useEffect(() => {
    if (currentTrack && currentTrack.url) return;
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    if (!backendUrl) {
      setAudioError(
        <>
          <span className="inline-flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.5a.75.75 0 001.5 0v-4.5zm-.75 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span>
              Audio backend URL is not configured.
              <br />
              Please set <span className="font-mono bg-neutral-800 px-1 rounded">VITE_BACKEND_URL</span> in your environment.
            </span>
          </span>
        </>
      );
      setLoading(false);
      return;
    }
    fetch(`${backendUrl}/audio/audio-url`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch audio URL: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data && typeof data.url === 'string' && data.url.length > 0) {
          setAudioUrl(data.url);
        } else {
          setAudioError('Audio URL not found in backend response.');
        }
        setLoading(false);
      })
      .catch(err => {
        setAudioError('Error fetching audio URL. ' + (err?.message || ''));
        setLoading(false);
      });
  }, [currentTrack]);

  // Audio event listeners and initialization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const update = () => {
      const newCurrentTime = audio.currentTime;
      setCurrentTime(newCurrentTime);
      
      // Handle track change reset - if audio suddenly resets to 0
      if (newCurrentTime === 0 && displayedCurrentTime > 0.1) {
        setDisplayedCurrentTime(0);
        if (process.env.NODE_ENV === 'development') {
          console.log('[AudioPlayer] Track reset detected in timeupdate, resetting displayed time');
        }
      }
      
      // Also check for duration in timeupdate as a fallback
      const currentDuration = audio.duration;
      if (currentDuration && isFinite(currentDuration) && currentDuration > 0 && currentDuration !== duration) {
        setDuration(currentDuration);
        if (process.env.NODE_ENV === 'development') {
          console.log('[AudioPlayer] Duration updated via timeupdate fallback:', currentDuration);
        }
      }
    };
    const setDur = () => {
      const newDuration = audio.duration;
      if (newDuration && isFinite(newDuration) && newDuration > 0) {
        setDuration(newDuration);
        if (process.env.NODE_ENV === 'development') {
          console.log('[AudioPlayer] Duration updated via event:', newDuration);
        }
      }
    };
    
    const handlePlaying = () => {
      if (playRequestedAt.current) {
        const currentTime = typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
          ? TimingUtils.getTimeFor('audio') 
          : Date.now();
        const latency = (currentTime - playRequestedAt.current) / 1000;
        setAudioLatency(latency);
        playRequestedAt.current = null;
      }
    };
    
    const handleLoadedMetadata = () => {
      // Try to get duration when metadata is loaded
      const newDuration = audio.duration;
      if (newDuration && isFinite(newDuration) && newDuration > 0) {
        setDuration(newDuration);
        if (process.env.NODE_ENV === 'development') {
          console.log('[AudioPlayer] Duration updated via loadedmetadata:', newDuration);
        }
      }
    };
    
    const handleCanPlay = () => {
      // Try to get duration when audio can play
      const newDuration = audio.duration;
      if (newDuration && isFinite(newDuration) && newDuration > 0) {
        setDuration(newDuration);
        if (process.env.NODE_ENV === 'development') {
          console.log('[AudioPlayer] Duration updated via canplay:', newDuration);
        }
      }
    };
    
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('durationchange', setDur);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    
    // Initial duration check
    setTimeout(() => {
      const initialDuration = audio.duration;
      if (initialDuration && isFinite(initialDuration) && initialDuration > 0) {
        setDuration(initialDuration);
        if (process.env.NODE_ENV === 'development') {
          console.log('[AudioPlayer] Duration set via initial check:', initialDuration);
        }
      }
    }, 100);
    
    return () => {
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('durationchange', setDur);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [audioUrl]);

  // Ensure proper audio state when role changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    // If we're not the controller and audio is playing but shouldn't be, pause it
    if (!isController && !isPlaying && !audio.paused) {
      console.log('Pausing audio: listener detected audio playing when it should be paused');
      audio.pause();
    }
  }, [isController, isPlaying]);

  // Enhanced Socket event listeners with improved logging, error handling, and drift analytics
  useEffect(() => {
    if (!socket) return;

    let syncTimeout = null;
    let resyncTimeout = null;

    // Helper: log with context and level
    const log = (level, ...args) => {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console[level]?.('[AudioPlayer][sync_state]', ...args);
      }
    };

    // Helper: show sync status for a limited time, then revert to "In Sync"
    const showSyncStatus = (status, duration = 1200) => {
      setSyncStatus(status);
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => setSyncStatus('In Sync'), duration);
    };

    // Helper: emit drift report with more context
    const emitDriftReport = (drift, expected, current, extra = {}) => {
      if (socket && socket.emit && socket.sessionId && typeof drift === 'number') {
        socket.emit('drift_report', {
          sessionId: socket.sessionId,
          drift,
          expected,
          current,
          clientId,
          timestamp: typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
            ? TimingUtils.getTimeFor('network') 
            : Date.now(),
          ...extra,
        });
      }
    };

    // Enhanced sync state handler with improved validation
    const handleSyncState = ({
      isPlaying,
      timestamp,
      lastUpdated,
      controllerId: ctrlId,
      trackId,
      meta,
      serverTime,
    }) => {
      // Track change detection and validation
      const syncCurrentTrackId = currentTrack?.id;
      const trackChanged = trackId && syncCurrentTrackId && trackId !== syncCurrentTrackId;
      
              if (trackChanged) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[AudioPlayer] Track change detected in sync state:', {
              receivedTrackId: trackId,
              currentTrackId: syncCurrentTrackId,
              currentTrackTitle: currentTrack?.title
            });
          }
        
        // For track changes, we need to reset sync state and wait for the new track to load
        // Don't process sync state until the track is properly loaded
        if (!audioRef.current || audioRef.current.readyState < 2) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[AudioPlayer] Skipping sync state for track change - audio not ready');
          }
          return;
        }
      }
      
      // Synchronous validation to prevent race conditions
      const validationResult = {
        valid: true,
        reason: null
      };
      
      // Basic structure validation
      if (typeof isPlaying !== 'boolean') {
        validationResult.valid = false;
        validationResult.reason = 'invalid_isPlaying';
      }
      
      if (typeof timestamp !== 'number' || typeof lastUpdated !== 'number') {
        validationResult.valid = false;
        validationResult.reason = 'invalid_timestamps';
      }
      
      if (!isFinite(timestamp) || !isFinite(lastUpdated)) {
        validationResult.valid = false;
        validationResult.reason = 'non_finite_timestamps';
      }
      
      if (timestamp < 0 || lastUpdated < 0) {
        validationResult.valid = false;
        validationResult.reason = 'negative_timestamps';
      }
      
      if (!validationResult.valid) {
        log('warn', 'SYNC_STATE: validation failed', { 
          reason: validationResult.reason, 
          isPlaying, 
          timestamp, 
          lastUpdated, 
          ctrlId, 
          trackId, 
          meta 
        });
        showSyncStatus('Sync failed');
        return;
      }
      const audio = audioRef.current;
      if (!audio) {
        log('warn', 'SYNC_STATE: audio element not available');
        return;
      }
      // Use serverTime if present, else fallback
      let now = null;
      if (typeof serverTime === 'number' && isFinite(serverTime)) {
        now = serverTime;
      } else {
        now = getNow(getServerTime);
        log('warn', 'SYNC_STATE: serverTime missing, using getNow(getServerTime)', { now });
      }
      // Compensate for measured audio latency and RTT (one-way delay)
      const rttComp = rtt ? rtt / 2000 : 0; // ms to s, one-way
      const expected = timestamp + (now - lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
      if (!isFiniteNumber(expected)) {
        log('warn', 'SYNC_STATE: expected is not finite', { expected, timestamp, lastUpdated, now });
        showSyncStatus('Sync failed');
        return;
      }
      const drift = Math.abs(audio.currentTime - expected);
      const driftTimestamp = typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
        ? TimingUtils.getTimeFor('sync') 
        : Date.now();

      // Enhanced: keep drift history for analytics (last 10 drifts)
      if (!window._audioDriftHistory) window._audioDriftHistory = [];
      
      // Only track drift for the current track
      const localCurrentTrackId = currentTrack?.id;
      if (trackId === localCurrentTrackId) {
        window._audioDriftHistory.push({
          drift,
          current: audio.currentTime,
          expected,
          timestamp: driftTimestamp,
          isPlaying,
          ctrlId,
          trackId,
        });
        if (window._audioDriftHistory.length > 10) window._audioDriftHistory.shift();
      }

      // Intelligent drift analysis
      const analysis = analyzeDriftPattern(drift, driftTimestamp);
      const predictedDrift = predictDrift(5); // 5 seconds ahead
      
      // Enhanced: show drift in UI if large
      const shouldCorrect = drift > analysis.adaptiveThreshold || 
                           (predictedDrift > LARGE_GAP_THRESHOLD && analysis.syncMode === 'aggressive');
      
      if (shouldCorrect) {
        driftCountRef.current += 1;
        const requiredDetections = analysis.syncMode === 'aggressive' ? 1 : DRIFT_JITTER_BUFFER;
        
        if (driftCountRef.current >= requiredDetections) {
          const beforeDrift = drift;
          
          showSyncStatus('Drifted', 1000);
          const result = maybeCorrectDrift(audio, expected);
          
          // Track correction success
          setTimeout(() => {
            const afterDrift = Math.abs(audio.currentTime - expected);
            trackCorrectionSuccess(beforeDrift, afterDrift, result?.type || 'unknown');
          }, 1000);
          
          setSyncStatus('Re-syncing...');
          if (resyncTimeout) clearTimeout(resyncTimeout);
          resyncTimeout = setTimeout(() => setSyncStatus('In Sync'), 800);

          if (typeof socket?.forceTimeSync === 'function') {
            socket.forceTimeSync();
          }
          emitDriftReport(drift, expected, audio.currentTime, { 
            ctrlId, 
            trackId, 
            meta,
            analysis,
            predictedDrift,
            syncMode: analysis.syncMode
          });
          driftCountRef.current = 0;
        }
      } else {
        driftCountRef.current = 0;
        setSyncStatus('In Sync');
      }

      // Log drift for debugging (dev only) with enhanced analysis
      log('log', '[DriftCheck] SYNC_STATE drift:', drift, {
        current: audio.currentTime,
        expected,
        isPlaying,
        ctrlId,
        trackId,
        meta,
        analysis,
        predictedDrift,
        adaptiveThreshold: analysis.adaptiveThreshold
      });

      setIsPlaying(isPlaying);

      // Only play/pause if state differs
      if (isPlaying && audio.paused) {
        audio.play().catch(e => {
          log('warn', 'SYNC_STATE: failed to play audio', e);
        });
      } else if (!isPlaying && !audio.paused) {
        audio.pause();
        // Do not seek to correct drift if paused
      }
      setLastSync(typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
        ? TimingUtils.getTimeFor('sync') 
        : Date.now());
    };

    socket.on('sync_state', handleSyncState);

    return () => {
      socket.off('sync_state', handleSyncState);
      if (syncTimeout) clearTimeout(syncTimeout);
      if (resyncTimeout) clearTimeout(resyncTimeout);
    };
  }, [socket, audioLatency, getServerTime, clientId, rtt, smoothedOffset]);

  // Enhanced periodic drift check with continuous sync monitoring
  useEffect(() => {
    if (!socket || isController) return;

    let continuousSyncController = null;

    // Helper function to get expected time for continuous sync
    const getExpectedTime = () => {
      if (!socket || !socket.sessionId) return null;
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, isIOS ? 3000 : 2000); // Longer timeout for iOS
        
        try {
          socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
            clearTimeout(timeout);
            
            if (!state) {
              resolve(null);
              return;
            }
            
            // Validate state structure and values
            if (
              typeof state.timestamp !== 'number' ||
              typeof state.lastUpdated !== 'number' ||
              !isFinite(state.timestamp) ||
              !isFinite(state.lastUpdated) ||
              state.timestamp < 0 ||
              state.lastUpdated < 0
            ) {
              resolve(null);
              return;
            }

            try {
              const now = getNow(getServerTime);
              if (!isFiniteNumber(now)) {
                resolve(null);
                return;
              }
              
              // Defensive: ensure getServerTime is available
              if (typeof getServerTime !== 'function') {
                resolve(null);
                return;
              }
              
              const rttComp = rtt ? rtt / 2000 : 0;
              const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
              
              if (isFiniteNumber(expected) && expected >= 0) {
                resolve(expected);
              } else {
                resolve(null);
              }
            } catch (error) {
              resolve(null);
            }
          });
        } catch (error) {
          clearTimeout(timeout);
          resolve(null);
        }
      });
    };

    const audio = audioRef.current;
    if (audio) {
      // Enhanced adaptive sync intervals based on network quality and drift patterns
      const analysis = analyzeDriftPattern(0, Date.now()); // Get initial analysis
      const adaptiveInterval = EnhancedSyncUtils.getAdaptiveSyncInterval(
        autoSyncRef.current.networkStability,
        analysis.syncQuality,
        analysis.driftVariance
      );
      
      // iOS-specific adjustments
      const syncInterval = isIOS ? Math.max(adaptiveInterval, 1000) : adaptiveInterval;
      const syncThreshold = isIOS ? Math.max(analysis.adaptiveThreshold, 0.12) : analysis.adaptiveThreshold;
      const maxCorrections = isIOS ? 5 : 10; // Fewer corrections on iOS
      
      // Start continuous sync monitoring with adaptive parameters
      continuousSyncController = SyncUtils.continuousSync(
        audio,
        getExpectedTime,
        setCurrentTime,
        {
          interval: syncInterval,
          threshold: syncThreshold,
          maxCorrections: maxCorrections,
          onSync: (result) => {
            if (result.success) {
              // iOS-specific sync result handling
              if (isIOS) {
                // Be more conservative with sync status updates on iOS
                if (result.strategy === 'emergency_seek') {
                  updateAudioState({ syncStatus: 'Syncing...' });
                } else if (result.strategy === 'rate_correction') {
                  updateAudioState({ syncStatus: 'Adjusting...' });
                } else if (result.strategy === 'micro_correction') {
                  // Don't update status for micro-corrections on iOS to reduce UI updates
                }
              } else {
                // Standard sync status updates for other platforms
                if (result.strategy === 'emergency_seek') {
                  updateAudioState({ syncStatus: 'Emergency sync applied' });
                } else if (result.strategy === 'rate_correction') {
                  updateAudioState({ syncStatus: 'Rate correction active' });
                } else if (result.strategy === 'micro_correction') {
                  updateAudioState({ syncStatus: 'Micro-correction applied' });
                }
              }
              
              // Track correction success
              if (result.improvement !== undefined) {
                trackCorrectionSuccess(result.improvement + result.finalDrift, result.finalDrift, result.strategy);
              }
              
              // Emit drift report
              if (socket && socket.emit && socket.sessionId) {
                        socket.emit('drift_report', {
          sessionId: socket.sessionId,
          drift: result.finalDrift || 0,
          clientId,
          timestamp: typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
            ? TimingUtils.getTimeFor('network') 
            : Date.now(),
          strategy: result.strategy,
          improvement: result.improvement
        });
              }
              
              // Reset sync status after a delay (longer on iOS)
              setTimeout(() => {
                updateAudioState({ syncStatus: 'In Sync' });
              }, isIOS ? 1500 : 1000);
            } else {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[ContinuousSync] Sync failed:', result.error);
              }
            }
          }
        }
      );

      // Start the continuous sync
      continuousSyncController.start();
    }

    return () => {
      if (continuousSyncController) {
        continuousSyncController.destroy();
      }
    };
  }, [socket, isController, getServerTime, audioLatency, clientId, rtt, smoothedOffset, isIOS]);

  // Enhanced: On mount, immediately request sync state on join, with improved error handling, logging, and edge case resilience
  useEffect(() => {
    if (!socket) return;
    if (!socket.sessionId) return;

    // Helper for logging (dev only)
    const log = (...args) => {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[AudioPlayer][sync_request]', ...args);
      }
    };

    // Helper for warning (dev only)
    const warn = (...args) => {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[AudioPlayer][sync_request]', ...args);
      }
    };

    // Defensive: wrap in try/catch for callback
    socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
      try {
        const audio = audioRef.current;
        if (!audio) {
          warn('Audio element not available on sync_request');
          return;
        }

        // If no valid state received, ensure audio is paused and reset to beginning
        if (
          !state ||
          typeof state.timestamp !== 'number' ||
          typeof state.lastUpdated !== 'number' ||
          !isFinite(state.timestamp) ||
          !isFinite(state.lastUpdated)
        ) {
          warn('No valid sync state received, pausing audio and resetting to beginning', { state });
          audio.pause();
          setCurrentTimeSafely(audio, 0, setCurrentTime);
          setIsPlaying(false);
          setLastSync(typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
            ? TimingUtils.getTimeFor('sync') 
            : Date.now());
          return;
        }

        // Defensive: check for negative/NaN/absurd timestamps
        if (state.timestamp < 0 || state.lastUpdated < 0) {
          warn('Sync state has negative timestamp(s)', { state });
          audio.pause();
          setCurrentTimeSafely(audio, 0, setCurrentTime);
          setIsPlaying(false);
          setLastSync(typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
            ? TimingUtils.getTimeFor('sync') 
            : Date.now());
          return;
        }

        const now = getNow(getServerTime);
        // Compensate for measured audio latency and RTT (one-way delay)
        const rttComp = rtt ? rtt / 2000 : 0; // ms to s, one-way
        const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
        if (!isFiniteNumber(expected) || expected < 0) {
          warn('Invalid expected time, pausing audio', { expected, state });
          audio.pause();
          setIsPlaying(false);
          setLastSync(typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
            ? TimingUtils.getTimeFor('sync') 
            : Date.now());
          return;
        }

        // Use advanced time sync
        const syncedNow = getNow(getServerTime);
        const expectedSynced = state.timestamp + (syncedNow - state.lastUpdated) / 1000 + rttComp + smoothedOffset;

        // Clamp expectedSynced to [0, duration] if possible
        let safeExpected = expectedSynced;
        if (audio.duration && isFinite(audio.duration)) {
          safeExpected = Math.max(0, Math.min(expectedSynced, audio.duration));
        } else {
          safeExpected = Math.max(0, expectedSynced);
        }

        log('Syncing audio to', {
          expectedSynced,
          safeExpected,
          isPlaying: state.isPlaying,
          duration: audio.duration,
          src: audio.currentSrc,
        });

        setCurrentTimeSafely(audio, safeExpected, setCurrentTime);
        setIsPlaying(state.isPlaying);

        if (state.isPlaying) {
          playRequestedAt.current = typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
            ? TimingUtils.getTimeFor('audio') 
            : Date.now();
          // Defensive: try/catch for play() (may throw in some browsers)
          audio.play().catch((err) => {
            warn('audio.play() failed on sync_request', err);
          });
        } else {
          // Ensure audio is definitely paused and reset to the expected time
          audio.pause();
          setCurrentTimeSafely(audio, safeExpected, setCurrentTime);
        }
        setLastSync(typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
          ? TimingUtils.getTimeFor('sync') 
          : Date.now());
      } catch (err) {
        warn('Exception in sync_request callback', err);
      }
    });
  }, [socket, getServerTime, audioLatency, rtt, smoothedOffset]);

  // Enhanced: Emit play/pause/seek events (controller only) with improved logging, error handling, and latency compensation
  const emitPlay = () => {
    if (isController && socket && getServerTime) {
      const now = getNow(getServerTime);
      const audio = audioRef.current;
      const playAt = (audio ? audio.currentTime : 0) + PLAY_OFFSET;
      const payload = {
        sessionId: socket.sessionId,
        timestamp: playAt,
        clientId,
        emittedAt: now,
        latency: audioLatency,
      };
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[AudioPlayer][emitPlay]', payload);
      }
      try {
        socket.emit('play', payload);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('[AudioPlayer][emitPlay] Failed to emit play event', err, payload);
        }
      }
    }
  };

  const emitPause = () => {
    if (isController && socket) {
      const audio = audioRef.current;
      const payload = {
        sessionId: socket.sessionId,
        timestamp: audio ? audio.currentTime : 0,
        clientId,
        emittedAt: getNow(getServerTime),
      };
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[AudioPlayer][emitPause]', payload);
      }
      try {
        socket.emit('pause', payload);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('[AudioPlayer][emitPause] Failed to emit pause event', err, payload);
        }
      }
    }
  };

  const emitSeek = (time) => {
    if (isController && socket) {
      const payload = {
        sessionId: socket.sessionId,
        timestamp: time,
        clientId,
        emittedAt: getNow(getServerTime),
      };
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[AudioPlayer][emitSeek]', payload);
      }
      try {
        socket.emit('seek', payload);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('[AudioPlayer][emitSeek] Failed to emit seek event', err, payload);
        }
      }
    }
  };

  // Enhanced Play/Pause/Seek handlers with improved error handling, logging, and edge case resilience

  const handlePlay = async () => {
    const audio = audioRef.current;
    if (!audio) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[AudioPlayer][handlePlay] Audio element not available');
      }
      return;
    }

    // iOS-specific audio context resume
    if (isIOS && audioContext && audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        if (process.env.NODE_ENV === 'development') {
          console.log('[AudioPlayer][handlePlay] iOS AudioContext resumed before play');
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[AudioPlayer][handlePlay] Failed to resume iOS AudioContext:', e);
        }
      }
    }

    playRequestedAt.current = typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
      ? TimingUtils.getTimeFor('audio') 
      : Date.now();
    
    try {
      // iOS-specific play optimizations
      if (isIOS) {
        // Set audio properties for iOS
        audio.preload = 'auto';
        audio.autoplay = false;
        
        // iOS-specific play strategy
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          await playPromise;
        }
      } else {
        // Standard play for other platforms
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          await playPromise;
        }
      }
      
      setIsPlaying(true);
      emitPlay();
      
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[AudioPlayer][handlePlay] Play triggered successfully', {
          isIOS,
          audioContextState: audioContext?.state
        });
      }
    } catch (err) {
      setIsPlaying(false);
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('[AudioPlayer][handlePlay] Failed to play audio', err, {
          isIOS,
          audioContextState: audioContext?.state,
          audioReadyState: audio.readyState
        });
      }
      
      // iOS-specific error recovery
      if (isIOS && audioContext && audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          // Retry play after resume
          setTimeout(async () => {
            try {
              await audio.play();
              setIsPlaying(true);
              emitPlay();
            } catch (retryErr) {
              if (process.env.NODE_ENV === 'development') {
                console.error('[AudioPlayer][handlePlay] Retry failed:', retryErr);
              }
            }
          }, 100);
        } catch (resumeErr) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[AudioPlayer][handlePlay] Failed to resume AudioContext:', resumeErr);
          }
        }
      }
    }
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (!audio) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[AudioPlayer][handlePause] Audio element not available');
      }
      return;
    }
    try {
      audio.pause();
      setIsPlaying(false);
      emitPause();
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[AudioPlayer][handlePause] Pause triggered successfully');
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('[AudioPlayer][handlePause] Failed to pause audio', err);
      }
    }
  };

  const handleSeek = async (e) => {
    let time;
    if (typeof e === 'number') {
      time = e;
    } else if (e && typeof e.target?.value !== 'undefined') {
      time = parseFloat(e.target.value);
    } else {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[AudioPlayer][handleSeek] Invalid event or value', e);
      }
      return;
    }

    if (!isFiniteNumber(time) || time < 0) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[AudioPlayer][handleSeek] Seek ignored: non-finite or negative time', time);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[AudioPlayer][handleSeek] Audio element not available');
      }
      return;
    }

    // Update state atomically
    updateAudioState({ isSeeking: true });

    try {
      // Use enhanced seeking with state preservation
      const seekResult = await SeekSyncUtils.smartSeek(audio, time, setCurrentTime, {
        preservePlayback: true,
        validateBefore: true,
        maxRetries: 2
      });

      if (seekResult.success) {
        // Emit seek event for controller
        emitSeek(time);
        
        // Update displayed time immediately for better UX
        setDisplayedCurrentTime(time);
        
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('[AudioPlayer][handleSeek] Seek successful:', {
            target: time,
            actual: seekResult.after.currentTime,
            duration: seekResult.seekDuration
          });
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[AudioPlayer][handleSeek] Seek failed:', seekResult.error);
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('[AudioPlayer][handleSeek] Seek error:', error);
      }
    } finally {
      // Reset seeking state after a short delay
      setTimeout(() => {
        updateAudioState({ isSeeking: false });
      }, 100);
    }
  };

  // Enhanced Manual re-sync with improved logging, error handling, user feedback, and analytics
  const handleResync = async () => {
    const now = Date.now();
    if (audioState.resyncInProgress) {
      updateAudioState({ syncStatus: 'Resync already in progress.' });
      setTimeout(() => updateAudioState({ syncStatus: 'In Sync' }), 1500);
      return;
    }
    if (now - lastResyncTime < RESYNC_COOLDOWN_MS) {
      const remainingCooldown = Math.ceil((RESYNC_COOLDOWN_MS - (now - lastResyncTime)) / 1000);
      updateAudioState({ syncStatus: `Please wait ${remainingCooldown}s before resyncing again.` });
      setTimeout(() => updateAudioState({ syncStatus: 'In Sync' }), 1500);
      return;
    }
    if (!socket) {
      console.warn('[AudioPlayer][handleResync] No socket available');
      updateAudioState({ syncStatus: 'Sync failed: No socket' });
      setTimeout(() => updateAudioState({ syncStatus: 'In Sync' }), 1200);
      updateResyncHistory('failed', 0, 'No socket available');
      return;
    }
    
    if (!socket.connected) {
      console.warn('[AudioPlayer][handleResync] Socket not connected');
      updateAudioState({ syncStatus: 'Sync failed: Socket disconnected' });
      setTimeout(() => updateAudioState({ syncStatus: 'In Sync' }), 1200);
      updateResyncHistory('failed', 0, 'Socket disconnected');
      return;
    }
    
    if (!socket.sessionId) {
      console.warn('[AudioPlayer][handleResync] No session ID');
      updateAudioState({ syncStatus: 'Sync failed: No session' });
      setTimeout(() => updateAudioState({ syncStatus: 'In Sync' }), 1200);
      updateResyncHistory('failed', 0, 'No session ID');
      return;
    }

    // Update state atomically
    updateAudioState({ resyncInProgress: true });
    setLastResyncTime(now);

    // Helper function to get expected time with enhanced error handling
    const getExpectedTime = () => {
      if (!socket || !socket.sessionId) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ManualResync] Missing socket or sessionId');
        }
        return Promise.resolve(null);
      }
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ManualResync] Sync request timed out');
          }
          resolve(null);
        }, 5000); // Increased timeout
        
        try {
          socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
            clearTimeout(timeout);
            
            if (!state) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[ManualResync] No state received from server');
              }
              resolve(null);
              return;
            }
            
            // Validate state structure
            if (typeof state.timestamp !== 'number' || typeof state.lastUpdated !== 'number') {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[ManualResync] Invalid state structure:', state);
              }
              resolve(null);
              return;
            }
            
            // Validate timestamp values
            if (!isFinite(state.timestamp) || !isFinite(state.lastUpdated)) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[ManualResync] Non-finite timestamps:', { timestamp: state.timestamp, lastUpdated: state.lastUpdated });
              }
              resolve(null);
              return;
            }
            
            // Validate timestamp ranges
            if (state.timestamp < 0 || state.lastUpdated < 0) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[ManualResync] Negative timestamps:', { timestamp: state.timestamp, lastUpdated: state.lastUpdated });
              }
              resolve(null);
              return;
            }
            
            try {
              const now = getNow(getServerTime);
              if (!isFiniteNumber(now)) {
                if (process.env.NODE_ENV === 'development') {
                  console.warn('[ManualResync] Invalid server time:', now);
                }
                resolve(null);
                return;
              }
              
              const rttComp = rtt ? rtt / 2000 : 0;
              const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
              
              if (process.env.NODE_ENV === 'development') {
                console.log('[ManualResync] Time calculation:', {
                  stateTimestamp: state.timestamp,
                  stateLastUpdated: state.lastUpdated,
                  now,
                  rttComp,
                  audioLatency,
                  smoothedOffset,
                  expected
                });
              }
              
              if (isFiniteNumber(expected) && expected >= 0) {
                resolve(expected);
              } else {
                if (process.env.NODE_ENV === 'development') {
                  console.warn('[ManualResync] Invalid expected time calculation:', expected);
                }
                resolve(null);
              }
            } catch (calcError) {
              if (process.env.NODE_ENV === 'development') {
                console.error('[ManualResync] Error calculating expected time:', calcError);
              }
              resolve(null);
            }
          });
        } catch (emitError) {
          clearTimeout(timeout);
          if (process.env.NODE_ENV === 'development') {
            console.error('[ManualResync] Error emitting sync request:', emitError);
          }
          resolve(null);
        }
      });
    };

    try {
      // Use NTP batch sync if available
      if (typeof forceNtpBatchSync === 'function') {
        updateAudioState({ syncStatus: 'Running NTP batch sync...' });
        try {
          const result = forceNtpBatchSync();
          if (result && typeof result.then === 'function') {
            await result;
          }
          updateAudioState({ syncStatus: 'NTP batch sync complete. Re-syncing...' });
        } catch (e) {
          updateAudioState({ syncStatus: 'NTP batch sync failed.' });
          setTimeout(() => updateAudioState({ syncStatus: 'In Sync' }), 1500);
          updateAudioState({ resyncInProgress: false });
          updateResyncHistory('failed', 0, 'NTP batch sync failed');
          return;
        }
      } else {
        updateAudioState({ syncStatus: 'NTP batch syncing unavailable. Proceeding with basic sync' });
      }

      const audio = audioRef.current;
      if (!audio) {
        updateAudioState({ syncStatus: 'Sync failed: No audio element' });
        updateAudioState({ resyncInProgress: false });
        updateResyncHistory('failed', 0, 'No audio element');
        return;
      }

      // Use enhanced manual resync with fallback and error recovery
      let resyncResult;
      try {
        resyncResult = await EnhancedSyncUtils.retryWithBackoff(async () => {
          return await SyncUtils.manualResync(
            audio,
            getExpectedTime,
            setCurrentTime,
            {
              forceSync: true,
              preserveState: true,
              retryCount: 2, // Reduced since we have external retry
              onProgress: (progress) => {
                if (progress.status === 'syncing') {
                  updateAudioState({ syncStatus: `Syncing... (${progress.attempt}/${progress.total})` });
                } else if (progress.status === 'success') {
                  updateAudioState({ syncStatus: 'Manual resync successful' });
                } else if (progress.status === 'error') {
                  updateAudioState({ syncStatus: `Sync error: ${progress.error.message}` });
                }
              }
            }
          );
        }, 3, 200); // 3 retries with 200ms base delay
      } catch (syncError) {
        // Fallback: try to get sync state directly and apply basic correction
        updateAudioState({ syncStatus: 'Trying fallback sync...' });
        
        try {
          const fallbackState = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 3000);
            socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
              clearTimeout(timeout);
              resolve(state);
            });
          });
          
          if (fallbackState && typeof fallbackState.timestamp === 'number') {
            const now = getNow(getServerTime);
            const rttComp = rtt ? rtt / 2000 : 0;
            const fallbackExpected = fallbackState.timestamp + (now - fallbackState.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
            
            if (isFiniteNumber(fallbackExpected) && fallbackExpected >= 0) {
              const beforeDrift = Math.abs(audio.currentTime - fallbackExpected);
              setCurrentTimeSafely(audio, fallbackExpected, setCurrentTime);
              
              setTimeout(() => {
                const afterDrift = Math.abs(audio.currentTime - fallbackExpected);
                if (afterDrift < 0.2) {
                  updateAudioState({ syncStatus: 'Fallback sync successful' });
                  updateResyncHistory('success', beforeDrift, 'Fallback sync', 1.0);
                } else {
                  updateAudioState({ syncStatus: 'Fallback sync failed' });
                  updateResyncHistory('failed', afterDrift, 'Fallback sync failed', 1.0);
                }
              }, 500);
              
              return;
            }
          }
        } catch (fallbackError) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[ManualResync] Fallback sync also failed:', fallbackError);
          }
        }
        
        // If all else fails, throw the original error
        throw syncError;
      }

      if (resyncResult.success) {
        const finalDrift = resyncResult.finalDrift || 0;
        updateResyncHistory('success', finalDrift, 'Enhanced manual resync', resyncResult.duration);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[ManualResync] Enhanced resync successful:', resyncResult);
        }
      } else {
        updateResyncHistory('failed', 0, 'Enhanced resync failed', resyncResult.duration);
      }

    } catch (error) {
      console.error('[AudioPlayer][handleResync] Error during enhanced manual resync:', error);
      updateAudioState({ syncStatus: 'Sync failed: ' + error.message });
      updateResyncHistory('failed', 0, 'Exception: ' + error.message);
    } finally {
      // Reset resync state
      updateAudioState({ resyncInProgress: false });
      setTimeout(() => updateAudioState({ syncStatus: 'In Sync' }), 1000);
    }
  };

  // Helper function to update resync history and stats
  const updateResyncHistory = (result, drift, message, duration) => {
    const resyncEntry = {
      timestamp: Date.now(),
      result,
      drift: parseFloat(drift.toFixed(3)),
      message,
      duration: parseFloat(duration.toFixed(1)),
      trackId: currentTrack?.id || 'unknown'
    };

    setResyncHistory(prev => {
      const newHistory = [resyncEntry, ...prev.slice(0, RESYNC_HISTORY_SIZE - 1)];
      return newHistory;
    });

    // Update stats
    setResyncStats(prev => {
      const totalResyncs = prev.totalResyncs + 1;
      const successfulResyncs = prev.successfulResyncs + (result === 'success' ? 1 : 0);
      const failedResyncs = prev.failedResyncs + (result === 'failed' ? 1 : 0);
      
      // Calculate average drift from recent history
      const recentDrifts = [drift, ...resyncHistory.slice(0, 4).map(r => r.drift)];
      const averageDrift = recentDrifts.reduce((sum, d) => sum + d, 0) / recentDrifts.length;
      
      return {
        totalResyncs,
        successfulResyncs,
        failedResyncs,
        averageDrift: parseFloat(averageDrift.toFixed(3)),
        lastDrift: parseFloat(drift.toFixed(3))
      };
    });
  };

  // Smart resync suggestion based on drift patterns
  useEffect(() => {
    if (resyncStats.lastDrift > SMART_RESYNC_THRESHOLD && !resyncInProgress) {
      setSmartResyncSuggestion(true);
      // Auto-hide suggestion after 10 seconds
      const timer = setTimeout(() => setSmartResyncSuggestion(false), 10000);
      return () => clearTimeout(timer);
    } else {
      setSmartResyncSuggestion(false);
    }
  }, [resyncStats.lastDrift, resyncInProgress]);

  // Enhanced debug function to check current drift and auto-sync metrics (for development)
  const debugCurrentDrift = () => {
    const audio = audioRef.current;
    if (!audio || !socket || !socket.sessionId) {
      console.log('[Debug] Cannot check drift - missing audio or socket');
      return;
    }
    
    console.log('[Debug] Starting comprehensive drift analysis...');
    
    socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
      console.log('[Debug] Raw sync state received:', state);
      
      if (!state) {
        console.log('[Debug] No sync state received from server');
        return;
      }
      
      if (typeof state.timestamp !== 'number' || typeof state.lastUpdated !== 'number') {
        console.log('[Debug] Invalid sync state structure:', state);
        return;
      }
      
      if (!isFinite(state.timestamp) || !isFinite(state.lastUpdated)) {
        console.log('[Debug] Non-finite timestamps in sync state:', {
          timestamp: state.timestamp,
          lastUpdated: state.lastUpdated
        });
        return;
      }
      
      const now = getNow(getServerTime);
      const rttComp = rtt ? rtt / 2000 : 0;
      const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
      const drift = audio.currentTime - expected;
      const absDrift = Math.abs(drift);
      
      // Analyze current drift pattern
      const analysis = analyzeDriftPattern(absDrift, Date.now());
      const predictedDrift = predictDrift(5);
      
      console.log('[Debug] Enhanced Auto-Sync Analysis:', {
        // Raw state data
        rawState: {
          timestamp: state.timestamp,
          lastUpdated: state.lastUpdated,
          isPlaying: state.isPlaying,
          trackId: state.trackId
        },
        
        // Time calculations
        timeCalculation: {
          now,
          rttComp,
          audioLatency,
          smoothedOffset,
          expected,
          isValid: isFiniteNumber(expected) && expected >= 0
        },
        
        // Basic drift info
        currentTime: audio.currentTime.toFixed(3),
        expectedTime: expected.toFixed(3),
        drift: drift.toFixed(3),
        absDrift: absDrift.toFixed(3),
        
        // Auto-sync metrics
        syncMode: analysis.syncMode,
        adaptiveThreshold: analysis.adaptiveThreshold.toFixed(3),
        syncQuality: (analysis.syncQuality * 100).toFixed(1) + '%',
        networkStability: ((autoSyncRef.current?.networkStability || 1.0) * 100).toFixed(1) + '%',
        correctionSuccessRate: ((autoSyncRef.current?.correctionSuccessRate || 1.0) * 100).toFixed(1) + '%',
        
        // Drift analysis
        driftTrend: analysis.driftTrend.toFixed(4),
        driftVelocity: analysis.driftVelocity.toFixed(4),
        predictedDrift: predictedDrift.toFixed(3),
        avgDrift: analysis.avgDrift.toFixed(3),
        driftVariance: analysis.driftVariance.toFixed(4),
        
        // Audio state
        audioState: {
          isPlaying: !audio.paused,
          playbackRate: audio.playbackRate,
          duration: audio.duration,
          readyState: audio.readyState
        },
        
        // System state
        systemState: {
          isController,
          sessionId: socket.sessionId,
          socketConnected: socket.connected,
          audioState: audioState
        },
        
        // Correction state
        correctionState: {
          consecutiveCorrections: autoSyncRef.current?.consecutiveCorrections || 0,
          driftHistoryLength: autoSyncRef.current?.driftHistory?.length || 0,
          lastCorrection: lastCorrectionRef.current,
          correctionInProgress: correctionInProgressRef.current
        }
      });
      
      // Additional validation checks
      if (!isFiniteNumber(expected)) {
        console.error('[Debug] CRITICAL: Expected time calculation failed!', {
          expected,
          type: typeof expected,
          components: {
            stateTimestamp: state.timestamp,
            stateLastUpdated: state.lastUpdated,
            now,
            rttComp,
            audioLatency,
            smoothedOffset
          }
        });
      }
      
      if (expected < 0) {
        console.error('[Debug] CRITICAL: Expected time is negative!', expected);
      }
      
      if (expected > 86400) {
        console.warn('[Debug] WARNING: Expected time seems unreasonable (>24h):', expected);
      }
    });
  };

  // Expose debug functions globally in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.debugAudioDrift = debugCurrentDrift;
      
      // Debug duration issues
      window.debugAudioDuration = () => {
        const audio = audioRef.current;
        console.log('[DebugDuration] Audio duration debug info:', {
          audio: audio ? {
            duration: audio.duration,
            readyState: audio.readyState,
            networkState: audio.networkState,
            currentSrc: audio.currentSrc,
            src: audio.src,
            preload: audio.preload,
            paused: audio.paused,
            ended: audio.ended,
            seeking: audio.seeking
          } : null,
          state: {
            duration,
            currentTime,
            displayedCurrentTime,
            audioUrl,
            currentTrack: currentTrack ? {
              title: currentTrack.title,
              id: currentTrack.id,
              url: currentTrack.url
            } : null
          },
          system: {
            isIOS,
            isController,
            loading,
            audioError
          }
        });
        
        // Try to force duration check
        if (audio && audio.readyState >= 1) {
          const forcedDuration = audio.duration;
          console.log('[DebugDuration] Forced duration check:', forcedDuration);
          if (forcedDuration && isFinite(forcedDuration) && forcedDuration > 0) {
            setDuration(forcedDuration);
            console.log('[DebugDuration] Duration set via debug:', forcedDuration);
          }
        }
      };
      
      // Debug progress issues
      window.debugAudioProgress = () => {
        const audio = audioRef.current;
        console.log('[DebugProgress] Audio progress debug info:', {
          audio: audio ? {
            currentTime: audio.currentTime,
            duration: audio.duration,
            readyState: audio.readyState,
            paused: audio.paused,
            seeking: audio.seeking,
            ended: audio.ended
          } : null,
          state: {
            currentTime,
            displayedCurrentTime,
            duration,
            isPlaying
          },
          track: currentTrack ? {
            title: currentTrack.title,
            id: currentTrack.id
          } : null
        });
        
        // Force progress reset
        console.log('[DebugProgress] Forcing progress reset...');
        setDisplayedCurrentTime(0);
        setCurrentTime(0);
        
        setTimeout(() => {
          console.log('[DebugProgress] Progress reset completed');
        }, 100);
      };
      
      // Enhanced sync system test
      window.testSyncSystem = () => {
        console.log('[TestSync] Testing enhanced sync system...');
        const audio = audioRef.current;
        if (!audio) {
          console.error('[TestSync] No audio element available');
          return;
        }
        
        console.log('[TestSync] Current audio state:', {
          currentTime: audio.currentTime,
          duration: audio.duration,
          isPlaying: !audio.paused,
          playbackRate: audio.playbackRate,
          readyState: audio.readyState
        });
        
        console.log('[TestSync] Enhanced system state:', {
          isController,
          socketConnected: socket?.connected,
          sessionId: socket?.sessionId,
          audioState: audioState,
          isIOS,
          audioContextState: audioContext?.state,
          autoSync: autoSyncRef.current || 'Not initialized'
        });
        
        // Test enhanced time calculation
        const testNow = getNow(getServerTime);
        console.log('[TestSync] Enhanced time calculation test:', {
          testNow,
          isValid: isFiniteNumber(testNow),
          type: typeof testNow,
          timingReliable: TimingUtils.isTimingReliable()
        });
        
        // Test enhanced drift prediction
        if (autoSyncRef.current.driftHistory.length >= 3) {
          const enhancedPrediction = EnhancedSyncUtils.predictDriftEnhanced(
            autoSyncRef.current.driftHistory, 
            5
          );
          console.log('[TestSync] Enhanced drift prediction:', {
            prediction: enhancedPrediction,
            historyLength: autoSyncRef.current.driftHistory.length,
            recentDrifts: autoSyncRef.current.driftHistory.slice(-5).map(d => d.drift)
          });
        }
        
        // Test adaptive sync interval
        const analysis = analyzeDriftPattern(0, Date.now());
        const adaptiveInterval = EnhancedSyncUtils.getAdaptiveSyncInterval(
          autoSyncRef.current.networkStability,
          analysis.syncQuality,
          analysis.driftVariance
        );
        console.log('[TestSync] Adaptive sync interval:', {
          interval: adaptiveInterval,
          networkStability: autoSyncRef.current.networkStability,
          syncQuality: analysis.syncQuality,
          driftVariance: analysis.driftVariance
        });
        
        // Test sync request with enhanced validation
        if (socket && socket.sessionId) {
          socket.emit('sync_request', { sessionId: socket.sessionId }, async (state) => {
            const validationResult = await EnhancedSyncUtils.validateSyncState(state);
            console.log('[TestSync] Enhanced sync request result:', {
              state,
              validation: validationResult
            });
          });
        } else {
          console.error('[TestSync] Cannot test sync request - missing socket or sessionId');
        }
      };
      
      // iOS-specific debug function
      window.debugIOSAudio = () => {
        if (!isIOS) {
          console.log('[DebugIOS] Not running on iOS');
          return;
        }
        
        const audio = audioRef.current;
        console.log('[DebugIOS] iOS Audio Debug Info:', {
          // Audio element state
          audio: audio ? {
            currentTime: audio.currentTime,
            duration: audio.duration,
            isPlaying: !audio.paused,
            playbackRate: audio.playbackRate,
            readyState: audio.readyState,
            networkState: audio.networkState,
            volume: audio.volume,
            muted: audio.muted,
            preload: audio.preload,
            playsInline: audio.playsInline
          } : null,
          
          // AudioContext state
          audioContext: audioContext ? {
            state: audioContext.state,
            sampleRate: audioContext.sampleRate,
            baseLatency: audioContext.baseLatency,
            outputLatency: audioContext.outputLatency
          } : null,
          
          // System state
          system: {
            isAudioContextReady,
            audioLatency,
            smoothedOffset,
            isController
          },
          
          // Sync state
          sync: {
            syncStatus: audioState.syncStatus,
            isSeeking: audioState.isSeeking,
            correctionInProgress: audioState.correctionInProgress,
            rateCorrectionActive: audioState.rateCorrectionActive,
            resyncInProgress: audioState.resyncInProgress
          }
        });
        
        // Test audio context resume
        if (audioContext && audioContext.state === 'suspended') {
          console.log('[DebugIOS] Attempting to resume AudioContext...');
          audioContext.resume().then(() => {
            console.log('[DebugIOS] AudioContext resumed successfully');
          }).catch(err => {
            console.error('[DebugIOS] Failed to resume AudioContext:', err);
          });
        }
            };
    }
  }, []);

  // Network quality monitoring
  useEffect(() => {
    if (!socket) return;
    
    let rttHistory = [];
    let packetLossCount = 0;
    let lastPingTime = 0;
    
    const updateNetworkQuality = () => {
      const autoSync = autoSyncRef.current;
      
      // Defensive: ensure autoSync is properly initialized
      if (!autoSync) {
        return;
      }
      
      // Calculate RTT stability
      if (rttHistory.length > 5) {
        const avgRtt = rttHistory.reduce((sum, r) => sum + r, 0) / rttHistory.length;
        const rttVariance = rttHistory.reduce((sum, r) => sum + Math.pow(r - avgRtt, 2), 0) / rttHistory.length;
        
        // Network stability based on RTT variance
        autoSync.networkStability = Math.max(0.1, Math.min(1.0, 1 - (rttVariance / 100)));
        
        // Adjust sync strategy based on network quality
        if (autoSync.networkStability < 0.5) {
          // Poor network - be more conservative
          autoSync.adaptiveThreshold = (autoSync.adaptiveThreshold || DRIFT_THRESHOLD) * 1.3;
          autoSync.syncMode = 'conservative';
        } else if (autoSync.networkStability > 0.8) {
          // Good network - can be more aggressive
          autoSync.adaptiveThreshold = (autoSync.adaptiveThreshold || DRIFT_THRESHOLD) * 0.9;
          if ((autoSync.syncQuality || 1.0) > 0.7) {
            autoSync.syncMode = 'aggressive';
          }
        }
      }
    };
    
    // Monitor RTT changes
    if (rtt && rtt > 0) {
      rttHistory.push(rtt);
      if (rttHistory.length > 10) rttHistory.shift();
      updateNetworkQuality();
    }
    
    // Monitor socket connection quality
    const checkConnection = () => {
      if (socket && socket.connected) {
        const now = Date.now();
        if (now - lastPingTime > 5000) { // Check every 5 seconds
          lastPingTime = now;
          // Simple ping test
          socket.emit('ping', { timestamp: now }, (response) => {
            if (response && response.timestamp) {
              const responseTime = Date.now() - response.timestamp;
              rttHistory.push(responseTime);
              if (rttHistory.length > 10) rttHistory.shift();
              updateNetworkQuality();
            } else {
              packetLossCount++;
              if (packetLossCount > 3) {
                const autoSync = autoSyncRef.current;
                if (autoSync) {
                  autoSync.networkStability = (autoSync.networkStability || 1.0) * 0.8; // Reduce stability on packet loss
                }
              }
            }
          });
        }
      }
    };
    
    const connectionInterval = setInterval(checkConnection, 5000);
    
    return () => {
      clearInterval(connectionInterval);
    };
  }, [socket, rtt]);

  // Enhanced intelligent drift analysis and prediction
  const analyzeDriftPattern = (currentDrift, timestamp) => {
    const autoSync = autoSyncRef.current;
    
    // Defensive: ensure autoSync is properly initialized
    if (!autoSync || !autoSync.driftHistory) {
      return {
        trend: 0,
        velocity: 0,
        adaptiveThreshold: DRIFT_THRESHOLD,
        syncQuality: 1.0,
        syncMode: 'normal',
        avgDrift: 0,
        driftVariance: 0,
        driftStability: 1.0,
        velocityMagnitude: 0
      };
    }
    
    // Add to drift history with enhanced metadata
    autoSync.driftHistory.push({ 
      drift: currentDrift, 
      timestamp,
      networkQuality: autoSync.networkStability || 1.0,
      correctionCount: autoSync.consecutiveCorrections || 0
    });
    if (autoSync.driftHistory.length > 20) {
      autoSync.driftHistory.shift();
    }
    
    // Calculate drift trend and velocity with enhanced smoothing
    if (autoSync.driftHistory.length >= 3) {
      const recent = autoSync.driftHistory.slice(-3);
      const older = autoSync.driftHistory.slice(-6, -3);
      
      if (older.length >= 3) {
        const recentAvg = recent.reduce((sum, d) => sum + d.drift, 0) / recent.length;
        const olderAvg = older.reduce((sum, d) => sum + d.drift, 0) / older.length;
        
        autoSync.driftTrend = recentAvg - olderAvg;
        autoSync.driftVelocity = autoSync.driftTrend / (recent[0].timestamp - older[0].timestamp) * 1000; // per second
      }
    }
    
    // Enhanced adaptive threshold calculation
    const avgDrift = autoSync.driftHistory.reduce((sum, d) => sum + d.drift, 0) / autoSync.driftHistory.length;
    const driftVariance = autoSync.driftHistory.reduce((sum, d) => sum + Math.pow(d.drift - avgDrift, 2), 0) / autoSync.driftHistory.length;
    
    // Multi-factor stability calculation
    const varianceFactor = Math.max(0.5, Math.min(2.0, 1 / (1 + driftVariance * 10)));
    const networkFactor = Math.max(0.8, Math.min(1.2, autoSync.networkStability));
    const correctionFactor = Math.max(0.9, Math.min(1.1, 1 - (autoSync.consecutiveCorrections * 0.05)));
    
    autoSync.adaptiveThreshold = DRIFT_THRESHOLD * varianceFactor * networkFactor * correctionFactor;
    
    // Enhanced sync quality calculation
    const baseQuality = Math.max(0.1, Math.min(1.0, 1 - avgDrift * 2));
    const networkQuality = autoSync.networkStability;
    const correctionQuality = Math.max(0.5, 1 - (autoSync.consecutiveCorrections * 0.1));
    
    autoSync.syncQuality = (baseQuality * 0.5 + networkQuality * 0.3 + correctionQuality * 0.2);
    
    // Enhanced sync mode determination
    const driftStability = 1 - Math.min(1, driftVariance * 20);
    const velocityMagnitude = Math.abs(autoSync.driftVelocity);
    
    if (velocityMagnitude > 0.015 || driftStability < 0.3) {
      autoSync.syncMode = 'aggressive';
    } else if (avgDrift < 0.015 && driftStability > 0.7 && autoSync.networkStability > 0.8) {
      autoSync.syncMode = 'conservative';
    } else {
      autoSync.syncMode = 'normal';
    }
    
    return {
      trend: autoSync.driftTrend,
      velocity: autoSync.driftVelocity,
      adaptiveThreshold: autoSync.adaptiveThreshold,
      syncQuality: autoSync.syncQuality,
      syncMode: autoSync.syncMode,
      avgDrift,
      driftVariance,
      driftStability,
      velocityMagnitude
    };
  };

  // Enhanced drift prediction using multiple algorithms
  const predictDrift = (timeHorizon = 5) => {
    const autoSync = autoSyncRef.current;
    
    // Defensive: ensure autoSync is properly initialized
    if (!autoSync || !autoSync.driftHistory || autoSync.driftHistory.length < 3) {
      return 0;
    }
    
    // Use enhanced prediction if we have enough data
    if (autoSync.driftHistory.length >= 5) {
      try {
        return EnhancedSyncUtils.predictDriftEnhanced(autoSync.driftHistory, timeHorizon);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[predictDrift] Enhanced prediction failed, falling back to simple:', error);
        }
      }
    }
    
    // Fallback to simple prediction
    const currentDrift = autoSync.driftHistory[autoSync.driftHistory.length - 1].drift;
    const predictedDrift = currentDrift + ((autoSync.driftVelocity || 0) * timeHorizon);
    
    return Math.max(0, predictedDrift);
  };

  // Enhanced correction success tracking
  const trackCorrectionSuccess = (beforeDrift, afterDrift, correctionType) => {
    const autoSync = autoSyncRef.current;
    
    // Defensive: ensure autoSync is properly initialized
    if (!autoSync) {
      return false;
    }
    
    const improvement = beforeDrift - afterDrift;
    const success = improvement > 0 && afterDrift < beforeDrift * 0.8; // 20% improvement threshold
    
    // Update success rate with exponential moving average
    const alpha = 0.3;
    autoSync.correctionSuccessRate = alpha * (success ? 1 : 0) + (1 - alpha) * (autoSync.correctionSuccessRate || 1.0);
    
    // Track consecutive corrections
    if (success) {
      autoSync.consecutiveCorrections = 0;
    } else {
      autoSync.consecutiveCorrections = (autoSync.consecutiveCorrections || 0) + 1;
    }
    
    // Adjust correction strategy based on success rate
    if (autoSync.correctionSuccessRate < 0.5) {
      // If corrections are failing, be more conservative
      autoSync.adaptiveThreshold = (autoSync.adaptiveThreshold || DRIFT_THRESHOLD) * 1.2;
    } else if (autoSync.correctionSuccessRate > 0.8) {
      // If corrections are working well, be more aggressive
      autoSync.adaptiveThreshold = (autoSync.adaptiveThreshold || DRIFT_THRESHOLD) * 0.9;
    }
    
    return success;
  };

  /**
   * Formats a time value in seconds to a human-readable string.
   * - Handles negative, NaN, and very large values gracefully.
   * - Supports hours for long durations (e.g., 1:23:45).
   * - Pads minutes and seconds as needed.
   * @param {number} t - Time in seconds.
   * @returns {string} - Formatted time string.
   */
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

  // iOS detection and audio context initialization
  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[AudioPlayer] iOS detected:', iOS);
    }
  }, []);

  // --- Automatic device latency estimation using AudioContext.baseLatency ---
  useEffect(() => {
    let ctx;
    try {
      // iOS-specific audio context settings
      const audioContextOptions = isIOS ? {
        sampleRate: 44100,
        latencyHint: 'interactive'
      } : {};
      
      ctx = new (window.AudioContext || window.webkitAudioContext)(audioContextOptions);
      audioContextRef.current = ctx;
      
      // iOS-specific optimizations
      if (isIOS) {
        // Resume audio context on iOS (required for audio playback)
        const resumeAudioContext = async () => {
          try {
            if (ctx.state === 'suspended') {
              await ctx.resume();
              if (process.env.NODE_ENV === 'development') {
                console.log('[AudioPlayer] iOS AudioContext resumed');
              }
            }
          } catch (e) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[AudioPlayer] Failed to resume iOS AudioContext:', e);
            }
          }
        };
        
        // Resume on user interaction
        const handleUserInteraction = () => {
          resumeAudioContext();
          document.removeEventListener('touchstart', handleUserInteraction);
          document.removeEventListener('touchend', handleUserInteraction);
          document.removeEventListener('click', handleUserInteraction);
        };
        
        document.addEventListener('touchstart', handleUserInteraction);
        document.addEventListener('touchend', handleUserInteraction);
        document.addEventListener('click', handleUserInteraction);
        
        // Also try to resume immediately
        resumeAudioContext();
      }
      
      if (ctx.baseLatency && ctx.baseLatency > 0 && ctx.baseLatency < 1) {
        setAudioLatency(ctx.baseLatency);
      }
      
      setAudioContext(ctx);
      setIsAudioContextReady(true);
      
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[AudioPlayer] Failed to create AudioContext:', e);
      }
    }
    
    // Don't close the context immediately - keep it for timing
    return () => {
      if (ctx && typeof ctx.close === 'function') {
        ctx.close();
        audioContextRef.current = null;
        setAudioContext(null);
        setIsAudioContextReady(false);
      }
    };
  }, [isIOS]);

  // Enhanced smooth time animation with atomic updates
  useEffect(() => {
    let raf;
    let lastUpdate = 0;
    const targetFPS = isIOS ? 30 : 60; // Lower FPS on iOS to reduce stuttering
    const frameInterval = 1000 / targetFPS;

    const animate = () => {
      const now = typeof TimingUtils !== 'undefined' && typeof TimingUtils.getTimeFor === 'function' 
        ? TimingUtils.getTimeFor('sync') 
        : Date.now();
      const audio = audioRef.current;
      
      if (!audio || now - lastUpdate < frameInterval) {
        raf = requestAnimationFrame(animate);
        return;
      }
      
      lastUpdate = now;
      const actual = audio.currentTime;
      
      // Handle track change reset - if audio is reset but displayed time is not
      if (actual === 0 && displayedCurrentTime > 0.1) {
        setDisplayedCurrentTime(0);
        setCurrentTime(0);
        if (process.env.NODE_ENV === 'development') {
          console.log('[AudioPlayer] Track change detected in animation, resetting progress');
        }
        raf = requestAnimationFrame(animate);
        return;
      }
      
      // Use atomic time update for precision
      TimingUtils.atomicTimeUpdate(() => {
        setDisplayedCurrentTime(prev => {
          const diff = Math.abs(prev - actual);
          
          // iOS-specific optimizations
          if (isIOS) {
            // Snap to actual more aggressively on iOS to reduce stuttering
            if (diff < 0.02 || diff > 0.3) {
              return actual;
            }
            
            // Use more conservative lerp factors on iOS
            let lerpFactor = 0.1; // Default smooth factor (lower on iOS)
            
            if (audioState.isSeeking) {
              lerpFactor = 0.6; // Fast response during seeking
            } else if (audioState.correctionInProgress) {
              lerpFactor = 0.4; // Responsive during corrections
            } else if (audioState.rateCorrectionActive) {
              lerpFactor = 0.3; // Moderate during rate corrections
            } else if (audioState.resyncInProgress) {
              lerpFactor = 0.7; // Very fast during manual resync
            }
            
            // Apply lerp with bounds checking
            const newTime = prev + (actual - prev) * lerpFactor;
            return Math.max(0, newTime);
          } else {
            // Standard behavior for other platforms
            if (diff < 0.01 || diff > 0.5) {
              return actual;
            }
            
            let lerpFactor = 0.15; // Default smooth factor
            
            if (audioState.isSeeking) {
              lerpFactor = 0.8; // Fast response during seeking
            } else if (audioState.correctionInProgress) {
              lerpFactor = 0.6; // Responsive during corrections
            } else if (audioState.rateCorrectionActive) {
              lerpFactor = 0.4; // Moderate during rate corrections
            } else if (audioState.resyncInProgress) {
              lerpFactor = 0.9; // Very fast during manual resync
            }
            
            const newTime = prev + (actual - prev) * lerpFactor;
            return Math.max(0, newTime);
          }
        });
      });
      
      raf = requestAnimationFrame(animate);
    };
    
    raf = requestAnimationFrame(animate);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [audioUrl, audioState.isSeeking, audioState.correctionInProgress, audioState.rateCorrectionActive, audioState.resyncInProgress, isIOS, displayedCurrentTime]);

  // Track change progress reset effect
  useEffect(() => {
    if (!currentTrack) return;
    
    // When track changes, ensure progress is properly reset
    const resetProgress = () => {
      setDisplayedCurrentTime(0);
      setCurrentTime(0);
      
      // Force multiple updates to ensure UI reflects the reset
      setTimeout(() => {
        setDisplayedCurrentTime(0);
        setCurrentTime(0);
      }, 50);
      
      setTimeout(() => {
        setDisplayedCurrentTime(0);
        setCurrentTime(0);
      }, 100);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[AudioPlayer] Track change progress reset for:', currentTrack.title);
      }
    };
    
    resetProgress();
  }, [currentTrack?.id]); // Only trigger on track ID change

  /**
   * Enhanced drift correction that minimizes playback interruption.
   * Uses a tiered approach:
   * 1. Micro-correction: Very small rate adjustments for tiny drifts
   * 2. Rate correction: Larger rate adjustments for medium drifts (no seeking)
   * 3. Seeking: Only for very large drifts as a last resort
   */
  function maybeCorrectDrift(audio, expected) {
    // Defensive: check for valid audio and expected time
    if (!audio || typeof audio.currentTime !== 'number') {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[DriftCorrection] Audio element not available or invalid');
      }
      return { corrected: false, reason: 'audio_invalid' };
    }
    
    // Check if audio is ready for the current track
    if (audio.readyState < 2) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Audio not ready for drift correction');
      }
      return { corrected: false, reason: 'audio_not_ready' };
    }
    if (!isFiniteNumber(expected) || expected < 0) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[DriftCorrection] Expected time is not finite or negative', { expected });
      }
      return { corrected: false, reason: 'expected_invalid' };
    }
    if (correctionInProgressRef.current) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Correction already in progress');
      }
      return { corrected: false, reason: 'in_progress' };
    }
    const now = Date.now();
    if (now - lastCorrectionRef.current < CORRECTION_COOLDOWN) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Correction cooldown active');
      }
      return { corrected: false, reason: 'cooldown' };
    }

    // Only correct if audio is playing (never pause to correct drift)
    if (audio.paused) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Audio is paused, not correcting drift');
      }
      return { corrected: false, reason: 'paused' };
    }

    const before = audio.currentTime;
    const drift = expected - before;
    const absDrift = Math.abs(drift);

    // Cancel any existing rate correction
    if (rateCorrectionRef.current.active) {
      audio.playbackRate = rateCorrectionRef.current.originalRate;
      rateCorrectionRef.current.active = false;
      setRateCorrectionActive(false);
    }

    // Emergency handling for very large gaps (>10 seconds)
    if (absDrift > EMERGENCY_SEEK_THRESHOLD) {
      correctionInProgressRef.current = true;
      setCorrectionInProgress(true);
      lastCorrectionRef.current = now;
      
      setCurrentTimeSafely(audio, expected, setCurrentTime);
      
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] EMERGENCY seek for massive drift', drift.toFixed(3), 'seconds');
      }
      
      setTimeout(() => {
        correctionInProgressRef.current = false;
        setCorrectionInProgress(false);
      }, 500);
      
      return { corrected: true, emergency: true, before, after: expected, drift };
    }

    // Force immediate correction for large gaps (>5 seconds)
    if (absDrift > LARGE_GAP_THRESHOLD) {
      correctionInProgressRef.current = true;
      setCorrectionInProgress(true);
      lastCorrectionRef.current = now;
      
      setCurrentTimeSafely(audio, expected, setCurrentTime);
      
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Force seek for large gap', drift.toFixed(3), 'seconds');
      }
      
      setTimeout(() => {
        correctionInProgressRef.current = false;
        setCorrectionInProgress(false);
      }, 500);
      
      return { corrected: true, largeGap: true, before, after: expected, drift };
    }

    // Tier 1: Micro-correction for very small drifts (0.04s)
    if (absDrift < MICRO_DRIFT_THRESHOLD) {
      correctionInProgressRef.current = true;
      setCorrectionInProgress(true);
      const rate = 1 + Math.max(-MICRO_RATE_CAP, Math.min(MICRO_RATE_CAP, drift * 0.7));
      audio.playbackRate = rate;
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Micro-correcting with playbackRate', rate.toFixed(4), 'for drift', drift.toFixed(3));
      }
      setTimeout(() => {
        audio.playbackRate = 1;
        correctionInProgressRef.current = false;
        setCorrectionInProgress(false);
      }, MICRO_CORRECTION_WINDOW);
      return { corrected: true, micro: true, before, after: expected, drift, rate };
    }

    // Tier 2: Enhanced rate correction for medium drifts (0.04s - 0.25s)
    if (absDrift < MEDIUM_DRIFT_THRESHOLD) {
      correctionInProgressRef.current = true;
      setCorrectionInProgress(true);
      lastCorrectionRef.current = now;
      
      // Calculate rate adjustment to correct drift over RATE_CORRECTION_DURATION
      const rateAdjustment = (drift / (RATE_CORRECTION_DURATION / 1000)) * RATE_CORRECTION_STRENGTH;
      const newRate = Math.max(0.5, Math.min(2.0, 1 + rateAdjustment)); // Clamp to reasonable range
      
      rateCorrectionRef.current = {
        active: true,
        startTime: now,
        targetDrift: drift,
        originalRate: audio.playbackRate,
        correctionId: now
      };
      
      // Use gradual rate transition for smoother correction with cleanup
      const cleanupTransition = EnhancedSyncUtils.gradualRateTransition(audio, newRate, RATE_CORRECTION_DURATION * 0.3);
      setRateCorrectionActive(true);
      
      // Store cleanup function for later use
      rateCorrectionRef.current.cleanupTransition = cleanupTransition;
      
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Rate-correcting with playbackRate', newRate.toFixed(4), 'for drift', drift.toFixed(3));
      }
      
      // Restore normal rate after correction duration
      setTimeout(() => {
        if (rateCorrectionRef.current.correctionId === now) {
          // Cleanup any active transition
          if (rateCorrectionRef.current.cleanupTransition) {
            rateCorrectionRef.current.cleanupTransition();
            rateCorrectionRef.current.cleanupTransition = null;
          }
          
          audio.playbackRate = rateCorrectionRef.current.originalRate;
          rateCorrectionRef.current.active = false;
          correctionInProgressRef.current = false;
          setRateCorrectionActive(false);
          setCorrectionInProgress(false);
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.log('[DriftCorrection] Rate correction completed, restored to', rateCorrectionRef.current.originalRate);
          }
        }
      }, RATE_CORRECTION_DURATION);
      
              return { corrected: true, rate: true, before, after: expected, drift, playbackRate: newRate };
    }

    // Tier 3: Enhanced rate correction for large drifts (0.25s - 0.5s) - avoid seeking
    if (absDrift < LARGE_DRIFT_THRESHOLD) {
      correctionInProgressRef.current = true;
      setCorrectionInProgress(true);
      lastCorrectionRef.current = now;
      
      // Use a longer, more gradual rate correction for larger drifts
      const extendedDuration = RATE_CORRECTION_DURATION * 1.5; // 3 seconds
      const rateAdjustment = (drift / (extendedDuration / 1000)) * RATE_CORRECTION_STRENGTH * 0.7; // More gentle
      const newRate = Math.max(0.5, Math.min(2.0, 1 + rateAdjustment));
      
      rateCorrectionRef.current = {
        active: true,
        startTime: now,
        targetDrift: drift,
        originalRate: audio.playbackRate,
        correctionId: now
      };
      
      // Use gradual rate transition for extended corrections with cleanup
      const cleanupTransition = EnhancedSyncUtils.gradualRateTransition(audio, newRate, extendedDuration * 0.4);
      setRateCorrectionActive(true);
      
      // Store cleanup function for later use
      rateCorrectionRef.current.cleanupTransition = cleanupTransition;
      
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Extended rate-correcting with playbackRate', newRate.toFixed(4), 'for large drift', drift.toFixed(3));
      }
      
      // Restore normal rate after extended correction duration
      setTimeout(() => {
        if (rateCorrectionRef.current.correctionId === now) {
          // Cleanup any active transition
          if (rateCorrectionRef.current.cleanupTransition) {
            rateCorrectionRef.current.cleanupTransition();
            rateCorrectionRef.current.cleanupTransition = null;
          }
          
          audio.playbackRate = rateCorrectionRef.current.originalRate;
          rateCorrectionRef.current.active = false;
          correctionInProgressRef.current = false;
          setRateCorrectionActive(false);
          setCorrectionInProgress(false);
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.log('[DriftCorrection] Extended rate correction completed');
          }
        }
      }, extendedDuration);
      
      return { corrected: true, extendedRate: true, before, after: expected, drift, playbackRate: newRate };
    }

    // Tier 4: Immediate seeking for very large drifts (>1.0s) - only as absolute last resort
    if (absDrift < SEEK_FALLBACK_THRESHOLD) {
      // Only seek if we haven't sought recently (cooldown)
      if (now - lastCorrectionRef.current < 10000) { // 10 second cooldown
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('[DriftCorrection] Skipping emergency seek due to cooldown', drift.toFixed(3));
        }
        return { corrected: false, reason: 'emergency_seek_cooldown' };
      }
      
      correctionInProgressRef.current = true;
      lastCorrectionRef.current = now;
      
      setCurrentTimeSafely(audio, expected, setCurrentTime);
      
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Emergency seek for very large drift', drift.toFixed(3));
      }
      
      setTimeout(() => {
        correctionInProgressRef.current = false;
      }, 500);
      
      return { corrected: true, emergency: true, before, after: expected, drift };
    }

    // Fallback: For extremely large drifts, just log and don't correct
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[DriftCorrection] Drift too large to correct safely', drift.toFixed(3));
    }
    return { corrected: false, reason: 'drift_too_large' };
  }

  // --- Micro-Drift Correction ---
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    let interval;
    function correctMicroDrift() {
      if (!audio || isController) return;
      
      // Skip micro-correction if a larger rate correction is active
      if (rateCorrectionRef.current.active) {
        return;
      }
      
      // Estimate expected time using current sync logic
      const now = getNow(getServerTime);
      const rttComp = rtt ? rtt / 2000 : 0;
      const expected = (sessionSyncState && typeof sessionSyncState.timestamp === 'number' && typeof sessionSyncState.lastUpdated === 'number')
        ? sessionSyncState.timestamp + (now - sessionSyncState.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset
        : null;
      if (!isFiniteNumber(expected)) return;
      const drift = audio.currentTime - expected;
      
      // Enhanced micro-correction with hysteresis to prevent oscillation
      if (Math.abs(drift) > MICRO_DRIFT_MIN && Math.abs(drift) < MICRO_DRIFT_MAX) {
        // Calculate playbackRate adjustment with hysteresis
        const hysteresisThreshold = MICRO_DRIFT_MIN + MICRO_CORRECTION_HYSTERESIS;
        
        // Only correct if drift is above hysteresis threshold
        if (Math.abs(drift) > hysteresisThreshold) {
          // Calculate rate adjustment with enhanced precision
          const driftRatio = Math.abs(drift) / MICRO_DRIFT_MAX;
          const rateAdjustment = driftRatio * MICRO_RATE_CAP_MICRO * (drift > 0 ? -1 : 1);
          
          // Apply gradual rate transition for smoother correction
          const targetRate = Math.max(1 - MICRO_RATE_CAP_MICRO, Math.min(1 + MICRO_RATE_CAP_MICRO, 1 + rateAdjustment));
          
          // Only apply if the change is significant enough
          if (Math.abs(audio.playbackRate - targetRate) > 0.0005) {
                  // Use gradual transition for micro-corrections with cleanup
      const cleanupTransition = EnhancedSyncUtils.gradualRateTransition(audio, targetRate, 200);
      
      // Store cleanup function (micro-corrections are short-lived)
      setTimeout(() => {
        if (cleanupTransition) cleanupTransition();
      }, 250);
            
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.log('[MicroDrift] Gradual adjustment to', targetRate.toFixed(5), 'for drift', drift.toFixed(4));
            }
          }
        }
      } else {
        // Enhanced restoration logic with gradual transition
        if (Math.abs(audio.playbackRate - 1) > 0.001) {
                  // Use gradual transition to restore normal rate with cleanup
        const cleanupTransition = EnhancedSyncUtils.gradualRateTransition(audio, 1, 300);
        
        // Store cleanup function (restoration is short-lived)
        setTimeout(() => {
          if (cleanupTransition) cleanupTransition();
        }, 350);
          
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.log('[MicroDrift] Gradual restoration to 1.0');
          }
        }
      }
    }
    interval = setInterval(correctMicroDrift, MICRO_CORRECTION_WINDOW);
    return () => clearInterval(interval);
  }, [isController, sessionSyncState, audioLatency, rtt, smoothedOffset, getServerTime]);

  // --- Cleanup rate corrections on unmount/audio change ---
  useEffect(() => {
    return () => {
      // Cleanup any active rate corrections when component unmounts
      if (rateCorrectionRef.current.active && audioRef.current) {
        // Cleanup any active transition
        if (rateCorrectionRef.current.cleanupTransition) {
          rateCorrectionRef.current.cleanupTransition();
          rateCorrectionRef.current.cleanupTransition = null;
        }
        
        audioRef.current.playbackRate = rateCorrectionRef.current.originalRate;
        rateCorrectionRef.current.active = false;
        setRateCorrectionActive(false);
      }
    };
  }, [audioUrl]); // Re-run when audio URL changes

  // --- MOBILE REDESIGN ---
  if (mobile) {
    if (loading) {
      return (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[95vw] max-w-sm z-40 pointer-events-auto">
          <LoadingSpinner size="md" text="Loading..." />
        </div>
      );
    }
    if (audioError) {
      return (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[95vw] max-w-sm z-40 pointer-events-auto">
          <div className="p-4 bg-red-900/80 rounded-2xl shadow-xl border border-red-700 text-center animate-fade-in">
            <div className="flex flex-col items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.5a.75.75 0 001.5 0v-4.5zm-.75 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <div className="text-white font-medium">Audio Error</div>
              <div className="text-neutral-300 text-sm">{audioError}</div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed bottom-20 left-1/2 w-[95vw] max-w-sm z-40 pointer-events-auto -translate-x-1/2">
        <div className={`${shouldAnimate ? 'animate-slide-up-from-bottom' : 'opacity-0 translate-y-full'}`}>
          <div className="bg-neutral-900/90 backdrop-blur-lg rounded-2xl shadow-2xl p-3 flex flex-col gap-2 border border-neutral-800">
          {/* Audio element (hidden) */}
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              preload={isIOS ? "metadata" : "auto"}
              playsInline={isIOS}
              webkit-playsinline={isIOS ? "true" : undefined}
              style={{ display: 'none' }}
              onLoadedMetadata={() => {
                const audio = audioRef.current;
                if (audio && !isController && !isPlaying) {
                  audio.pause();
                  setCurrentTime(0);
                }
                
                // Set duration when metadata loads
                if (audio && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
                  setDuration(audio.duration);
                  if (process.env.NODE_ENV === 'development') {
                    console.log('[AudioPlayer] Duration set on loadedmetadata:', audio.duration);
                  }
                }
                
                // iOS-specific optimizations after metadata loads
                if (isIOS && audio) {
                  audio.volume = 1.0;
                  audio.muted = false;
                  
                  if (process.env.NODE_ENV === 'development') {
                    console.log('[AudioPlayer] iOS audio metadata loaded:', {
                      duration: audio.duration,
                      readyState: audio.readyState,
                      networkState: audio.networkState
                    });
                  }
                }
                
                // Track change sync validation
                if (currentTrack && process.env.NODE_ENV === 'development') {
                  console.log('[AudioPlayer] Track metadata loaded:', {
                    trackTitle: currentTrack.title,
                    trackId: currentTrack.id,
                    duration: audio.duration,
                    readyState: audio.readyState
                  });
                }
              }}
              onCanPlay={() => {
                if (isIOS && process.env.NODE_ENV === 'development') {
                  console.log('[AudioPlayer] iOS audio can play');
                }
              }}
              onError={(e) => {
                if (process.env.NODE_ENV === 'development') {
                  console.error('[AudioPlayer] Audio error:', e, {
                    isIOS,
                    audioUrl,
                    error: e.target.error
                  });
                }
              }}
            />
          )}
          {/* Top: Track info and sync status */}
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-white font-semibold truncate max-w-[60%]">
              Now Playing
            </div>
            <div className="flex items-center gap-1">
              <SyncStatus status={audioState.syncStatus} />
                          {audioState.resyncInProgress && (
              <span className="ml-1 px-2 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] rounded font-bold animate-pulse">Manual Sync</span>
            )}
            {audioState.correctionInProgress && !audioState.resyncInProgress && (
              <span className="ml-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] rounded font-bold animate-pulse">Syncing</span>
            )}
            {audioState.rateCorrectionActive && !audioState.correctionInProgress && !audioState.resyncInProgress && (
              <span className="ml-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded font-bold animate-pulse">Rate Sync</span>
            )}
              {isController && (
                <span className="ml-1 px-2 py-0.5 bg-primary/20 text-primary text-[10px] rounded font-bold">Controller</span>
              )}
            </div>
          </div>
          {/* Track Title */}
          <div className="mb-2 text-center min-h-[1.5em] relative flex items-center justify-center" style={{height: '1.5em'}}>
            <span
              className={`inline-block mt-6 text-md font-semibold text-white transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
                ${animating && direction === 'up' ? 'opacity-0 translate-x-6 scale-95' : ''}
                ${animating && direction === 'down' ? 'opacity-0 -translate-x-6 scale-95' : ''}
                ${!animating ? 'opacity-100 translate-x-0 scale-100' : ''}
              `}
              style={{
                willChange: 'opacity, transform',
                transitionProperty: 'opacity, transform',
              }}
            >
              {displayedTitle || 'Unknown Track'}
            </span>
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-2 w-full">
            <span className="text-[11px] text-neutral-400 w-8 text-left font-mono">{formatTime(displayedCurrentTime)}</span>
            <input
              key={`seekbar-${currentTrack?.id || 'default'}`}
              type="range"
              min={0}
              max={isFinite(duration) ? duration : 0}
              step={0.01}
              value={isFinite(displayedCurrentTime) ? displayedCurrentTime : 0}
              onChange={handleSeek}
              className="flex-1 h-3 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-primary"
              style={{ WebkitAppearance: 'none', appearance: 'none' }}
              disabled={disabled || !isController || !audioUrl}
            />
            <span className="text-[11px] text-neutral-400 w-8 text-right font-mono">
              {duration && duration > 0 ? formatTime(duration) : '--:--'}
            </span>
          </div>
          {/* Controls row */}
          <div className="flex items-center justify-between mt-1">
            <button
              className="w-12 h-12 rounded-full flex items-center justify-center bg-primary shadow-lg text-white text-2xl active:scale-95 transition-all duration-200"
              onClick={isPlaying ? handlePause : handlePlay}
              disabled={disabled || !isController || !audioUrl}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              )}
            </button>
            <button
              className={`ml-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shadow ${
                audioState.resyncInProgress 
                  ? 'bg-blue-600 text-white' 
                  : smartResyncSuggestion 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white'
              }`}
              onClick={handleResync}
              disabled={disabled || !audioUrl || audioState.resyncInProgress}
              aria-label="Re-sync"
            >
              {audioState.resyncInProgress ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                  <path d="M21 12a9 9 0 11-6.219-8.56"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                  <path d="M21 3v5h-5"></path>
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                  <path d="M3 21v-5h5"></path>
                </svg>
              )}
              <span className="hidden sm:inline">
                              {audioState.resyncInProgress ? 'Syncing...' : smartResyncSuggestion ? 'Sync*' : 'Sync'}
            </span>
          </button>
          {process.env.NODE_ENV === 'development' && (
            <button
              className="ml-2 px-2 py-2 rounded-lg text-xs font-medium bg-gray-600 hover:bg-gray-700 text-white transition-all duration-200"
              onClick={debugCurrentDrift}
              aria-label="Debug Drift"
            >
              Debug
            </button>
          )}
          </div>
        </div>
        </div>
      </div>
    );
  }

  // --- DESKTOP/DEFAULT LAYOUT (unchanged) ---
  if (loading) {
    return <LoadingSpinner size="lg" text="Loading audio..." />;
  }

  if (audioError) {
    return (
      <div className="p-6 bg-neutral-900/50 rounded-lg border border-neutral-800 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.5a.75.75 0 001.5 0v-4.5zm-.75 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-medium">Audio Error</h3>
            <p className="text-neutral-400 text-sm">Unable to load audio</p>
          </div>
        </div>
        <div className="text-neutral-300 text-sm">{audioError}</div>
      </div>
    );
  }

  return (
    <div className={`audio-player transition-all duration-500 ${audioLoaded.animationClass}`}>
      {/* Track Title */}
      <div className="mb-2 text-center min-h-[1.5em] relative flex items-center justify-center" style={{height: '1.5em'}}>
        <span
          className={`inline-block text-lg font-semibold text-white transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
            ${animating && direction === 'up' ? 'opacity-0 translate-x-6 scale-95' : ''}
            ${animating && direction === 'down' ? 'opacity-0 -translate-x-6 scale-95' : ''}
            ${!animating ? 'opacity-100 translate-x-0 scale-100' : ''}
          `}
          style={{
            willChange: 'opacity, transform',
            transitionProperty: 'opacity, transform',
          }}
        >
          {displayedTitle || 'Unknown Track'}
        </span>
      </div>
      {/* Audio Element */}
      {audioUrl ? (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          preload={isIOS ? "metadata" : "auto"}
          playsInline={isIOS}
          webkit-playsinline={isIOS ? "true" : undefined}
          onLoadedMetadata={() => {
            // Ensure audio is paused when metadata loads (especially for listeners)
            const audio = audioRef.current;
            if (audio && !isController && !isPlaying) {
              audio.pause();
              setCurrentTime(0);
            }
            
            // Set duration when metadata loads
            if (audio && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
              setDuration(audio.duration);
              if (process.env.NODE_ENV === 'development') {
                console.log('[AudioPlayer] Duration set on loadedmetadata (desktop):', audio.duration);
              }
            }
            
            // iOS-specific optimizations after metadata loads
            if (isIOS && audio) {
              audio.volume = 1.0;
              audio.muted = false;
              
              if (process.env.NODE_ENV === 'development') {
                console.log('[AudioPlayer] iOS audio metadata loaded:', {
                  duration: audio.duration,
                  readyState: audio.readyState,
                  networkState: audio.networkState
                });
              }
            }
          }}
          onCanPlay={() => {
            if (isIOS && process.env.NODE_ENV === 'development') {
              console.log('[AudioPlayer] iOS audio can play');
            }
          }}
          onError={(e) => {
            if (process.env.NODE_ENV === 'development') {
              console.error('[AudioPlayer] Audio error:', e, {
                isIOS,
                audioUrl,
                error: e.target.error
              });
            }
          }}
        />
      ) : null}

      {/* Now Playing Section */}
      <div className="bg-neutral-900/50 rounded-lg border border-neutral-800 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-medium">Now Playing</h3>
            <p className="text-neutral-400 text-sm">Synchronized audio stream</p>
          </div>
          <div className="text-right">
            <div className="text-white font-mono text-sm">
              {formatTime(displayedCurrentTime)} / {duration && duration > 0 ? formatTime(duration) : '--:--'}
            </div>
            <div className="text-neutral-400 text-xs">Duration</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <input
            key={`seekbar-desktop-${currentTrack?.id || 'default'}`}
            type="range"
            min={0}
            max={isFinite(duration) ? duration : 0}
            step={0.01}
            value={isFinite(displayedCurrentTime) ? displayedCurrentTime : 0}
            onChange={handleSeek}
            className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
            }}
            disabled={disabled || !isController || !audioUrl}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                isPlaying 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-primary hover:bg-primary/90 text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={isPlaying ? handlePause : handlePlay}
              disabled={disabled || !isController || !audioUrl}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              )}
            </button>
            
            <button
              className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                audioState.resyncInProgress 
                  ? 'bg-blue-600 text-white' 
                  : smartResyncSuggestion 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white'
              }`}
              onClick={handleResync}
              disabled={disabled || !audioUrl || audioState.resyncInProgress}
            >
              {audioState.resyncInProgress ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                  <path d="M21 12a9 9 0 11-6.219-8.56"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                  <path d="M21 3v5h-5"></path>
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                  <path d="M3 21v-5h5"></path>
                </svg>
              )}
              {audioState.resyncInProgress ? 'Syncing...' : smartResyncSuggestion ? 'Re-sync*' : 'Re-sync'}
            </button>
          </div>

          <div className="text-right">
            <SyncStatus 
              status={audioState.syncStatus} 
              showSmartSuggestion={smartResyncSuggestion}
            />
            <div className="text-neutral-400 text-xs mt-1">
              {isController ? 'You are the controller' : 'You are a listener'}
            </div>
            {audioState.resyncInProgress && (
              <div className="text-orange-400 text-xs mt-1 animate-pulse">
                Manual resync in progress
              </div>
            )}
            {audioState.correctionInProgress && !audioState.resyncInProgress && (
              <div className="text-yellow-400 text-xs mt-1 animate-pulse">
                Syncing in progress
              </div>
            )}
            {audioState.rateCorrectionActive && !audioState.correctionInProgress && !audioState.resyncInProgress && (
              <div className="text-blue-400 text-xs mt-1 animate-pulse">
                Rate correction active
              </div>
            )}
            {resyncStats.totalResyncs > 0 && (
              <div className="text-neutral-500 text-xs mt-1">
                Sync: {resyncStats.successfulResyncs}/{resyncStats.totalResyncs} successful
              </div>
            )}
            {process.env.NODE_ENV === 'development' && (
              <div className="text-neutral-600 text-xs mt-1">
                Mode: {autoSyncRef.current?.syncMode || 'normal'} | 
                Quality: {((autoSyncRef.current?.syncQuality || 1.0) * 100).toFixed(0)}% | 
                Network: {((autoSyncRef.current?.networkStability || 1.0) * 100).toFixed(0)}%
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 