import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

// Enhanced automatic sync constants for zero-lag/advance protection
const DRIFT_THRESHOLD = 0.1; // seconds (reduced for tighter sync)
const PLAY_OFFSET = 0.35; // seconds (350ms future offset for play events)
const DEFAULT_AUDIO_LATENCY = 0.08; // 80ms fallback if not measured
const MICRO_DRIFT_THRESHOLD = 0.02; // seconds (reduced for micro-corrections)
const MICRO_RATE_CAP = 0.01; // max playbackRate delta (reduced for gentler correction)
const MICRO_CORRECTION_WINDOW = 200; // ms (shortened for quicker reset)
const DRIFT_JITTER_BUFFER = 2; // consecutive drift detections before correction (reduced for faster response)
const RESYNC_COOLDOWN_MS = 1000; // minimum time between manual resyncs (reduced)
const RESYNC_HISTORY_SIZE = 5; // number of recent resyncs to track
const SMART_RESYNC_THRESHOLD = 0.3; // drift threshold for smart resync suggestion (reduced)

// Zero-lag/advance protection constants
const ZERO_DRIFT_TOLERANCE = 0.05; // 50ms tolerance for "perfect" sync
const CRITICAL_DRIFT_THRESHOLD = 0.2; // 200ms - immediate correction
const EMERGENCY_DRIFT_THRESHOLD = 0.5; // 500ms - emergency hard seek
const CONTINUOUS_SYNC_INTERVAL = 200; // 200ms continuous sync for followers
const PROACTIVE_SYNC_INTERVAL = 100; // 100ms proactive sync check
const BUFFER_UNDERRUN_THRESHOLD = 0.3; // 300ms buffer ahead required
const MAX_CONSECUTIVE_CORRECTIONS = 5; // Max corrections before forced resync

// Micro drift correction constants
const MICRO_DRIFT_MIN = 0.005; // 5ms (reduced for finer control)
const MICRO_DRIFT_MAX = 0.1;  // 100ms (reduced for more frequent corrections)
const MICRO_RATE_CAP_MICRO = 0.002; // max playbackRate delta for micro-correction (reduced)
const MIN_BUFFER_AHEAD = 0.3; // seconds, minimum buffer ahead to allow drift correction (reduced)

// Adaptive drift correction constants
const BASE_DRIFT_THRESHOLD = 0.25; // seconds (baseline)
const BASE_MICRO_DRIFT_MIN = 0.01; // 10ms baseline
const BASE_MICRO_DRIFT_MAX = 0.15; // 150ms baseline
const BASE_MICRO_RATE_CAP = 0.015; // max playbackRate delta baseline

// Device-specific multipliers
const DEVICE_MULTIPLIERS = {
  mobile: { threshold: 1.5, microMin: 1.2, microMax: 1.3, rateCap: 0.8 },
  tablet: { threshold: 1.3, microMin: 1.1, microMax: 1.2, rateCap: 0.9 },
  desktop: { threshold: 1.0, microMin: 1.0, microMax: 1.0, rateCap: 1.0 },
  lowEnd: { threshold: 2.0, microMin: 1.5, microMax: 1.8, rateCap: 0.6 }
};

// Network condition multipliers
const NETWORK_MULTIPLIERS = {
  excellent: { threshold: 0.8, microMin: 0.8, microMax: 0.8, rateCap: 1.2 },
  good: { threshold: 1.0, microMin: 1.0, microMax: 1.0, rateCap: 1.0 },
  fair: { threshold: 1.3, microMin: 1.2, microMax: 1.3, rateCap: 0.8 },
  poor: { threshold: 1.8, microMin: 1.5, microMax: 1.8, rateCap: 0.6 }
};

// Helper function to detect device type
function detectDeviceType() {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua);
  const isTablet = /tablet|ipad/i.test(ua);
  const isLowEnd = navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2;
  
  if (isLowEnd) return 'lowEnd';
  if (isTablet) return 'tablet';
  if (isMobile) return 'mobile';
  return 'desktop';
}

// Helper function to assess network quality
function assessNetworkQuality(rtt, jitter) {
  if (rtt < 30 && jitter < 10) return 'excellent';
  if (rtt < 80 && jitter < 25) return 'good';
  if (rtt < 150 && jitter < 50) return 'fair';
  return 'poor';
}

// Dynamic threshold calculation
function calculateAdaptiveThresholds(rtt, jitter, audioLatency) {
  const deviceType = detectDeviceType();
  const networkQuality = assessNetworkQuality(rtt, jitter);
  
  const deviceMultiplier = DEVICE_MULTIPLIERS[deviceType];
  const networkMultiplier = NETWORK_MULTIPLIERS[networkQuality];
  
  // Combine multipliers (geometric mean for better balance)
  const combinedThreshold = Math.sqrt(deviceMultiplier.threshold * networkMultiplier.threshold);
  const combinedMicroMin = Math.sqrt(deviceMultiplier.microMin * networkMultiplier.microMin);
  const combinedMicroMax = Math.sqrt(deviceMultiplier.microMax * networkMultiplier.microMax);
  const combinedRateCap = Math.sqrt(deviceMultiplier.rateCap * networkMultiplier.rateCap);
  
  // Additional latency-based adjustment
  const latencyAdjustment = audioLatency ? Math.min(2.0, Math.max(0.5, audioLatency / 0.1)) : 1.0;
  
  return {
    driftThreshold: BASE_DRIFT_THRESHOLD * combinedThreshold * latencyAdjustment,
    microDriftMin: BASE_MICRO_DRIFT_MIN * combinedMicroMin,
    microDriftMax: BASE_MICRO_DRIFT_MAX * combinedMicroMax,
    microRateCap: BASE_MICRO_RATE_CAP * combinedRateCap,
    deviceType,
    networkQuality,
    latencyAdjustment
  };
}

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
        setCurrentTime(value);
        // Optionally, fire a custom event for debugging
        // audio.dispatchEvent(new CustomEvent('currentTimeSetSafely', { detail: { value, eventType } }));
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
      audio.src = audio.src + (audio.src.includes('?') ? '&' : '?') + 'forceReload=' + Date.now();
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

// Optimized helper to get the most accurate server time for syncing
function getNow(getServerTime) {
  // Use performance.now() for high-resolution local fallback
  const localNow = () => (window.performance ? performance.timeOrigin + performance.now() : Date.now());

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

// --- Median and MAD helpers for outlier filtering ---
function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
function mad(arr, med) {
  // Median Absolute Deviation
  const deviations = arr.map(x => Math.abs(x - med));
  return median(deviations);
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
  audioLatency: propAudioLatency,
  testLatency: propTestLatency,
  networkLatency: propNetworkLatency,
  peerSyncs,
  jitter,
  queue = [],
  selectedTrackIdx = 0,
  onPrevTrack,
  onNextTrack
}) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioError, setAudioError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [syncStatus, setSyncStatus] = useState('In Sync');
  const [lastSync, setLastSync] = useState(Date.now());
  const audioRef = useRef(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [audioLatency, setAudioLatency] = useState(
    typeof propAudioLatency === 'number' ? propAudioLatency : DEFAULT_AUDIO_LATENCY
  );
  const testLatency = typeof propTestLatency === 'number' ? propTestLatency : undefined;
  const networkLatency = typeof propNetworkLatency === 'number' ? propNetworkLatency : undefined;
  const playRequestedAt = useRef(null);
  const lastCorrectionRef = useRef(0);
  const CORRECTION_COOLDOWN = 1500; // ms
  const correctionInProgressRef = useRef(false);
  const [displayedCurrentTime, setDisplayedCurrentTime] = useState(0);
  const lastSyncSeq = useRef(-1);
  const lastSyncState = useRef(null);
  const lastTimeUpdateCheck = useRef(0);
  const [syncReady, setSyncReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  
  // Enhanced zero-lag/advance protection state
  const continuousSyncInterval = useRef(null);
  const proactiveSyncInterval = useRef(null);
  const consecutiveCorrections = useRef(0);
  const lastCorrectionTime = useRef(0);
  const syncHealthScore = useRef(100); // 0-100, higher is better
  const enhancedDriftHistory = useRef([]);
  const [syncMode, setSyncMode] = useState('standard'); // 'standard', 'aggressive', 'emergency'
  const [syncQuality, setSyncQuality] = useState('excellent'); // 'excellent', 'good', 'fair', 'poor'

  // Drift correction debug state (move here to ensure defined)
  const [driftCorrectionHistory, setDriftCorrectionHistory] = useState([]);
  const [driftCorrectionCount, setDriftCorrectionCount] = useState(0);
  const [lastCorrectionType, setLastCorrectionType] = useState('none');
  const [bufferedAhead, setBufferedAhead] = useState(0);

  // Enhanced drift analytics and monitoring
  const [driftAnalytics, setDriftAnalytics] = useState({
    totalDrifts: 0,
    correctedDrifts: 0,
    averageDrift: 0,
    maxDrift: 0,
    deviceType: 'unknown',
    networkQuality: 'unknown',
    lastUpdate: Date.now()
  });

  // Enhanced drift history tracking
  useEffect(() => {
    if (!window._audioDriftHistory || window._audioDriftHistory.length === 0) return;
    
    const recentDrifts = window._audioDriftHistory.slice(-20);
    const totalDrifts = recentDrifts.length;
    const correctedDrifts = recentDrifts.filter(d => d.corrected).length;
    const averageDrift = recentDrifts.reduce((sum, d) => sum + d.drift, 0) / totalDrifts;
    const maxDrift = Math.max(...recentDrifts.map(d => d.drift));
    
    const currentThresholds = calculateAdaptiveThresholds(rtt || 0, jitter || 0, audioLatency || 0);
    
    setDriftAnalytics({
      totalDrifts,
      correctedDrifts,
      averageDrift,
      maxDrift,
      deviceType: currentThresholds.deviceType,
      networkQuality: currentThresholds.networkQuality,
      lastUpdate: Date.now()
    });
  }, [rtt, jitter, audioLatency]);

  // Enhanced drift reporting with analytics
  const emitEnhancedDriftReport = useCallback((drift, expected, current, extra = {}) => {
    if (socket && socket.emit && socket.sessionId && typeof drift === 'number') {
      const currentThresholds = calculateAdaptiveThresholds(rtt || 0, jitter || 0, audioLatency || 0);
      
      socket.emit('drift_report', {
        sessionId: socket.sessionId,
        drift,
        expected,
        current,
        clientId,
        timestamp: Date.now(),
        analytics: {
          deviceType: currentThresholds.deviceType,
          networkQuality: currentThresholds.networkQuality,
          adaptiveThreshold: currentThresholds.driftThreshold,
          rtt,
          jitter,
          audioLatency,
          driftHistory: window._audioDriftHistory ? window._audioDriftHistory.slice(-5) : []
        },
        ...extra,
      });
    }
  }, [socket, rtt, jitter, audioLatency, clientId]);

// --- Drift correction helpers moved inside the component ---
function microCorrectDrift(audio, drift, context = {}, updateDebug) {
  if (!audio) return;
  
  // Calculate adaptive thresholds based on current conditions
  const adaptiveThresholds = calculateAdaptiveThresholds(
    context.rtt || 0, 
    context.jitter || 0, 
    context.audioLatency || 0
  );
  
  const { microDriftMin, microDriftMax, microRateCap } = adaptiveThresholds;
  
  if (Math.abs(drift) > microDriftMin && Math.abs(drift) < microDriftMax) {
    // Enhanced rate calculation with predictive adjustment
    const baseRate = 1 + Math.max(-microRateCap, Math.min(microRateCap, drift * 0.5));
    
    // Predictive adjustment based on drift trend
    const driftTrend = context.driftHistory ? calculateDriftTrend(context.driftHistory) : 0;
    const predictiveAdjustment = Math.max(-0.002, Math.min(0.002, driftTrend * 0.1));
    
    const finalRate = baseRate + predictiveAdjustment;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] Enhanced microCorrectDrift', {
        drift,
        baseRate,
        predictiveAdjustment,
        finalRate,
        deviceType: adaptiveThresholds.deviceType,
        networkQuality: adaptiveThresholds.networkQuality,
        jitter: context.jitter,
        audioLatency: context.audioLatency,
        rtt: context.rtt,
        correction: 'enhanced-micro',
        ...context
      });
    }
    
    if (typeof updateDebug === 'function') updateDebug('enhanced-micro', drift, { ...context, adaptiveThresholds });
    
    audio.playbackRate = finalRate;
    
    // Adaptive correction window based on network quality
    const correctionWindow = adaptiveThresholds.networkQuality === 'poor' ? 500 : 300;
    setTimeout(() => {
      audio.playbackRate = 1.0;
    }, correctionWindow);
  } else {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] microCorrectDrift skipped', {
        drift,
        microDriftMin,
        microDriftMax,
        deviceType: adaptiveThresholds.deviceType,
        networkQuality: adaptiveThresholds.networkQuality,
        jitter: context.jitter,
        audioLatency: context.audioLatency,
        rtt: context.rtt,
        correction: 'enhanced-micro-skip',
        ...context
      });
    }
    if (typeof updateDebug === 'function') updateDebug('enhanced-micro-skip', drift, { ...context, adaptiveThresholds });
    audio.playbackRate = 1.0;
  }
}

// Helper function to calculate drift trend
function calculateDriftTrend(driftHistory) {
  if (!driftHistory || driftHistory.length < 3) return 0;
  
  const recent = driftHistory.slice(-3);
  const trend = recent.reduce((sum, drift, i) => {
    return sum + (drift * (i + 1)); // Weight recent drifts more heavily
  }, 0) / 6; // Normalize by sum of weights
  
  return trend;
}

function maybeCorrectDrift(audio, expected, context = {}, updateDebug) {
  if (!audio) return;
  
  const drift = audio.currentTime - expected;
  
  // Calculate adaptive thresholds
  const adaptiveThresholds = calculateAdaptiveThresholds(
    context.rtt || 0, 
    context.jitter || 0, 
    context.audioLatency || 0
  );
  
  const { microDriftMin, microDriftMax, driftThreshold } = adaptiveThresholds;
  
  // Enhanced buffer ahead calculation with adaptive minimum
  let bufferAhead = 0;
  try {
    const buf = audio.buffered;
    for (let i = 0; i < buf.length; i++) {
      if (audio.currentTime >= buf.start(i) && audio.currentTime <= buf.end(i)) {
        bufferAhead = buf.end(i) - audio.currentTime;
        break;
      }
    }
  } catch (e) {}
  
  // Adaptive buffer threshold based on network quality
  const adaptiveBufferThreshold = adaptiveThresholds.networkQuality === 'poor' ? 1.0 : 0.5;
  
  if (bufferAhead < adaptiveBufferThreshold) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] Skipped: buffer ahead too low', { 
        bufferAhead, 
        adaptiveBufferThreshold,
        drift,
        networkQuality: adaptiveThresholds.networkQuality
      });
    }
    if (typeof updateDebug === 'function') updateDebug('buffer-skip', drift, { ...context, bufferAhead, adaptiveThresholds });
    return;
  }
  
  // Enhanced cooldown logic with adaptive timing
  const now = Date.now();
  const baseCooldown = 1200; // ms
  const adaptiveCooldown = baseCooldown * (adaptiveThresholds.networkQuality === 'poor' ? 1.5 : 1.0);
  
  if (lastCorrectionRef.current && now - lastCorrectionRef.current < adaptiveCooldown) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] Skipped: adaptive cooldown active', { 
        lastCorrection: lastCorrectionRef.current, 
        now,
        adaptiveCooldown,
        networkQuality: adaptiveThresholds.networkQuality
      });
    }
    if (typeof updateDebug === 'function') updateDebug('adaptive-cooldown-skip', drift, { ...context, bufferAhead, adaptiveThresholds });
    return;
  }
  
  // Enhanced correction logic with adaptive thresholds
  if (Math.abs(drift) > microDriftMin && Math.abs(drift) < microDriftMax) {
    microCorrectDrift(audio, drift, { ...context, driftHistory: window._audioDriftHistory }, updateDebug);
    lastCorrectionRef.current = now;
    return;
  }
  
  if (Math.abs(drift) >= microDriftMax) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] Enhanced hard seek', {
        drift,
        expected,
        current: audio.currentTime,
        deviceType: adaptiveThresholds.deviceType,
        networkQuality: adaptiveThresholds.networkQuality,
        jitter: context.jitter,
        audioLatency: context.audioLatency,
        rtt: context.rtt,
        correction: 'enhanced-seek',
        ...context
      });
    }
    if (typeof updateDebug === 'function') updateDebug('enhanced-seek', drift, { ...context, bufferAhead, adaptiveThresholds });
    
    // Enhanced seeking with gradual approach for large drifts
    if (Math.abs(drift) > 1.0) {
      // For very large drifts, seek gradually to avoid jarring jumps
      const targetTime = expected;
      const currentTime = audio.currentTime;
      const step = (targetTime - currentTime) / 3;
      
      setTimeout(() => {
        setCurrentTimeSafely(audio, currentTime + step, (val) => {
          audio.currentTime = val;
        });
      }, 50);
      
      setTimeout(() => {
        setCurrentTimeSafely(audio, currentTime + step * 2, (val) => {
          audio.currentTime = val;
        });
      }, 100);
      
      setTimeout(() => {
        setCurrentTimeSafely(audio, targetTime, (val) => {
          audio.currentTime = val;
        });
      }, 150);
    } else {
      // Direct seek for smaller drifts
      setCurrentTimeSafely(audio, expected, (val) => {
        audio.currentTime = val;
      });
    }
    
    audio.playbackRate = 1.0;
    lastCorrectionRef.current = now;
  } else {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] No correction needed', {
        drift,
        expected,
        current: audio.currentTime,
        deviceType: adaptiveThresholds.deviceType,
        networkQuality: adaptiveThresholds.networkQuality,
        jitter: context.jitter,
        audioLatency: context.audioLatency,
        rtt: context.rtt,
        correction: 'none',
        ...context
      });
    }
    if (typeof updateDebug === 'function') updateDebug('none', drift, { ...context, bufferAhead, adaptiveThresholds });
  }
}
  // Add at the top of the component
  const eventDebounceRef = useRef({});
  function debounceEvent(type, fn, delay = 200) {
    if (eventDebounceRef.current[type]) clearTimeout(eventDebounceRef.current[type]);
    eventDebounceRef.current[type] = setTimeout(fn, delay);
  }

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

  // Jitter buffer: only correct drift if sustained for N checks
  const driftCountRef = useRef(0);

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
      const currentTime = audio.currentTime;
      setCurrentTime(currentTime);
      setDisplayedCurrentTime(currentTime);
      
      // Enhanced zero-lag/advance drift detection for followers
      if (!isController && isPlaying && socket && socket.sessionId) {
        const now = Date.now();
        
        // Quick drift check using last known sync state (more frequent for better responsiveness)
        if (lastSyncState.current && lastSyncState.current.timestamp && lastSyncState.current.lastUpdated) {
          const expectedTime = lastSyncState.current.timestamp + 
            (now - lastSyncState.current.lastUpdated) / 1000 - 
            (audioLatency || 0) + 
            (rtt ? rtt / 2000 : 0) + 
            smoothedOffset;
          
          const drift = Math.abs(currentTime - expectedTime);
          
          // Emergency drift handling (> 500ms) - immediate correction
          if (drift > EMERGENCY_DRIFT_THRESHOLD) {
            console.log('[TimeUpdate] Emergency drift detected:', { drift, expectedTime, current: currentTime });
            setSyncMode('emergency');
            setSyncStatus('Emergency correction');
            
            // Immediate hard seek
            setCurrentTimeSafely(audio, expectedTime, setCurrentTime);
            
            setSyncStatus('Emergency corrected');
            setTimeout(() => setSyncStatus('In Sync'), 1000);
            
            emitDriftReport(drift, expectedTime, currentTime, { type: 'timeupdate_emergency_drift' });
            consecutiveCorrections.current = 0;
            return;
          }
          
          // Critical drift handling (200-500ms) - immediate correction
          if (drift > CRITICAL_DRIFT_THRESHOLD) {
            console.log('[TimeUpdate] Critical drift detected:', { drift, expectedTime, current: currentTime });
            setSyncMode('aggressive');
            setSyncStatus('Critical correction');
            
            // Immediate correction
            setCurrentTimeSafely(audio, expectedTime, setCurrentTime);
            
            setSyncStatus('Critical corrected');
            setTimeout(() => setSyncStatus('In Sync'), 800);
            
            emitDriftReport(drift, expectedTime, currentTime, { type: 'timeupdate_critical_drift' });
            consecutiveCorrections.current++;
            return;
          }
          
          // Standard drift handling (100-200ms) - check every 500ms
          if (drift > DRIFT_THRESHOLD && now - lastTimeUpdateCheck.current >= 500) {
            lastTimeUpdateCheck.current = now;
            console.log('[TimeUpdate] Standard drift detected:', { drift, expectedTime, current: currentTime });
            setSyncMode('standard');
            setSyncStatus('Standard correction');
            
            // Use micro-correction for standard drifts
            maybeCorrectDrift(
              audio,
              expectedTime,
              { jitter, audioLatency, rtt, drift },
              (type, driftVal, ctx) => {
                setDriftCorrectionCount(c => c + 1);
                setLastCorrectionType(type);
                setDriftCorrectionHistory(h => [{ type, drift: driftVal, ctx, ts: Date.now() }, ...h.slice(0, 9)]);
              }
            );
            
            setSyncStatus('Standard corrected');
            setTimeout(() => setSyncStatus('In Sync'), 600);
            
            emitDriftReport(drift, expectedTime, currentTime, { type: 'timeupdate_standard_drift' });
            consecutiveCorrections.current++;
          }
          
          // Micro drift handling (20-100ms) - continuous micro-adjustments
          if (drift > MICRO_DRIFT_THRESHOLD && drift <= DRIFT_THRESHOLD) {
            // Use playback rate adjustment for smooth micro-corrections
            const rateAdjustment = currentTime < expectedTime ? 1.001 : 0.999;
            audio.playbackRate = rateAdjustment;
            
            setTimeout(() => {
              audio.playbackRate = 1.0;
            }, 50);
            
            setSyncStatus('Micro-corrected');
            setTimeout(() => setSyncStatus('In sync'), 200);
          }
          
          // Perfect sync detection
          if (drift <= ZERO_DRIFT_TOLERANCE) {
            setSyncMode('standard');
            setSyncQuality('excellent');
            setSyncStatus('Perfect sync');
            consecutiveCorrections.current = 0;
          }
          
          // Update sync health score
          const updateSyncHealthScore = (drift) => {
            const currentScore = syncHealthScore.current;
            let newScore = currentScore;
            
            if (drift <= ZERO_DRIFT_TOLERANCE) {
              newScore = Math.min(100, currentScore + 2);
            } else if (drift <= CRITICAL_DRIFT_THRESHOLD) {
              newScore = Math.max(0, currentScore - 1);
            } else {
              newScore = Math.max(0, currentScore - 5);
            }
            
            syncHealthScore.current = newScore;
            
            // Update sync quality based on health score
            if (newScore >= 90) setSyncQuality('excellent');
            else if (newScore >= 70) setSyncQuality('good');
            else if (newScore >= 50) setSyncQuality('fair');
            else setSyncQuality('poor');
          };
          
          updateSyncHealthScore(drift);
        }
        
        // Fallback: request sync state if we don't have recent sync data (every 2 seconds)
        if (now - lastTimeUpdateCheck.current >= 2000) {
          lastTimeUpdateCheck.current = now;
          
          socket.emit('sync_request', { sessionId: socket.sessionId, reason: 'timeupdate_fallback' }, (state) => {
            if (state && state.timestamp && state.lastUpdated) {
              const newExpected = state.timestamp + 
                (Date.now() - state.lastUpdated) / 1000 - 
                (audioLatency || 0) + 
                (rtt ? rtt / 2000 : 0) + 
                smoothedOffset;
              
              const newDrift = Math.abs(currentTime - newExpected);
              if (newDrift > CRITICAL_DRIFT_THRESHOLD) {
                console.log('[TimeUpdate] Fallback drift correction:', { newDrift, newExpected, current: currentTime });
                setCurrentTimeSafely(audio, newExpected, setCurrentTime);
                setSyncStatus('Fallback corrected');
                setTimeout(() => setSyncStatus('In Sync'), 800);
              }
            }
          });
        }
      }
      
      // Update buffered ahead
      let ahead = 0;
      try {
        const buf = audio.buffered;
        for (let i = 0; i < buf.length; i++) {
          if (currentTime >= buf.start(i) && currentTime <= buf.end(i)) {
            ahead = buf.end(i) - currentTime;
            break;
          }
        }
      } catch (e) {}
      setBufferedAhead(ahead);
    };
    const setDur = () => setDuration(audio.duration || 0);
    const handlePlaying = () => {
      if (playRequestedAt.current) {
        const latency = (Date.now() - playRequestedAt.current) / 1000;
        setAudioLatency(latency);
        playRequestedAt.current = null;
      }
      setIsBuffering(false);
    };
    const handleWaiting = () => {
      setIsBuffering(true);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Buffer] Audio waiting event: likely buffer underrun');
      }
    };
    const handleStalled = () => {
      setIsBuffering(true);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Buffer] Audio stalled event: network issue or buffer underrun');
      }
    };
    const handleCanPlayThrough = () => {
      setIsBuffering(false);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Buffer] Audio canplaythrough: buffer refilled');
      }
    };

    audio.addEventListener('timeupdate', update);
    audio.addEventListener('durationchange', setDur);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('canplaythrough', handleCanPlayThrough);

    return () => {
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('durationchange', setDur);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
    };
  }, [audioUrl]);

  // Ensure proper audio state when role changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    // If we're not the controller and audio is playing but shouldn't be, pause it
    if (!isController && !isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [isController, isPlaying]);

  // Enhanced Socket event listeners with improved logging, error handling, and drift analytics
  useEffect(() => {
    if (!socket) return;

    let syncTimeout = null;
    let resyncTimeout = null;

    // Helper: show sync status for a limited time, then revert to "In Sync"
    const showSyncStatus = (status, duration = 1200) => {
      setSyncStatus(status);
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => setSyncStatus('In Sync'), duration);
    };

    // Enhanced drift report with ML context
    const emitDriftReport = (drift, expected, current, extra = {}) => {
      if (socket && socket.emit && socket.sessionId && typeof drift === 'number') {
        const deviceType = detectDeviceType();
        const networkQuality = assessNetworkQuality(rtt || 0, jitter || 0);
        
        socket.emit('drift_report', {
          sessionId: socket.sessionId,
          drift,
          expected,
          current,
          clientId,
          timestamp: Date.now(),
          deviceType,
          networkQuality,
          rtt,
          jitter,
          audioLatency: measuredAudioLatency,
          networkLatency: propNetworkLatency,
          adaptiveThresholds,
          ...extra,
        });
      }
    };

    // Enhanced sync state handler
    const handleSyncState = ({
      isPlaying,
      timestamp,
      lastUpdated,
      controllerId: ctrlId,
      trackId,
      meta,
      serverTime,
      syncSeq // Add syncSeq
    }) => {
      // Only apply if syncSeq is newer
      if (typeof syncSeq === 'number' && syncSeq <= lastSyncSeq.current) {
        console.warn('SYNC_STATE: Ignoring stale sync_state', { syncSeq, lastSyncSeq: lastSyncSeq.current });
        return;
      }
      if (typeof syncSeq === 'number') lastSyncSeq.current = syncSeq;
      // Defensive: check for valid timestamp and lastUpdated
      if (
        typeof timestamp !== 'number' ||
        typeof lastUpdated !== 'number' ||
        !isFinite(timestamp) ||
        !isFinite(lastUpdated)
      ) {
        console.warn('SYNC_STATE: invalid state received', { isPlaying, timestamp, lastUpdated, ctrlId, trackId, meta });
        showSyncStatus('Sync failed');
        return;
      }
      const audio = audioRef.current;
      if (!audio) {
        console.warn('SYNC_STATE: audio element not available');
        return;
      }
      // Use serverTime if present, else fallback
      let now = null;
      if (typeof serverTime === 'number' && isFinite(serverTime)) {
        now = serverTime;
      } else {
        now = getNow(getServerTime);
        console.warn('SYNC_STATE: serverTime missing, using getNow(getServerTime)', { now });
      }
      // Compensate for measured audio latency, test latency, and network latency
      const outputLatency = Math.min(
        audioLatency || Infinity,
        testLatency || Infinity
      );
      const networkComp = networkLatency ? networkLatency / 2 : 0;
      const rttComp = rtt ? rtt / 2000 : 0; // ms to s, one-way
      const expected = timestamp
        + (now - lastUpdated) / 1000
        - (isFinite(outputLatency) ? outputLatency : 0)
        - networkComp
        + rttComp
        + smoothedOffset;
      if (!isFiniteNumber(expected)) {
        console.warn('SYNC_STATE: expected is not finite', { expected, timestamp, lastUpdated, now });
        showSyncStatus('Sync failed');
        return;
      }
      const drift = Math.abs(audio.currentTime - expected);

      // Store last sync state for proactive drift detection
      lastSyncState.current = { timestamp, lastUpdated, isPlaying };

      // Enhanced: keep drift history for analytics (last 20 drifts with correction status)
      if (!window._audioDriftHistory) window._audioDriftHistory = [];
      const driftEntry = {
        drift,
        current: audio.currentTime,
        expected,
        timestamp: Date.now(),
        isPlaying,
        ctrlId,
        trackId,
        corrected: false, // Will be set to true if correction is applied
        threshold: adaptiveThreshold,
        deviceType: adaptiveThresholds.deviceType,
        networkQuality: adaptiveThresholds.networkQuality
      };
      window._audioDriftHistory.push(driftEntry);
      if (window._audioDriftHistory.length > 20) window._audioDriftHistory.shift();

      // Enhanced: immediate sync for large drifts, progressive for smaller ones
      if (drift > 1.0) {
        // Large drift: immediate hard seek
        console.log('[SYNC_STATE] Large drift detected, immediate sync:', { drift, expected, current: audio.currentTime });
        showSyncStatus('Large drift detected', 1000);
        
        // Immediate hard seek
        setCurrentTimeSafely(audio, expected, setCurrentTime);
        
        // Sync play state
        if (isPlaying && audio.paused) {
          audio.play().catch(e => console.warn('Failed to play after large drift correction:', e));
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
        
        setSyncStatus('Re-synced');
        setTimeout(() => setSyncStatus('In Sync'), 1000);
        
        emitDriftReport(drift, expected, audio.currentTime, { type: 'large_drift_immediate', ctrlId, trackId, meta });
        driftCountRef.current = 0;
      } else if (drift > adaptiveThreshold) {
        // Moderate drift: use correction logic
        driftCountRef.current += 1;
        if (driftCountRef.current >= 2) { // Reduced from DRIFT_JITTER_BUFFER (6) to 2
          showSyncStatus('Drifted', 1000);
          maybeCorrectDrift(
            audio,
            expected,
            { jitter, audioLatency, rtt, drift, adaptiveThresholds },
            (type, driftVal, ctx) => {
              setDriftCorrectionCount(c => c + 1);
              setLastCorrectionType(type);
              setDriftCorrectionHistory(h => [{ type, drift: driftVal, ctx, ts: Date.now() }, ...h.slice(0, 9)]);
              
              // Mark the most recent drift entry as corrected
              if (window._audioDriftHistory && window._audioDriftHistory.length > 0) {
                const lastEntry = window._audioDriftHistory[window._audioDriftHistory.length - 1];
                lastEntry.corrected = true;
                lastEntry.correctionType = type;
              }
            }
          );
          setSyncStatus('Re-syncing...');
          if (resyncTimeout) clearTimeout(resyncTimeout);
          resyncTimeout = setTimeout(() => setSyncStatus('In Sync'), 800);

          emitDriftReport(drift, expected, audio.currentTime, { type: 'moderate_drift_corrected', ctrlId, trackId, meta });
          driftCountRef.current = 0;
        }
      } else {
        driftCountRef.current = 0;
        setSyncStatus('In Sync');
      }

      setIsPlaying(isPlaying);

      // Only play/pause if state differs
      if (isPlaying && audio.paused) {
        audio.play().catch(e => {
          console.warn('SYNC_STATE: failed to play audio', e);
        });
      } else if (!isPlaying && !audio.paused) {
        audio.pause();
        // Do not seek to correct drift if paused
      }
      setLastSync(Date.now());
      setSyncReady(true);
    };

    // ML-based sync optimization handler
    const handleSyncOptimization = (optimization) => {
      if (!optimization || !optimization.sessionId) return;
      
      const { optimalIntervals, driftPatterns, mlInsights } = optimization;
      
      // Store optimization data for local use
      if (!window._mlSyncOptimization) {
        window._mlSyncOptimization = {};
      }
      window._mlSyncOptimization[optimization.sessionId] = optimization;
      
      // Log ML insights in development
      if (process.env.NODE_ENV === 'development') {
        console.log('[ML] Sync optimization received:', {
          sessionId: optimization.sessionId,
          optimalIntervals,
          driftPatterns,
          mlInsights
        });
      }
      
      // Update local sync behavior based on ML insights
      if (mlInsights && mlInsights.avgConfidence > 0.7) {
        // High confidence predictions - adjust local thresholds
        const clientInterval = optimalIntervals[clientId];
        if (clientInterval && clientInterval < BASE_SYNC_INTERVAL) {
          // More aggressive sync for this client
          setAdaptiveThresholds(prev => ({
            ...prev,
            driftThreshold: prev.driftThreshold * 0.8,
            microDriftMax: prev.microDriftMax * 0.8
          }));
        }
      }
    };

    socket.on('sync_state', handleSyncState);
    socket.on('sync_optimization', handleSyncOptimization);

    return () => {
      socket.off('sync_state', handleSyncState);
      socket.off('sync_optimization', handleSyncOptimization);
      if (syncTimeout) clearTimeout(syncTimeout);
      if (resyncTimeout) clearTimeout(resyncTimeout);
    };
  }, [socket, audioLatency, getServerTime, clientId, rtt, smoothedOffset, testLatency, networkLatency]);

  // --- Enhanced Adaptive Drift Threshold ---
  const adaptiveThresholds = useMemo(() => 
    calculateAdaptiveThresholds(rtt || 0, jitter || 0, audioLatency || 0), 
    [rtt, jitter, audioLatency]
  );
  const adaptiveThreshold = adaptiveThresholds.driftThreshold;

  // Enhanced zero-lag/advance continuous sync system (for followers)
  useEffect(() => {
    if (!socket || isController) return;

    let lastCorrection = 0;
    let consecutiveDrifts = 0;
    let syncAttempts = 0;

    // Continuous sync interval for zero-lag protection
    const startContinuousSync = () => {
      if (continuousSyncInterval.current) clearInterval(continuousSyncInterval.current);
      
      continuousSyncInterval.current = setInterval(() => {
        if (!socket.sessionId || !audioRef.current) return;
        
        socket.emit('sync_request', { sessionId: socket.sessionId, reason: 'continuous_sync' }, (state) => {
          if (!state || typeof state.timestamp !== 'number' || typeof state.lastUpdated !== 'number') return;
          
          const audio = audioRef.current;
          if (!audio) return;

          const now = getNow(getServerTime);
          const rttComp = rtt ? rtt / 2000 : 0;
          const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
          
          if (!isFiniteNumber(expected)) return;

          const syncedNow = getNow(getServerTime);
          const expectedSynced = state.timestamp + (syncedNow - state.lastUpdated) / 1000 + rttComp + smoothedOffset;
          const drift = Math.abs(audio.currentTime - expectedSynced);
          const nowMs = Date.now();

          // Update drift history for trend analysis
          enhancedDriftHistory.current.push({ drift, timestamp: nowMs, expected: expectedSynced, current: audio.currentTime });
          if (enhancedDriftHistory.current.length > 50) enhancedDriftHistory.current.shift();

          // Emergency drift handling (> 500ms)
          if (drift > EMERGENCY_DRIFT_THRESHOLD) {
            console.log('[ContinuousSync] Emergency drift detected:', { drift, expectedSynced, current: audio.currentTime });
            setSyncMode('emergency');
            setSyncStatus('Emergency sync');
            
            // Immediate hard seek
            setCurrentTimeSafely(audio, expectedSynced, setCurrentTime);
            
            // Force play state sync
            if (state.isPlaying && audio.paused) {
              audio.play().catch(e => console.warn('Emergency play failed:', e));
            } else if (!state.isPlaying && !audio.paused) {
              audio.pause();
            }
            
            setSyncStatus('Emergency corrected');
            setTimeout(() => setSyncStatus('In Sync'), 1000);
            
            emitDriftReport(drift, expectedSynced, audio.currentTime, { type: 'emergency_drift' });
            consecutiveCorrections.current = 0;
            lastCorrection = nowMs;
            return;
          }

          // Critical drift handling (200-500ms)
          if (drift > CRITICAL_DRIFT_THRESHOLD) {
            console.log('[ContinuousSync] Critical drift detected:', { drift, expectedSynced, current: audio.currentTime });
            setSyncMode('aggressive');
            setSyncStatus('Critical sync');
            
            // Immediate correction with micro-adjustments
            setCurrentTimeSafely(audio, expectedSynced, setCurrentTime);
            
            // Sync play state
            if (state.isPlaying && audio.paused) {
              audio.play().catch(e => console.warn('Critical play failed:', e));
            } else if (!state.isPlaying && !audio.paused) {
              audio.pause();
            }
            
            setSyncStatus('Critical corrected');
            setTimeout(() => setSyncStatus('In Sync'), 800);
            
            emitDriftReport(drift, expectedSynced, audio.currentTime, { type: 'critical_drift' });
            consecutiveCorrections.current++;
            lastCorrection = nowMs;
            return;
          }

          // Standard drift handling (100-200ms)
          if (drift > DRIFT_THRESHOLD) {
            consecutiveDrifts += 1;
            
            if (consecutiveDrifts >= 2) {
              console.log('[ContinuousSync] Standard drift detected:', { drift, expectedSynced, current: audio.currentTime });
              setSyncMode('standard');
              setSyncStatus('Standard sync');
              
              maybeCorrectDrift(
                audio,
                expectedSynced,
                { jitter, audioLatency, rtt, drift },
                (type, driftVal, ctx) => {
                  setDriftCorrectionCount(c => c + 1);
                  setLastCorrectionType(type);
                  setDriftCorrectionHistory(h => [{ type, drift: driftVal, ctx, ts: Date.now() }, ...h.slice(0, 9)]);
                }
              );
              
              setSyncStatus('Standard corrected');
              setTimeout(() => setSyncStatus('In Sync'), 600);
              
              emitDriftReport(drift, expectedSynced, audio.currentTime, { type: 'standard_drift' });
              consecutiveCorrections.current++;
              lastCorrection = nowMs;
              consecutiveDrifts = 0;
            }
          } else {
            // Perfect sync or minor drift
            consecutiveDrifts = 0;
            if (drift <= ZERO_DRIFT_TOLERANCE) {
              setSyncMode('standard');
              setSyncQuality('excellent');
              setSyncStatus('Perfect sync');
              consecutiveCorrections.current = 0;
            } else {
              setSyncQuality('good');
              setSyncStatus('In sync');
            }
          }

          // Update sync health score
          updateSyncHealthScore(drift);
          
          // Force resync if too many consecutive corrections
          if (consecutiveCorrections.current >= MAX_CONSECUTIVE_CORRECTIONS) {
            console.log('[ContinuousSync] Too many corrections, forcing resync');
            handleResync();
            consecutiveCorrections.current = 0;
          }
        });
      }, CONTINUOUS_SYNC_INTERVAL);
    };

    // Proactive sync for early drift detection
    const startProactiveSync = () => {
      if (proactiveSyncInterval.current) clearInterval(proactiveSyncInterval.current);
      
      proactiveSyncInterval.current = setInterval(() => {
        if (!socket.sessionId || !audioRef.current || !isPlaying) return;
        
        const audio = audioRef.current;
        const currentTime = audio.currentTime;
        
        // Quick drift check using last known sync state
        if (lastSyncState.current && lastSyncState.current.timestamp && lastSyncState.current.lastUpdated) {
          const now = Date.now();
          const expectedTime = lastSyncState.current.timestamp + 
            (now - lastSyncState.current.lastUpdated) / 1000 - 
            (audioLatency || 0) + 
            (rtt ? rtt / 2000 : 0) + 
            smoothedOffset;
          
          const drift = Math.abs(currentTime - expectedTime);
          
          // Proactive correction for small drifts
          if (drift > MICRO_DRIFT_THRESHOLD && drift < DRIFT_THRESHOLD) {
            console.log('[ProactiveSync] Micro drift detected, correcting:', { drift, expectedTime, current: currentTime });
            
            // Use playback rate adjustment for micro corrections
            const rateAdjustment = drift > 0 ? 1.001 : 0.999;
            audio.playbackRate = rateAdjustment;
            
            setTimeout(() => {
              audio.playbackRate = 1.0;
            }, 100);
            
            setSyncStatus('Micro-corrected');
            setTimeout(() => setSyncStatus('In sync'), 300);
          }
        }
      }, PROACTIVE_SYNC_INTERVAL);
    };

    // Helper function to update sync health score
    const updateSyncHealthScore = (drift) => {
      const currentScore = syncHealthScore.current;
      let newScore = currentScore;
      
      if (drift <= ZERO_DRIFT_TOLERANCE) {
        newScore = Math.min(100, currentScore + 2);
      } else if (drift <= CRITICAL_DRIFT_THRESHOLD) {
        newScore = Math.max(0, currentScore - 1);
      } else {
        newScore = Math.max(0, currentScore - 5);
      }
      
      syncHealthScore.current = newScore;
      
      // Update sync quality based on health score
      if (newScore >= 90) setSyncQuality('excellent');
      else if (newScore >= 70) setSyncQuality('good');
      else if (newScore >= 50) setSyncQuality('fair');
      else setSyncQuality('poor');
    };

    // Start sync systems
    startContinuousSync();
    startProactiveSync();

    return () => {
      if (continuousSyncInterval.current) clearInterval(continuousSyncInterval.current);
      if (proactiveSyncInterval.current) clearInterval(proactiveSyncInterval.current);
    };
  }, [socket, isController, getServerTime, audioLatency, clientId, rtt, smoothedOffset, adaptiveThreshold, isPlaying]);

  // Enhanced: On mount, immediately request sync state on join, with improved error handling, logging, and edge case resilience
  useEffect(() => {
    if (!socket || !audioRef.current || !audioUrl) return;
    if (!socket.sessionId) return;

    // Defensive: wrap in try/catch for callback
    socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
      try {
        const audio = audioRef.current;
        if (!audio) {
          console.warn('Audio element not available on sync_request');
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
          console.warn('No valid sync state received, pausing audio and resetting to beginning', { state });
          audio.pause();
          setCurrentTimeSafely(audio, 0, setCurrentTime);
          setIsPlaying(false);
          setLastSync(Date.now());
          return;
        }

        // Defensive: check for negative/NaN/absurd timestamps
        if (state.timestamp < 0 || state.lastUpdated < 0) {
          console.warn('Sync state has negative timestamp(s)', { state });
          audio.pause();
          setCurrentTimeSafely(audio, 0, setCurrentTime);
          setIsPlaying(false);
          setLastSync(Date.now());
          return;
        }

        const now = getNow(getServerTime);
        // Compensate for measured audio latency, test latency, and network latency
        const outputLatency = Math.min(
          audioLatency || Infinity,
          testLatency || Infinity
        );
        const networkComp = networkLatency ? networkLatency / 2 : 0;
        const rttComp = rtt ? rtt / 2000 : 0; // ms to s, one-way
        const expected = state.timestamp + (now - state.lastUpdated) / 1000 - (isFinite(outputLatency) ? outputLatency : 0) - networkComp + rttComp + smoothedOffset;
        if (!isFiniteNumber(expected) || expected < 0) {
          console.warn('Invalid expected time, pausing audio', { expected, state });
          audio.pause();
          setIsPlaying(false);
          setLastSync(Date.now());
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

        console.log('Syncing audio to', {
          expectedSynced,
          safeExpected,
          isPlaying: state.isPlaying,
          duration: audio.duration,
          src: audio.currentSrc,
        });

        setCurrentTimeSafely(audio, safeExpected, setCurrentTime);
        setIsPlaying(state.isPlaying);

        if (state.isPlaying) {
          playRequestedAt.current = Date.now();
          // Defensive: try/catch for play() (may throw in some browsers)
          audio.play().catch((err) => {
            console.warn('audio.play() failed on sync_request', err);
          });
        } else {
          // Ensure audio is definitely paused and reset to the expected time
          audio.pause();
          setCurrentTimeSafely(audio, safeExpected, setCurrentTime);
        }
        setLastSync(Date.now());
      } catch (err) {
      }
    });
  }, [socket, getServerTime, audioLatency, rtt, smoothedOffset, testLatency, networkLatency, audioUrl]);

  // Enhanced: Emit play/pause/seek events (controller only) with improved logging, error handling, and latency compensation
  const emitPlay = () => {
    debounceEvent('play', () => {
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
        try {
          socket.emit('play', payload);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.error('[AudioPlayer][emitPlay] Failed to emit play event', err, payload);
          }
        }
      }
    });
  };

  const emitPause = () => {
    debounceEvent('pause', () => {
      if (isController && socket) {
        const audio = audioRef.current;
        const payload = {
          sessionId: socket.sessionId,
          timestamp: audio ? audio.currentTime : 0,
          clientId,
          emittedAt: getNow(getServerTime),
        };
        try {
          socket.emit('pause', payload);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.error('[AudioPlayer][emitPause] Failed to emit pause event', err, payload);
          }
        }
      }
    });
  };

  const emitSeek = (time) => {
    debounceEvent('seek', () => {
      if (isController && socket) {
        const payload = {
          sessionId: socket.sessionId,
          timestamp: time,
          clientId,
          emittedAt: getNow(getServerTime),
        };
        try {
          socket.emit('seek', payload);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.error('[AudioPlayer][emitSeek] Failed to emit seek event', err, payload);
          }
        }
      }
    });
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
    playRequestedAt.current = Date.now();
    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        await playPromise;
      }
      setIsPlaying(true);
      emitPlay();
    } catch (err) {
      // Suppress AbortError (play() interrupted by pause())
      if (err && err.name === 'AbortError') return;
      setIsPlaying(false);
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('[AudioPlayer][handlePlay] Failed to play audio', err);
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
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('[AudioPlayer][handlePause] Failed to pause audio', err);
      }
    }
  };

  // --- Add: Debounced Seek State ---
  const seekTimeoutRef = useRef(null);
  const debouncedSetCurrentTime = useCallback((time) => {
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      setCurrentTime(time);
    }, 80); // 80ms debounce for rapid seeks
  }, []);

  // --- Update handleSeek to use debouncedSetCurrentTime ---
  const handleSeek = (e) => {
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
    setIsSeeking(true);
    const audio = audioRef.current;
    if (!audio) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[AudioPlayer][handleSeek] Audio element not available');
      }
      setIsSeeking(false);
      return;
    }
    // Instantly update audio and UI state for perfect sync
    audio.currentTime = time;
    setCurrentTime(time);
    setDisplayedCurrentTime(time);
    setCurrentTimeSafely(audio, time, (val) => {}); // still use safe setter for edge cases
    emitSeek(time);
    // --- Add: End-of-Track Handling ---
    if (duration && Math.abs(time - duration) < 0.1) {
      // If seeking to end, auto-pause
      audio.pause();
      setIsPlaying(false);
    }
    setTimeout(() => setIsSeeking(false), 200);
  };

  // Enhanced Manual re-sync with improved logging, error handling, user feedback, and analytics
  const handleResync = async () => {
    const now = Date.now();
    if (resyncInProgress) {
      setSyncStatus('Resync already in progress.');
      setTimeout(() => setSyncStatus('In Sync'), 1500);
      return;
    }
    if (now - lastResyncTime < RESYNC_COOLDOWN_MS) {
      const remainingCooldown = Math.ceil((RESYNC_COOLDOWN_MS - (now - lastResyncTime)) / 1000);
      setSyncStatus(`Please wait ${remainingCooldown}s before resyncing again.`);
      setTimeout(() => setSyncStatus('In Sync'), 1500);
      return;
    }
    if (!socket) {
      console.warn('[AudioPlayer][handleResync] No socket available');
      setSyncStatus('Sync failed: No socket');
      setTimeout(() => setSyncStatus('In Sync'), 1200);
      updateResyncHistory('failed', 0, 'No socket available', 0);
      return;
    }
    setResyncInProgress(true);
    setLastResyncTime(now);
    setSyncStatus('Syncing...');
    let ntpStart = Date.now();
    let ntpEnd = ntpStart;
    let ntpSuccess = false;
    // --- Use NTP batch sync for manual resync if available ---
    if (typeof forceNtpBatchSync === 'function') {
      try {
        const result = forceNtpBatchSync();
        if (result && typeof result.then === 'function') {
          await result;
        }
        ntpEnd = Date.now();
        ntpSuccess = true;
        setSyncStatus('NTP synced. Fetching state...');
      } catch (e) {
        setSyncStatus('NTP sync failed.');
        setTimeout(() => setSyncStatus('In Sync'), 1500);
        setResyncInProgress(false);
        updateResyncHistory('failed', 0, 'NTP batch sync failed', Date.now() - ntpStart);
        return;
      }
    } else {
      setSyncStatus('NTP batch syncing unavailable. Proceeding with basic sync');
    }
    // --- Immediately fetch latest sync state from server ---
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      setSyncStatus('Audio not ready');
      setTimeout(() => setSyncStatus('In Sync'), 1200);
      setResyncInProgress(false);
      updateResyncHistory('failed', 0, 'Audio not ready', Date.now() - ntpStart);
      return;
    }
    let syncStateStart = Date.now();
    socket.emit('sync_request', { sessionId: socket.sessionId, reason: 'manual_resync' }, (state) => {
      let syncStateEnd = Date.now();
      try {
        if (
          !state ||
          typeof state.timestamp !== 'number' ||
          typeof state.lastUpdated !== 'number' ||
          !isFinite(state.timestamp) ||
          !isFinite(state.lastUpdated)
        ) {
          setSyncStatus('Sync failed: Invalid state');
          setTimeout(() => setSyncStatus('In Sync'), 1500);
          setResyncInProgress(false);
          updateResyncHistory('failed', 0, 'Invalid sync state', syncStateEnd - syncStateStart);
          return;
        }
        // Defensive: check for negative/NaN/absurd timestamps
        if (state.timestamp < 0 || state.lastUpdated < 0) {
          setSyncStatus('Sync failed: Bad timestamp');
          setTimeout(() => setSyncStatus('In Sync'), 1500);
          setResyncInProgress(false);
          updateResyncHistory('failed', 0, 'Negative timestamp', syncStateEnd - syncStateStart);
          return;
        }
        // Calculate the most accurate expected playback position
        const now = getNow(getServerTime);
        const outputLatency = Math.min(
          audioLatency || Infinity,
          testLatency || Infinity
        );
        const networkComp = networkLatency ? networkLatency / 2 : 0;
        const rttComp = rtt ? rtt / 2000 : 0; // ms to s, one-way
        const expected = state.timestamp + (now - state.lastUpdated) / 1000 - (isFinite(outputLatency) ? outputLatency : 0) - networkComp + rttComp + smoothedOffset;
        if (!isFiniteNumber(expected) || expected < 0) {
          setSyncStatus('Sync failed: Bad expected time');
          setTimeout(() => setSyncStatus('In Sync'), 1500);
          setResyncInProgress(false);
          updateResyncHistory('failed', 0, 'Invalid expected time', syncStateEnd - syncStateStart);
          return;
        }
        // Clamp expected to [0, duration] if possible
        let safeExpected = expected;
        if (audio.duration && isFinite(audio.duration)) {
          safeExpected = Math.max(0, Math.min(expected, audio.duration));
        } else {
          safeExpected = Math.max(0, expected);
        }
        // Log drift before correction
        const driftBefore = Math.abs(audio.currentTime - safeExpected);
        // Seek audio element
        setCurrentTimeSafely(audio, safeExpected, setCurrentTime);
        // Update play/pause state
        setIsPlaying(state.isPlaying);
        if (state.isPlaying) {
          playRequestedAt.current = Date.now();
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
        setLastSync(Date.now());
        // Log drift after correction
        setTimeout(() => {
          const driftAfter = Math.abs(audio.currentTime - safeExpected);
          setSyncStatus('Re-synced!');
          setTimeout(() => setSyncStatus('In Sync'), 1200);
          setResyncInProgress(false);
          updateResyncHistory('success', driftAfter, 'Manual resync complete', Date.now() - now);
          // Analytics: log drift before/after
          if (process.env.NODE_ENV === 'production') {
            fetch('/log/drift', {
              method: 'POST',
              body: JSON.stringify({
                clientId,
                driftBefore,
                driftAfter,
                correctionType: 'manual_resync',
                timestamp: Date.now(),
                ntpDuration: ntpEnd - ntpStart,
                syncStateDuration: syncStateEnd - syncStateStart
              }),
              headers: { 'Content-Type': 'application/json' }
            }).catch(() => {});
          }
        }, 350);
      } catch (err) {
        setSyncStatus('Sync failed.');
        setTimeout(() => setSyncStatus('In Sync'), 1500);
        setResyncInProgress(false);
        updateResyncHistory('failed', 0, 'Exception in resync', Date.now() - syncStateStart);
      }
    });
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

  /**
   * Formats a time value in seconds to a human-readable string.
   * - Handles negative, NaN, and very large values gracefully.
   * - Supports hours for long durations (e.g., 1:23:45).
   * - Pads minutes and seconds as needed.
   * - Handles values > 24h with days.
   * @param {number} t - Time in seconds.
   * @returns {string} - Formatted time string.
   */
  const formatTime = (t) => {
    if (typeof t !== 'number' || isNaN(t) || t < 0) return '0:00';
    let totalSeconds = Math.floor(t);

    // Handle days for very long durations
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}:${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // --- Automatic device latency estimation using AudioContext.baseLatency ---
  useEffect(() => {
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.baseLatency && ctx.baseLatency > 0 && ctx.baseLatency < 1) {
        setAudioLatency(ctx.baseLatency);
        // Log for analytics in production
        if (process.env.NODE_ENV === 'production') {
          fetch('/log/latency', {
            method: 'POST',
            body: JSON.stringify({
              clientId,
              baseLatency: ctx.baseLatency,
              timestamp: Date.now()
            }),
            headers: { 'Content-Type': 'application/json' }
          }).catch(() => {});
        }
      }
    } catch (e) {
      // Ignore, fallback to default
    } finally {
      if (ctx && typeof ctx.close === 'function') ctx.close();
    }
  }, []);

  // Animation ref to prevent multiple animation loops
  const animationRef = useRef(null);
  const isAnimatingRef = useRef(false);

  // Smoothly animate displayedCurrentTime toward audio.currentTime
  useEffect(() => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    setDisplayedCurrentTime(0); // Immediately reset timer visually on track change
    isAnimatingRef.current = true;
    
    const animate = () => {
      if (!isAnimatingRef.current) return;
      
      const audio = audioRef.current;
      if (!audio) {
        isAnimatingRef.current = false;
        return;
      }
      
      const actual = audio.currentTime;
      setDisplayedCurrentTime(prev => {
        // If the difference is extremely tiny, snap to actual
        if (Math.abs(prev - actual) < 0.005) return actual;
        // Ultra-smooth lerp (smaller factor)
        return prev + (actual - prev) * 0.10;
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      isAnimatingRef.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [audioUrl, currentTrack?.url]);

  // Reset playback position to start when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && currentTrack && currentTrack.url) {
      setCurrentTimeSafely(audio, 0, setCurrentTime);
      setDisplayedCurrentTime(0);
    } else {
      setCurrentTime(0);
      setDisplayedCurrentTime(0);
    }
  }, [currentTrack?.url]);

  // --- Enhanced Logging for All Drift Corrections ---
  function logDriftCorrection(type, drift, context = {}) {
    if (process.env.NODE_ENV === 'production') {
      fetch('/log/drift', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          drift,
          correctionType: type,
          context,
          timestamp: Date.now()
        }),
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {});
    }
  }

  // --- Enhanced Proactive Sync Triggers (debounced, robust) ---
  useEffect(() => {
    let lastSyncTime = 0;
    const SYNC_DEBOUNCE_MS = 1200;
    function proactiveSync(reason = 'unknown') {
      const now = Date.now();
      if (now - lastSyncTime < SYNC_DEBOUNCE_MS) return;
      lastSyncTime = now;
      if (typeof socket?.triggerResync === 'function') {
        socket.triggerResync();
      }
      if (socket && socket.sessionId) {
        socket.emit('sync_request', { sessionId: socket.sessionId, reason }, () => {});
      }
      // Enhanced logging
      if (process.env.NODE_ENV === 'production') {
        fetch('/log/sync-trigger', {
          method: 'POST',
          body: JSON.stringify({
            clientId,
            reason,
            timestamp: now
          }),
          headers: { 'Content-Type': 'application/json' }
        }).catch(() => {});
      }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        proactiveSync('tab_visible');
      }
    }
    function handleWindowFocus() {
      proactiveSync('window_focus');
    }
    function handleOnline() {
      proactiveSync('network_online');
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);
    if (document.visibilityState === 'visible' && navigator.onLine) {
      setTimeout(() => proactiveSync('mount'), 200);
    }
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [socket, clientId]);

  // --- Sync Health Indicator ---
  let syncHealth = 'good';
  if (jitter > 0.2 || (typeof displayedCurrentTime === 'number' && typeof currentTime === 'number' && Math.abs(displayedCurrentTime - currentTime) > adaptiveThreshold)) {
    syncHealth = 'warning';
  }
  if (jitter > 0.5 || (typeof displayedCurrentTime === 'number' && typeof currentTime === 'number' && Math.abs(displayedCurrentTime - currentTime) > adaptiveThreshold * 2)) {
    syncHealth = 'bad';
  }

  // --- Enhanced Drift Correction History with Outlier Filtering ---
  const [driftHistory, setDriftHistory] = useState([]);
  const PERSISTENT_DRIFT_WINDOW = 10; // window of checks to consider for persistent drift (increased)
  const PERSISTENT_DRIFT_LIMIT = 5; // consecutive drift checks before auto-resync (increased)
  const AUTO_RESYNC_COOLDOWN = 6000; // ms, minimum time between auto-resyncs (reduced)
  const [autoResyncTriggered, setAutoResyncTriggered] = useState(false);
  const [lastAutoResyncTime, setLastAutoResyncTime] = useState(0);
  const persistentDriftCountRef = useRef(0);

  // Use a ref to track the last drift check to prevent excessive updates
  const lastDriftCheckRef = useRef(0);
  const DRIFT_CHECK_INTERVAL = 100; // ms, minimum time between drift checks

  useEffect(() => {
    const now = Date.now();
    if (now - lastDriftCheckRef.current < DRIFT_CHECK_INTERVAL) return;
    lastDriftCheckRef.current = now;
    
    if (typeof displayedCurrentTime !== 'number' || typeof currentTime !== 'number') return;
    const drift = Math.abs(displayedCurrentTime - currentTime);
    
    setDriftHistory(prev => {
      const newHistory = [...prev, drift].slice(-PERSISTENT_DRIFT_WINDOW);
      
      // Outlier filtering for persistent drift (using the new history)
      const med = median(newHistory);
      const deviation = mad(newHistory, med);
      const filteredDrifts = newHistory.filter(d => Math.abs(d - med) <= 2 * deviation);
      
      if (drift > adaptiveThreshold) {
        persistentDriftCountRef.current += 1;
        if (
          persistentDriftCountRef.current >= PERSISTENT_DRIFT_LIMIT &&
          !autoResyncTriggered &&
          now - lastAutoResyncTime > AUTO_RESYNC_COOLDOWN &&
          filteredDrifts.filter(d => d > adaptiveThreshold).length >= Math.floor(PERSISTENT_DRIFT_WINDOW * 0.7)
        ) {
          // Use setTimeout to avoid state updates during render
          setTimeout(() => {
            setSyncStatus('Auto-resyncing...');
            setAutoResyncTriggered(true);
            setLastAutoResyncTime(Date.now());
            if (typeof socket?.triggerResync === 'function') {
              socket.triggerResync();
            }
            // Enhanced logging for persistent drift
            if (process.env.NODE_ENV === 'production') {
              fetch('/log/drift', {
                method: 'POST',
                body: JSON.stringify({
                  clientId,
                  drift,
                  driftHistory: filteredDrifts.slice(),
                  type: 'persistent',
                  timestamp: Date.now(),
                  threshold: adaptiveThreshold,
                  autoResync: true
                }),
                headers: { 'Content-Type': 'application/json' }
              }).catch(() => {});
            }
            persistentDriftCountRef.current = 0;
          }, 0);
        }
      } else {
        persistentDriftCountRef.current = 0;
        if (autoResyncTriggered) {
          setTimeout(() => setAutoResyncTriggered(false), 0);
        }
      }
      
      return newHistory;
    });
  }, [displayedCurrentTime, currentTime, adaptiveThreshold, socket, clientId, autoResyncTriggered, lastAutoResyncTime]);

  // --- Debug panel for latency, offset, RTT, drift (dev only) ---
  const debugPanel = process.env.NODE_ENV !== 'production' ? (
    <div className="text-xs text-neutral-400 mt-2 p-2 bg-neutral-900/80 rounded-lg border border-neutral-800">
      <div>Audio Latency: {audioLatency ? (audioLatency * 1000).toFixed(1) : 'N/A'} ms</div>
      {typeof propTestLatency === 'number' && (
        <div>Test Sound: {(propTestLatency * 1000).toFixed(1)} ms</div>
      )}
      {typeof propNetworkLatency === 'number' && (
        <div>Network: {(propNetworkLatency * 1000).toFixed(1)} ms</div>
      )}
      <div>Time Offset: {typeof smoothedOffset === 'number' ? smoothedOffset.toFixed(1) : 'N/A'} ms</div>
      <div>RTT: {rtt ? rtt.toFixed(1) : 'N/A'} ms</div>
      <div>Jitter: {typeof jitter === 'number' ? jitter.toFixed(3) : 'N/A'} s</div>
      <div>Adaptive Drift Threshold: {adaptiveThreshold.toFixed(3)} s</div>
      <div>Sync Health: <span className={syncHealth === 'good' ? 'text-green-400' : syncHealth === 'warning' ? 'text-yellow-400' : 'text-red-400'}>{syncHealth}</span></div>
      <div>Last Drift: {typeof displayedCurrentTime === 'number' && typeof currentTime === 'number' ? (displayedCurrentTime - currentTime).toFixed(3) : 'N/A'} s</div>
      <div>Drift Corrections: {driftCorrectionCount}</div>
      <div>Last Correction Type: {lastCorrectionType}</div>
      <div>Correction History:</div>
      <ul className="max-h-24 overflow-y-auto text-xs">
        {driftCorrectionHistory.map((item, idx) => (
          <li key={item.ts + '-' + idx}>
            [{new Date(item.ts).toLocaleTimeString()}] {item.type} | drift: {item.drift?.toFixed(3)} | jitter: {item.ctx?.jitter?.toFixed(3)} | rtt: {item.ctx?.rtt?.toFixed(1)}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  // --- Add: Socket Disconnected Banner State ---
  const [socketDisconnected, setSocketDisconnected] = useState(false);
  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => setSocketDisconnected(false);
    const handleDisconnect = () => setSocketDisconnected(true);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (!isSocketConnected) setSocketDisconnected(true);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, isSocketConnected]);

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
        {socketDisconnected && (
          <div className="fixed top-0 left-0 w-full z-50 bg-red-700 text-white text-center py-2 font-bold animate-fade-in">
            Disconnected from server. Controls are disabled.
          </div>
        )}
        <div className={`${shouldAnimate ? 'animate-slide-up-from-bottom' : 'opacity-0 translate-y-full'}`}>
          <div className="bg-neutral-900/90 backdrop-blur-lg rounded-2xl shadow-2xl p-3 flex flex-col gap-2 border border-neutral-800">
          {/* Audio element (hidden) */}
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="auto"
              style={{ display: 'none' }}
              onLoadedMetadata={() => {
                const audio = audioRef.current;
                if (audio && !isController && !isPlaying) {
                  audio.pause();
                  setCurrentTime(0);
                }
              }}
            />
          )}
          {/* Top: Track info and sync status - Enhanced for Mobile */}
          <div className="flex items-center justify-between mb-1 px-1">
            {/* Left: SyncStatus and status text */}
            <div className="flex items-center gap-2 w-fit min-w-0" style={{ minHeight: 28, height: 28, maxWidth: '100%' }}>
              <SyncStatus 
                status={syncStatus} 
                mlInsights={window._mlSyncOptimization?.[socket?.sessionId]?.mlInsights}
                syncMode={syncMode}
                syncQuality={syncQuality}
                syncHealthScore={syncHealthScore.current}
              />
            </div>
            <button
              className={`text-[11px] font-mono rounded px-1.5 py-0.5 flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                ${resyncInProgress
                  ? 'bg-white-600 text-white border-blue-700 animate-pulse'
                  : smartResyncSuggestion
                    ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-700 animate-bounce'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700'}
              `}
              style={{ minHeight: 24, minWidth: 90, display: 'inline-flex', borderRadius: 6, height: '100%', alignItems: 'center', justifyContent: 'center' }}
              onClick={handleResync}
              disabled={disabled || !audioUrl || resyncInProgress || socketDisconnected}
              aria-label="Re-sync"
              title={
                resyncInProgress
                  ? 'Syncing with server...'
                  : smartResyncSuggestion
                    ? 'High drift detected! Recommended to sync now.'
                    : 'Re-sync audio with server'
              }
            >
              {resyncInProgress ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin mr-2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"></path>
                  </svg>
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                    <path d="M21 3v5h-5"></path>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                    <path d="M3 21v-5h5"></path>
                  </svg>
                  <span>{smartResyncSuggestion ? 'Re-sync*' : 'Re-sync'}</span>
                </>
              )}
            </button>
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
            {(loading || !syncReady) && (
              <div className="flex-1 flex items-center justify-center h-3">
                <LoadingSpinner size="xs" text="Loading..." />
              </div>
            )}
            {!loading && syncReady && (
              <input
                type="range"
                min={0}
                max={isFinite(duration) ? duration : 0}
                step={0.01}
                value={isFinite(displayedCurrentTime) ? displayedCurrentTime : 0}
                onChange={handleSeek}
                className="flex-1 w-full h-3 bg-neutral-800 rounded-full appearance-none cursor-pointer audio-progress-bar"
                style={{ WebkitAppearance: 'none', appearance: 'none' }}
                disabled={disabled || !audioUrl || !syncReady || socketDisconnected}
              />
            )}
            <span className="text-[11px] text-neutral-400 w-8 text-right font-mono">{formatTime(duration)}</span>
          </div>
          {/* Controls row */}
          <div className="flex items-center justify-center mt-1 gap-8">
            <button
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none shadow-lg bg-neutral-800 text-white hover:bg-white hover:text-black focus:bg-white focus:text-black active:bg-white active:text-black disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={onPrevTrack}
              disabled={disabled || !isController || !audioUrl || !syncReady || socketDisconnected || selectedTrackIdx === 0}
              aria-label="Previous Track"
              title="Previous Track"
              style={{
                backgroundColor: undefined, // let Tailwind handle default
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseDown={e => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.color = '#000';
              }}
              onMouseUp={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
              onMouseOver={e => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.color = '#000';
                }
              }}
              onFocus={e => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.color = '#000';
                }
              }}
              onBlur={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
            </button>
            <button
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none shadow-lg
                ${isPlaying 
                  ? 'bg-white hover:bg-neutral-100 text-black scale-105' 
                  : 'bg-primary hover:bg-primary/90 text-white scale-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={isPlaying ? handlePause : handlePlay}
              disabled={disabled || !isController || !audioUrl || !syncReady || socketDisconnected}
              style={{ transition: 'background 0.3s, color 0.3s, transform 0.3s cubic-bezier(0.4,0,0.2,1)' }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <span className="relative w-6 h-6 flex items-center justify-center">
                {/* Animated icon morph: Play <-> Pause */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="absolute left-0 top-0 w-full h-full"
                  style={{
                    transition: 'opacity 0.5s, transform 0.5s cubic-bezier(0.4,0,0.2,1)',
                    opacity: isPlaying ? 1 : 0,
                    transform: isPlaying ? 'scale(1) rotate(0deg)' : 'scale(0.85) rotate(-15deg)',
                    zIndex: isPlaying ? 2 : 1,
                  }}
                >
                  {/* Pause icon */}
                  <rect
                    x="6"
                    y="4"
                    width="4"
                    height="16"
                    rx="1"
                    style={{
                      transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
                      transform: isPlaying ? 'scaleY(1)' : 'scaleY(0.7) translateY(4px)',
                      opacity: isPlaying ? 1 : 0.5,
                    }}
                  />
                  <rect
                    x="14"
                    y="4"
                    width="4"
                    height="16"
                    rx="1"
                    style={{
                      transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
                      transform: isPlaying ? 'scaleY(1)' : 'scaleY(0.7) translateY(4px)',
                      opacity: isPlaying ? 1 : 0.5,
                    }}
                  />
                </svg>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="absolute left-0 top-0 w-full h-full"
                  style={{
                    transition: 'opacity 0.5s, transform 0.5s cubic-bezier(0.4,0,0.2,1)',
                    opacity: !isPlaying ? 1 : 0,
                    transform: !isPlaying ? 'scale(1) rotate(0deg)' : 'scale(0.85) rotate(15deg)',
                    zIndex: !isPlaying ? 2 : 1,
                  }}
                >
                  {/* Play icon */}
                  <polygon
                    points="5 3 19 12 5 21 5 3"
                    style={{
                      transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
                      transform: !isPlaying ? 'scale(1)' : 'scale(0.7) translateX(4px)',
                      opacity: !isPlaying ? 1 : 0.5,
                    }}
                  />
                </svg>
              </span>
            </button>
            <button
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none shadow-lg bg-neutral-800 text-white hover:bg-white hover:text-black focus:bg-white focus:text-black active:bg-white active:text-black disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={onNextTrack}
              disabled={disabled || !isController || !audioUrl || !syncReady || socketDisconnected || selectedTrackIdx === queue.length - 1}
              aria-label="Next Track"
              title="Next Track"
              style={{
                backgroundColor: undefined, // let Tailwind handle default
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseDown={e => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.color = '#000';
              }}
              onMouseUp={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
              onMouseOver={e => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.color = '#000';
                }
              }}
              onFocus={e => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.color = '#000';
                }
              }}
              onBlur={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>
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

  // Enhanced album art handling: supports absolute, relative, fallback, and SVG placeholder
  let albumArt = currentTrack?.albumArtUrl;

  // Helper: check if URL is absolute (http/https/data)
  const isAbsoluteUrl = (url) => /^https?:\/\//i.test(url) || url?.startsWith('data:');

  // Fallback: use a default image or SVG if missing
  const defaultAlbumArtSvg = encodeURIComponent(`
    <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="24" fill="#27272a"/>
      <g>
        <circle cx="64" cy="64" r="40" fill="#52525b"/>
        <circle cx="64" cy="64" r="24" fill="#a3a3a3"/>
        <rect x="54" y="44" width="20" height="40" rx="6" fill="#27272a"/>
      </g>
    </svg>
  `);
  const defaultAlbumArt = `data:image/svg+xml,${defaultAlbumArtSvg}`;

  if (albumArt) {
    if (albumArt.startsWith('/audio/')) {
      // Local backend-served album art
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      albumArt = backendUrl.replace(/\/$/, '') + albumArt;
    } else if (!isAbsoluteUrl(albumArt)) {
      // Relative path (not /audio/), treat as backend static
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      albumArt = backendUrl.replace(/\/$/, '') + '/' + albumArt.replace(/^\//, '');
    }
    // else: already absolute or data: URL, use as-is
  } else {
    albumArt = defaultAlbumArt;
  }

  // Add buffer state to UI (simple indicator)
  {/* Buffering indicator */}
  {isBuffering && (
    <div className="fixed top-0 left-0 w-full bg-yellow-500 text-black text-center z-50 py-1 animate-pulse">
      Buffering... ({bufferedAhead.toFixed(1)}s buffered)
    </div>
  )}



  return (
    <>
      {!mobile && (
        <div className="flex items-center justify-between mb-3 px-2">
          <div className="flex items-center">
            <SyncStatus 
              status={syncStatus} 
              showSmartSuggestion={smartResyncSuggestion}
              rtt={rtt}
              jitter={jitter}
              drift={typeof displayedCurrentTime === 'number' && typeof currentTime === 'number' ? (displayedCurrentTime - currentTime) * 1000 : null}
              deviceType={adaptiveThresholds?.deviceType}
              networkQuality={adaptiveThresholds?.networkQuality}
              showMetrics={process.env.NODE_ENV === 'development'}
              syncMode={syncMode}
              syncQuality={syncQuality}
              syncHealthScore={syncHealthScore.current}
            />
          </div>
          <div className="flex items-center">
            <button
              className={`px-2 py-1 rounded-lg text-xs transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                resyncInProgress 
                  ? 'bg-white-600 text-white' 
                  : smartResyncSuggestion 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white'
              }`}
              onClick={handleResync}
              disabled={disabled || !audioUrl || resyncInProgress || socketDisconnected}
              aria-label="Re-sync"
              title={
                resyncInProgress
                  ? 'Syncing with server...'
                  : smartResyncSuggestion
                    ? 'High drift detected! Recommended to sync now.'
                    : 'Re-sync audio with server'
              }
            >
              {resyncInProgress ? (
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
              {resyncInProgress ? 'Syncing...' : smartResyncSuggestion ? 'Re-sync*' : 'Re-sync'}
            </button>
          </div>
        </div>
      )}
      <div className={`audio-player transition-all duration-500 ${audioLoaded.animationClass}`}>
        {(loading || !syncReady) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
            <span className="text-white text-base font-semibold mt-2 animate-pulse">
              {loading ? 'Loading track metadata...' : 'Waiting for sync...'}
            </span>
          </div>
        )}
        {/* Audio Element */}
        {audioUrl ? (
          <audio 
            ref={audioRef} 
            src={audioUrl} 
            preload="auto"
            onLoadedMetadata={() => {
              // Ensure audio is paused when metadata loads (especially for listeners)
              const audio = audioRef.current;
              if (audio && !isController && !isPlaying) {
                audio.pause();
                setCurrentTime(0);
              }
            }}
          />
        ) : null}

        {/* Now Playing Section */}
        <div className="bg-neutral-900/50 rounded-lg border border-neutral-800 p-4 relative">
          {/* Now Playing Section (album art, title, etc.) */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center overflow-hidden">
              {albumArt ? (
                <img
                  src={albumArt}
                  alt="Album Art"
                  className="w-full h-full object-cover rounded-lg"
                  draggable={false}
                />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-white font-medium">{displayedTitle || 'Unknown Track'}</h3>
              <p className="text-neutral-400 text-sm">Synchronized audio stream</p>
            </div>
            <div className="text-right">
              <div className="text-white font-mono text-sm">
                {formatTime(displayedCurrentTime)} / {formatTime(duration)}
              </div>
              <div className="text-neutral-400 text-xs">Duration</div>
            </div>
          </div>
          {/* Progress Bar */}
          <div className="mb-4">
            {(loading || !syncReady) ? (
              <div className="flex-1 flex items-center justify-center h-3">
              </div>
            ) : (
              <input
                type="range"
                min={0}
                max={isFinite(duration) ? duration : 0}
                step={0.01}
                value={isFinite(displayedCurrentTime) ? displayedCurrentTime : 0}
                onChange={handleSeek}
                className="w-full h-2 bg-black/80 rounded-lg appearance-none cursor-pointer audio-progress-bar"
                style={{
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  '--progress': `${(isFinite(displayedCurrentTime) && isFinite(duration) && duration > 0) ? (displayedCurrentTime / duration) * 100 : 0}%`
                }}
                disabled={disabled || !isController || !audioUrl || !syncReady || socketDisconnected}
              />
            )}
          </div>
          {/* Controls row: center controls horizontally */}
          <div className="flex items-center justify-center gap-8 mt-2">
            <button
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none shadow-lg bg-neutral-800 text-white hover:bg-white hover:text-black focus:bg-white focus:text-black active:bg-white active:text-black disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={onPrevTrack}
              disabled={disabled || !isController || !audioUrl || !syncReady || socketDisconnected || selectedTrackIdx === 0}
              aria-label="Previous Track"
              title="Previous Track"
              style={{
                backgroundColor: undefined, // let Tailwind handle default
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseDown={e => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.color = '#000';
              }}
              onMouseUp={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
              onMouseOver={e => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.color = '#000';
                }
              }}
              onFocus={e => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.color = '#000';
                }
              }}
              onBlur={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
            </button>
            <button
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none shadow-lg
                ${isPlaying 
                  ? 'bg-white hover:bg-neutral-100 text-black scale-105' 
                  : 'bg-primary hover:bg-primary/90 text-white scale-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={isPlaying ? handlePause : handlePlay}
              disabled={disabled || !isController || !audioUrl || !syncReady || socketDisconnected}
              style={{ transition: 'background 0.3s, color 0.3s, transform 0.3s cubic-bezier(0.4,0,0.2,1)' }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <span className="relative w-6 h-6 flex items-center justify-center">
                {/* Animated icon morph: Play <-> Pause */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="absolute left-0 top-0 w-full h-full"
                  style={{
                    transition: 'opacity 0.5s, transform 0.5s cubic-bezier(0.4,0,0.2,1)',
                    opacity: isPlaying ? 1 : 0,
                    transform: isPlaying ? 'scale(1) rotate(0deg)' : 'scale(0.85) rotate(-15deg)',
                    zIndex: isPlaying ? 2 : 1,
                  }}
                >
                  {/* Pause icon */}
                  <rect
                    x="6"
                    y="4"
                    width="4"
                    height="16"
                    rx="1"
                    style={{
                      transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
                      transform: isPlaying ? 'scaleY(1)' : 'scaleY(0.7) translateY(4px)',
                      opacity: isPlaying ? 1 : 0.5,
                    }}
                  />
                  <rect
                    x="14"
                    y="4"
                    width="4"
                    height="16"
                    rx="1"
                    style={{
                      transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
                      transform: isPlaying ? 'scaleY(1)' : 'scaleY(0.7) translateY(4px)',
                      opacity: isPlaying ? 1 : 0.5,
                    }}
                  />
                </svg>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="absolute left-0 top-0 w-full h-full"
                  style={{
                    transition: 'opacity 0.5s, transform 0.5s cubic-bezier(0.4,0,0.2,1)',
                    opacity: !isPlaying ? 1 : 0,
                    transform: !isPlaying ? 'scale(1) rotate(0deg)' : 'scale(0.85) rotate(15deg)',
                    zIndex: !isPlaying ? 2 : 1,
                  }}
                >
                  {/* Play icon */}
                  <polygon
                    points="5 3 19 12 5 21 5 3"
                    style={{
                      transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
                      transform: !isPlaying ? 'scale(1)' : 'scale(0.7) translateX(4px)',
                      opacity: !isPlaying ? 1 : 0.5,
                    }}
                  />
                </svg>
              </span>
            </button>
            <button
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none shadow-lg bg-neutral-800 text-white hover:bg-white hover:text-black focus:bg-white focus:text-black active:bg-white active:text-black disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={onNextTrack}
              disabled={disabled || !isController || !audioUrl || !syncReady || socketDisconnected || selectedTrackIdx === queue.length - 1}
              aria-label="Next Track"
              title="Next Track"
              style={{
                backgroundColor: undefined, // let Tailwind handle default
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseDown={e => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.color = '#000';
              }}
              onMouseUp={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
              onMouseOver={e => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.color = '#000';
                }
              }}
              onFocus={e => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.color = '#000';
                }
              }}
              onBlur={e => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>
          </div>
        </div>
      </div>
      <style>{`
        /* Custom audio progress bar for black & white theme */
        .audio-progress-bar {
          background: #18181b; /* black/neutral background */
          border-radius: 0.5rem;
          height: 0.5rem;
          box-shadow: 0 1px 4px #0002;
        }
        .audio-progress-bar::-webkit-slider-runnable-track {
          height: 0.5rem;
          background: linear-gradient(90deg, #fff var(--progress,0%), #222 var(--progress,0%));
          border-radius: 0.5rem;
        }
        .audio-progress-bar::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 0.85rem;
          height: 0.85rem;
          border-radius: 50%;
          background: #fff;
          border: none;
          box-shadow: none;
          cursor: pointer;
          transition: transform 0.15s cubic-bezier(0.4,0,0.2,1), background 0.2s;
          margin-top: -0.175rem; /* Center thumb vertically (thumb is 0.85rem, track is 0.5rem, so offset by (0.85-0.5)/2 = 0.175rem) */
        }
        .audio-progress-bar:active::-webkit-slider-thumb,
        .audio-progress-bar:hover::-webkit-slider-thumb {
          transform: scale(1.18);
          background: #000;
        }
        .audio-progress-bar::-moz-range-track {
          height: 0.5rem;
          background: linear-gradient(90deg, #fff var(--progress,0%), #222 var(--progress,0%));
          border-radius: 0.5rem;
        }
        .audio-progress-bar::-moz-range-thumb {
          width: 0.85rem;
          height: 0.85rem;
          border-radius: 50%;
          background: #fff;
          border: none;
          box-shadow: none;
          cursor: pointer;
          transition: transform 0.15s cubic-bezier(0.4,0,0.2,1), background 0.2s;
          margin-top: -0.175rem; /* Center thumb vertically */
        }
        .audio-progress-bar:active::-moz-range-thumb,
        .audio-progress-bar:hover::-moz-range-thumb {
          transform: scale(1.18);
          background: #000;
        }
        .audio-progress-bar::-ms-fill-lower {
          background: #fff;
          border-radius: 0.5rem;
        }
        .audio-progress-bar::-ms-fill-upper {
          background: #222;
          border-radius: 0.5rem;
        }
        .audio-progress-bar::-ms-thumb {
          width: 0.85rem;
          height: 0.85rem;
          border-radius: 50%;
          background: #fff;
          border: none;
          box-shadow: none;
          cursor: pointer;
          transition: transform 0.15s cubic-bezier(0.4,0,0.2,1), background 0.2s;
          margin-top: 0; /* For IE, use top instead */
          top: -0.175rem;
        }
        .audio-progress-bar:active::-ms-thumb,
        .audio-progress-bar:hover::-ms-thumb {
          transform: scale(1.18);
          background: #000;
        }
        .audio-progress-bar:focus {
          outline: none;
          box-shadow: none;
        }
        /* Remove default styles for Firefox */
        .audio-progress-bar::-moz-focus-outer {
          border: 0;
        }
        /* Hide the outline for IE */
        .audio-progress-bar::-ms-tooltip {
          display: none;
        }
      `}</style>
    </>
  );
} 