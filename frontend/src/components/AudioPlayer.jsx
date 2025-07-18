import React, { useEffect, useRef, useState } from 'react';
import SyncStatus from './SyncStatus';
import useSmoothAppearance from '../hooks/useSmoothAppearance';
import LoadingSpinner from './LoadingSpinner';
import ResyncAnalytics from './ResyncAnalytics';
import useDriftCorrection from '../hooks/useDriftCorrection'
import useAudioElement from '../hooks/useAudioElement'
import useResyncAnalytics from '../hooks/useResyncAnalytics'
import SYNC_CONFIG from '../utils/syncConfig';
import useUltraPreciseOffset from '../hooks/useUltraPreciseOffset';
import { createEMA } from '../utils/syncConfig';
import PlayerControls from './AudioPlayer/PlayerControls';
import ProgressBar from './AudioPlayer/ProgressBar';
import ErrorBanner from './AudioPlayer/ErrorBanner';
import TrackInfo from './AudioPlayer/TrackInfo';
import SyncStatusBanner from './AudioPlayer/SyncStatusBanner';
import DiagnosticsPanel from './AudioPlayer/DiagnosticsPanel';

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

// Utility: Checks if a value is a finite number
function isFiniteNumber(val) {
  return typeof val === 'number' && isFinite(val);
}

// Helper: Compute moving average
function movingAverage(arr, windowSize) {
  if (!arr.length) return 0;
  const window = arr.slice(-windowSize);
  return window.reduce((a, b) => a + b, 0) / window.length;
}

// --- Dynamic Drift Correction Parameter Calculation ---
function getDriftCorrectionParams({ rtt, jitter, driftHistory = [] }) {
  // Device info
  const hw = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  // Network info
  const netRtt = typeof rtt === 'number' ? rtt : 80;
  const netJitter = typeof jitter === 'number' ? jitter : 15;

  // Quality tiers
  let quality = 'good';
  if (hw < 2 || mem < 2 || netRtt > 200 || netJitter > 30) quality = 'poor';
  else if (hw < 4 || mem < 4 || netRtt > 120 || netJitter > 20) quality = 'fair';
  else if (hw >= 8 && mem >= 8 && netRtt < 40 && netJitter < 8) quality = 'excellent';

  // --- Adaptive logic ---
  if (SYNC_CONFIG.ADAPTIVE.ENABLED) {
    // Use moving averages for rtt, jitter, and drift
    const avgRtt = movingAverage(SYNC_CONFIG.ADAPTIVE.rttHistory || [], 6) || netRtt;
    const avgJitter = movingAverage(SYNC_CONFIG.ADAPTIVE.jitterHistory || [], 6) || netJitter;
    const avgDrift = movingAverage(driftHistory, 6) || 0;
    // Adjust quality tier based on moving averages
    if (avgRtt > 200 || avgJitter > 30) quality = 'poor';
    else if (avgRtt > 120 || avgJitter > 20) quality = 'fair';
    else if (hw >= 8 && mem >= 8 && avgRtt < 40 && avgJitter < 8) quality = 'excellent';
    else quality = 'good';
    // Optionally, adjust smoothing window size
    if (avgJitter > 25 || avgDrift > 0.2) {
      SYNC_CONFIG.OFFSET_SMOOTHING_WINDOW = 6;
    } else if (avgJitter < 10 && avgDrift < 0.05) {
      SYNC_CONFIG.OFFSET_SMOOTHING_WINDOW = 12;
    } else {
      SYNC_CONFIG.OFFSET_SMOOTHING_WINDOW = 10;
    }
  }
  // Use centralized config
  return SYNC_CONFIG.DRIFT_PARAMS_BY_QUALITY[quality];
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
    if (import.meta.env.MODE === 'development') {
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
        if (import.meta.env.MODE === 'development') {
           
          console.warn('[AudioPlayer][getNow] getServerTime() returned invalid value:', now, 'Falling back to high-res local time.');
        }
        return localNow();
      }
    } catch (e) {
      if (import.meta.env.MODE === 'development') {
         
        console.error('[AudioPlayer][getNow] getServerTime threw error:', e, 'Falling back to high-res local time.');
      }
      return localNow();
    }
  } else {
    if (import.meta.env.MODE === 'development') {
       
      console.warn('[AudioPlayer][getNow] getServerTime is missing! Falling back to high-res local time. This may cause sync drift.');
    }
    return localNow();
  }
}

/**
 * AudioPlayer: Ultra-precise, micro-millisecond-level synchronized audio player.
 * Uses EMA smoothing for offset and drift, and micro-correction for imperceptible sync.
 * All hooks and event listeners are cleaned up and follow React best practices.
 */
export default function AudioPlayer({
  disabled = false,
  socket,
  controllerClientId,
  clientId,
  getServerTime,
  mobile = false,
  isAudioTabActive = false,
  currentTrack = null,
  rtt = null,
  jitter = null,
  ultraPreciseOffset, // Canonical hybrid offset: use for all sync logic
  timeOffset, // fallback only if ultraPreciseOffset is unavailable
  sessionSyncState = null,
  forceNtpBatchSync,
  queue = [], // Add queue prop
  selectedTrackIdx = 0, // Add selectedTrackIdx prop
  onSelectTrack, // Add onSelectTrack prop
  sessionId, // Add sessionId prop
  // --- Add these props for sync quality display ---
  syncQuality: propSyncQuality,
  selectedSource: propSelectedSource,
}) {
  // Fix: manualLatency must be declared before any useEffect or code that references it
  const [manualLatency, setManualLatency] = useState(() => {
    const saved = localStorage.getItem('audioLatencyOverride');
    return saved ? parseFloat(saved) : null;
  });

  // Use controllerClientId/clientId for sticky controller logic
  const isController = controllerClientId && clientId && controllerClientId === clientId;

  // Add handlers for previous and next buttons
  const handlePrevious = () => {
    if (!isController || !socket || !queue || queue.length === 0) return;
    const newIdx = selectedTrackIdx > 0 ? selectedTrackIdx - 1 : queue.length - 1;
    if (onSelectTrack) {
      onSelectTrack(newIdx);
    } else if (socket && sessionId) {
      socket.emit('track_change', { sessionId, idx: newIdx });
    }
  };

  const handleNext = () => {
    if (!isController || !socket || !queue || queue.length === 0) return;
    const newIdx = selectedTrackIdx < queue.length - 1 ? selectedTrackIdx + 1 : 0;
    if (onSelectTrack) {
      onSelectTrack(newIdx);
    } else if (socket && sessionId) {
      socket.emit('track_change', { sessionId, idx: newIdx });
    }
  };

  // Check if previous/next buttons should be enabled
  const canNavigate = isController && queue && queue.length > 1;
  const canGoPrevious = isController && canNavigate && selectedTrackIdx > 0;
  const canGoNext = isController && canNavigate && selectedTrackIdx < queue.length - 1;
  // Remove: audioUrl, loading, audioError, isPlaying, duration, displayedCurrentTime, audioRef, and their setters
  // Instead, use:
  const lastSeekTime = useRef(0); // Track last user seek time
  const {
    audioRef,
    audioUrl,
    loading,
    audioError,
    isPlaying,
    duration,
    displayedCurrentTime,
    setIsPlaying,
    setDisplayedCurrentTime,
    setAudioError,
    setAudioUrl,
    handleSeek,
    isSeeking,
  } = useAudioElement({ currentTrack, isController, getServerTime, setLastSeekTime: (t) => { lastSeekTime.current = t; } })
  const [syncStatus, setSyncStatus] = useState('In Sync');
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [audioLatency, setAudioLatency] = useState(0.08); // measured latency in seconds
  const playRequestedAt = useRef(null);
  const lastCorrectionRef = useRef(0);
  const correctionInProgressRef = useRef(false);
  const [microCorrectionActive, setMicroCorrectionActive] = useState(false); // Visual feedback for micro-corrections
  const [displayedTitle, setDisplayedTitle] = useState(currentTrack?.title || '');
  const [errorBanner, setErrorBanner] = useState(null);
  // Remove all state, handlers, and UI for latency calibration, LatencyCalBanner, and LatencyWizardModal
  // Restore edgeCaseBanner and related state at the top level
  const [showDriftDebug, setShowDriftDebug] = useState(false);
  const [showLatencyCal, setShowLatencyCal] = useState(false);
  const [edgeCaseBanner, setEdgeCaseBanner] = useState(null);
  const [showCalibrateBanner, setShowCalibrateBanner] = useState(false);
  const [firstSyncAttempted, setFirstSyncAttempted] = useState(false);
  const [firstSyncFailed, setFirstSyncFailed] = useState(false);

  // --- Dynamic Drift Correction Parameters ---
  const driftParams = getDriftCorrectionParams({ rtt, jitter });

  // --- Canonical Offset: Use prop from SessionPage (peer+server hybrid) ---
  // If ultraPreciseOffset prop is provided, use it as the source of truth for all sync logic.
  // Fallback: If not provided, calculate locally (server-only).
  const canonicalUltraPreciseOffset =
    typeof ultraPreciseOffset === 'number' && !isNaN(ultraPreciseOffset)
      ? ultraPreciseOffset
      : (() => {
          // Fallback: local calculation (server only)
          const { ultraPreciseOffset: fallbackOffset } = useUltraPreciseOffset(
            [],
            timeOffset,
            rtt,
            jitter
          );
          return fallbackOffset;
        })();

  // --- EMA for offset smoothing ---
  const offsetEMARef = useRef(createEMA(0.18, canonicalUltraPreciseOffset ?? timeOffset ?? 0));
  const [smoothedOffset, setSmoothedOffset] = useState(canonicalUltraPreciseOffset ?? timeOffset ?? 0);

  // --- Use EMA for offset smoothing ---
  useEffect(() => {
    let nextOffset = timeOffset || 0;
    if (
      typeof canonicalUltraPreciseOffset === 'number' &&
      Math.abs(canonicalUltraPreciseOffset) < 1000 && // sanity check: < 1s
      !isNaN(canonicalUltraPreciseOffset)
    ) {
      nextOffset = canonicalUltraPreciseOffset;
    }
    // Use EMA for smoothing
    const smoothed = offsetEMARef.current.next(nextOffset);
    setSmoothedOffset(smoothed);
    if (
      typeof canonicalUltraPreciseOffset === 'number' && (isNaN(canonicalUltraPreciseOffset) || Math.abs(canonicalUltraPreciseOffset) > 1000)
    ) {
      console.warn('[AudioPlayer] Ignoring suspicious canonicalUltraPreciseOffset:', canonicalUltraPreciseOffset);
    }
  }, [canonicalUltraPreciseOffset, timeOffset]);

  // useDriftCorrection hook at the top level
  const { maybeCorrectDrift } = useDriftCorrection({
    audioRef,
    isController,
    sessionSyncState,
    audioLatency,
    rtt,
    smoothedOffset,
    getServerTime,
    setDisplayedCurrentTime,
    isFiniteNumber,
    setCurrentTimeSafely,
    ...driftParams,
    correctionInProgressRef,
    lastCorrectionRef,
    onDriftDetected: (reason) => {
      if (reason === 'raf_drift') {
        setEdgeCaseBanner('Animation frame drift detected (tab throttling?). Auto-resyncing...');
        handleResync();
        setTimeout(() => setEdgeCaseBanner(null), 4000);
      }
    },
    onMicroCorrection: (active) => setMicroCorrectionActive(active), // <-- new callback
  });

  // Smooth appearance hooks for loading states and status changes
  const audioLoaded = useSmoothAppearance(!loading && !audioError, 200, 'animate-fade-in-slow');

  // Modern smooth transition for track title (single element, fade/slide/scale)
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState('up');

  // Remove: resyncHistory, lastResyncTime, resyncInProgress, smartResyncSuggestion, resyncStats, updateResyncHistory
  // Instead, use:
  const {
    resyncHistory,
    lastResyncTime,
    setLastResyncTime,
    resyncInProgress,
    setResyncInProgress,
    smartResyncSuggestion,
    setSmartResyncSuggestion,
    resyncStats,
    updateResyncHistory
  } = useResyncAnalytics()

  // Jitter buffer: only correct drift if sustained for N checks
  const driftCountRef = useRef(0);

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
      // --- Ensure playback starts from beginning when track changes ---
      const audio = audioRef.current;
      if (audio) {
        setCurrentTimeSafely(audio, 0, setDisplayedCurrentTime);
      } else {
        setDisplayedCurrentTime(0);
      }
    }
  }, [currentTrack]);

  // --- Ensure playback starts from beginning when selectedTrackIdx changes (even if currentTrack does not) ---
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTimeSafely(audio, 0, setDisplayedCurrentTime);
    } else {
      setDisplayedCurrentTime(0);
    }
  }, [selectedTrackIdx]);

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
      setAudioError('Audio backend URL is not configured. Please set VITE_BACKEND_URL in your environment.');
      // setLoading(false); // Removed
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
        // setLoading(false); // Removed
      })
      .catch(err => {
        setAudioError('Error fetching audio URL. ' + (err?.message || ''));
        // setLoading(false); // Removed
      });
  }, [currentTrack]);

  // Audio event listeners and initialization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    // const update = () => setDisplayedCurrentTime(audio.currentTime); // Removed
    // const setDur = () => setDuration(audio.duration || 0); // Removed
    const handlePlaying = () => {
      if (playRequestedAt.current) {
        const latency = (Date.now() - playRequestedAt.current) / 1000;
        setAudioLatency(latency);
        playRequestedAt.current = null;
      }
    };
    
    // audio.addEventListener('timeupdate', update); // Removed
    // audio.addEventListener('durationchange', setDur); // Removed
    audio.addEventListener('playing', handlePlaying);
    
    return () => {
      // audio.removeEventListener('timeupdate', update); // Removed
      // audio.removeEventListener('durationchange', setDur); // Removed
      audio.removeEventListener('playing', handlePlaying);
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

    // Helper: log with context and level
    const log = (level, ...args) => {
      if (import.meta.env.MODE === 'development') {
         
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
          timestamp: Date.now(),
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
    }) => {
      // Defensive: check for valid timestamp and lastUpdated
      if (
        typeof timestamp !== 'number' ||
        typeof lastUpdated !== 'number' ||
        !isFinite(timestamp) ||
        !isFinite(lastUpdated)
      ) {
        showSyncStatus('Sync failed');
        setErrorBanner('Sync failed: Invalid state received from server.');
        return;
      }
      const audio = audioRef.current;
      if (!audio) {
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
        showSyncStatus('Sync failed');
        setErrorBanner('Sync failed: Invalid expected time.');
        return;
      }
      const drift = Math.abs(audio.currentTime - expected);

      // Enhanced: keep drift history for analytics (last 10 drifts)
      if (!window._audioDriftHistory) window._audioDriftHistory = [];
      window._audioDriftHistory.push({
        drift,
        current: audio.currentTime,
        expected,
        timestamp: Date.now(),
        isPlaying,
        ctrlId,
        trackId,
      });
      if (window._audioDriftHistory.length > 10) window._audioDriftHistory.shift();

      // --- IMMEDIATE CORRECTION FOR EXTREME DRIFT ---
      if (drift > 1.0) { // 1 second or more
        maybeCorrectDrift(audio, expected);
        setSyncStatus('Major re-sync');
        if (typeof socket?.forceTimeSync === 'function') {
          socket.forceTimeSync();
        }
        emitDriftReport(drift, expected, audio.currentTime, { ctrlId, trackId, meta, immediate: true });
        driftCountRef.current = 0;
        setTimeout(() => setSyncStatus('In Sync'), 1200);
        // Only play/pause if state differs
        if (isPlaying && audio.paused) {
          audio.play().catch(e => {
            log('warn', 'SYNC_STATE: failed to play audio', e);
          });
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
        return;
      }
      // --- END IMMEDIATE CORRECTION ---

      // Enhanced: show drift in UI if large
      if (drift > SYNC_CONFIG.DRIFT_THRESHOLD) {
        driftCountRef.current += 1;
        if (driftCountRef.current >= SYNC_CONFIG.DRIFT_JITTER_BUFFER) {
          showSyncStatus('Drifted', 1000);
          maybeCorrectDrift(audio, expected);
          setSyncStatus('Re-syncing...');
          if (resyncTimeout) clearTimeout(resyncTimeout);
          resyncTimeout = setTimeout(() => setSyncStatus('In Sync'), 800);

          if (typeof socket?.forceTimeSync === 'function') {
            socket.forceTimeSync();
          }
          emitDriftReport(drift, expected, audio.currentTime, { ctrlId, trackId, meta });
          driftCountRef.current = 0;
        }
      } else {
        driftCountRef.current = 0;
        setSyncStatus('In Sync');
      }

      // setIsPlaying(isPlaying); // Removed

      // Only play/pause if state differs
      if (isPlaying && audio.paused) {
        audio.play().catch(e => {
          log('warn', 'SYNC_STATE: failed to play audio', e);
        });
      } else if (!isPlaying && !audio.paused) {
        audio.pause();
        // Do not seek to correct drift if paused
      }
    };

    socket.on('sync_state', handleSyncState);

    return () => {
      socket.off('sync_state', handleSyncState);
      if (syncTimeout) clearTimeout(syncTimeout);
      if (resyncTimeout) clearTimeout(resyncTimeout);
    };
  }, [socket, audioLatency, getServerTime, clientId, rtt, smoothedOffset]);

  // Enhanced periodic drift check (for followers)
  useEffect(() => {
    if (!socket || isController) return;

    let lastCorrection = 0;
    let correctionCooldown = SYNC_CONFIG.CORRECTION_COOLDOWN; // ms, minimum time between corrections
    let lastIntervalFired = Date.now();

    const interval = setInterval(() => {
      const nowInterval = Date.now();
      const elapsed = nowInterval - lastIntervalFired;
      lastIntervalFired = nowInterval;
      // Timer drift detection: if interval fires late, trigger resync
      if (elapsed > SYNC_CONFIG.TIMER_DRIFT_DETECTION) { // 2x the normal 1200ms interval
        setEdgeCaseBanner('Timer drift detected (tab throttling?). Auto-resyncing...');
        handleResync();
        setTimeout(() => setEdgeCaseBanner(null), 4000);
        return;
      }
      // Defensive check: only emit if sessionId is set
      if (!socket.sessionId) {
        if (import.meta.env.MODE === 'development') {
          console.warn('[DriftCheck] No sessionId set on socket, skipping sync_request');
        }
        return;
      }
      socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
        // Handle server error
        if (state && state.error) {
          if (import.meta.env.MODE === 'development') {
            console.warn('[DriftCheck] Server error received', state.error);
          }
          // Optionally, show a user-facing error or attempt to rejoin
          return;
        }
        // Validate state
        if (
          !state ||
          typeof state.timestamp !== 'number' ||
          typeof state.lastUpdated !== 'number' ||
          !isFinite(state.timestamp) ||
          !isFinite(state.lastUpdated)
        ) {
          if (import.meta.env.MODE === 'development') {
            // More detailed logging in dev
            console.warn('[DriftCheck] Invalid state received', { state });
          }
          return;
        }

        const audio = audioRef.current;
        if (!audio) return;

        const now = getNow(getServerTime);
        const rttComp = rtt ? rtt / 2000 : 0; // ms to s, one-way
        const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
        if (!isFiniteNumber(expected)) {
          if (import.meta.env.MODE === 'development') {
            console.warn('[DriftCheck] Expected is not finite', { expected, state });
          }
          return;
        }

        const syncedNow = getNow(getServerTime);
        const expectedSynced = state.timestamp + (syncedNow - state.lastUpdated) / 1000 + rttComp + smoothedOffset;
        const drift = Math.abs(audio.currentTime - expectedSynced);

        // Only correct if not in cooldown and not right after a seek
        const nowMs = Date.now();
        const canCorrect = nowMs - lastCorrection > correctionCooldown && nowMs - lastSeekTime.current > 500;

        if (drift > SYNC_CONFIG.DRIFT_THRESHOLD) {
          driftCountRef.current += 1;

          if (driftCountRef.current >= SYNC_CONFIG.DRIFT_JITTER_BUFFER && canCorrect) {
            setSyncStatus('Drifted');
            maybeCorrectDrift(audio, expectedSynced);
            setSyncStatus('Re-syncing...');
            setTimeout(() => setSyncStatus('In Sync'), 800);

            if (typeof socket?.forceTimeSync === 'function') {
              socket.forceTimeSync();
            }

            if (socket && socket.emit && socket.sessionId && typeof drift === 'number') {
              socket.emit('drift_report', {
                sessionId: socket.sessionId,
                drift,
                clientId,
                timestamp: nowMs
              });
            }

            driftCountRef.current = 0;
            lastCorrection = nowMs;
          }
        } else {
         
          driftCountRef.current = 0;
          setSyncStatus('In Sync');
        }
      });
    }, SYNC_CONFIG.TIMER_INTERVAL);

    return () => clearInterval(interval);
  }, [socket, isController, getServerTime, audioLatency, clientId, rtt, smoothedOffset]);

  // Enhanced: On mount, immediately request sync state on join, with improved error handling, logging, and edge case resilience
  useEffect(() => {
    if (!socket) return;
    if (!socket.sessionId) return;

    // Helper for logging (dev only)
    const log = (...args) => {
      if (import.meta.env.MODE === 'development') {
         
        console.log('[AudioPlayer][sync_request]', ...args);
      }
    };

    // Helper for warning (dev only)
    const warn = (...args) => {
      if (import.meta.env.MODE === 'development') {
         
        console.warn('[AudioPlayer][sync_request]', ...args);
      }
    };

    // Defensive: wrap in try/catch for callback
    socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
      setFirstSyncAttempted(true); // Mark that we've attempted the first sync
      try {
        const audio = audioRef.current;
        if (!audio) {
          warn('Audio element not available on sync_request');
          return;
        }

        // Handle server error
        if (state && state.error) {
          warn('Server error received in sync_request', state.error);
          audio.pause();
          setCurrentTimeSafely(audio, 0, setDisplayedCurrentTime);
          setIsPlaying(false);
          // Only show error banner if not the first sync failure
          if (!firstSyncFailed) {
            setFirstSyncFailed(true);
            setTimeout(() => {
              if (firstSyncFailed) setErrorBanner('Sync failed: ' + state.error);
            }, 1000);
          } else {
            setErrorBanner('Sync failed: ' + state.error);
          }
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
          setCurrentTimeSafely(audio, 0, setDisplayedCurrentTime);
          setIsPlaying(false);
          // Only show error banner if not the first sync failure
          if (!firstSyncFailed) {
            setFirstSyncFailed(true);
            setTimeout(() => {
              if (firstSyncFailed) setErrorBanner('Sync failed: No valid state received from server.');
            }, 1000);
          } else {
            setErrorBanner('Sync failed: No valid state received from server.');
          }
          return;
        }

        // Defensive: check for negative/NaN/absurd timestamps
        if (state.timestamp < 0 || state.lastUpdated < 0) {
          warn('Sync state has negative timestamp(s)', { state });
          audio.pause();
          setCurrentTimeSafely(audio, 0, setDisplayedCurrentTime);
          setIsPlaying(false);
          // Only show error banner if not the first sync failure
          if (!firstSyncFailed) {
            setFirstSyncFailed(true);
            setTimeout(() => {
              if (firstSyncFailed) setErrorBanner('Sync failed: Invalid sync state timestamp.');
            }, 1000);
          } else {
            setErrorBanner('Sync failed: Invalid sync state timestamp.');
          }
          return;
        }

        // If we get here, sync succeeded, so clear firstSyncFailed
        setFirstSyncFailed(false);
        setErrorBanner(null);

        const now = getNow(getServerTime);
        // Compensate for measured audio latency and RTT (one-way delay)
        const rttComp = rtt ? rtt / 2000 : 0; // ms to s, one-way
        const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
        if (!isFiniteNumber(expected) || expected < 0) {
          warn('Invalid expected time, pausing audio', { expected, state });
          audio.pause();
          setIsPlaying(false);
          // Only show error banner if not the first sync failure
          if (!firstSyncFailed) {
            setFirstSyncFailed(true);
            setTimeout(() => {
              if (firstSyncFailed) setErrorBanner('Sync failed: Invalid expected time.');
            }, 1000);
          } else {
            setErrorBanner('Sync failed: Invalid expected time.');
          }
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

        setCurrentTimeSafely(audio, safeExpected, setDisplayedCurrentTime);
        setIsPlaying(state.isPlaying);

        if (state.isPlaying) {
          playRequestedAt.current = Date.now();
          // Defensive: try/catch for play() (may throw in some browsers)
          audio.play().catch((err) => {
            warn('audio.play() failed on sync_request', err);
          });
        } else {
          // Ensure audio is definitely paused and reset to the expected time
          audio.pause();
          setCurrentTimeSafely(audio, safeExpected, setDisplayedCurrentTime);
        }
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
      const playAt = (audio ? audio.currentTime : 0) + SYNC_CONFIG.PLAY_OFFSET;
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
        if (import.meta.env.MODE === 'development') {
           
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
      try {
        socket.emit('pause', payload);
      } catch (err) {
        if (import.meta.env.MODE === 'development') {
           
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
      
      try {
        socket.emit('seek', payload);
      } catch (err) {
        if (import.meta.env.MODE === 'development') {
           
          console.error('[AudioPlayer][emitSeek] Failed to emit seek event', err, payload);
        }
      }
    }
  };

  // Enhanced Play/Pause/Seek handlers with improved error handling, logging, and edge case resilience

  const handlePlay = async () => {
    const audio = audioRef.current;
    if (!audio) {
      if (import.meta.env.MODE === 'development') {
         
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
      setIsPlaying(false);
      if (import.meta.env.MODE === 'development') {
         
        console.error('[AudioPlayer][handlePlay] Failed to play audio', err);
      }
    }
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (!audio) {
      if (import.meta.env.MODE === 'development') {
         
        console.warn('[AudioPlayer][handlePause] Audio element not available');
      }
      return;
    }
    try {
      audio.pause();
      setIsPlaying(false);
      emitPause();
     
    } catch (err) {
      if (import.meta.env.MODE === 'development') {
         
        console.error('[AudioPlayer][handlePause] Failed to pause audio', err);
      }
    }
  };

  // Enhanced Manual re-sync with improved logging, error handling, user feedback, and analytics
  const handleResync = async () => {
    const now = Date.now();
    if (resyncInProgress) {
      setSyncStatus('Resync already in progress.');
      setTimeout(() => setSyncStatus('In Sync'), 1500);
      return;
    }
    if (now - lastResyncTime < SYNC_CONFIG.RESYNC_COOLDOWN_MS) {
      const remainingCooldown = Math.ceil((SYNC_CONFIG.RESYNC_COOLDOWN_MS - (now - lastResyncTime)) / 1000);
      setSyncStatus(`Please wait ${remainingCooldown}s before resyncing again.`);
      setTimeout(() => setSyncStatus('In Sync'), 1500);
      return;
    }
    if (!socket) {
      console.warn('[AudioPlayer][handleResync] No socket available');
      setSyncStatus('Sync failed: No socket');
      setTimeout(() => setSyncStatus('In Sync'), 1200);
      updateResyncHistory('failed', 0, 'No socket available');
      return;
    }
    setResyncInProgress(true);
    setLastResyncTime(now);
    // --- Use NTP batch sync for manual resync if available ---
    if (typeof forceNtpBatchSync === 'function') {
      setSyncStatus('Running NTP batch sync...');
      try {
        const result = forceNtpBatchSync();
        if (result && typeof result.then === 'function') {
          await result;
        }
        setSyncStatus('NTP batch sync complete. Re-syncing...');
      } catch (e) {
        setSyncStatus('NTP batch sync failed.');
        setTimeout(() => setSyncStatus('In Sync'), 1500);
        setResyncInProgress(false);
        updateResyncHistory('failed', 0, 'NTP batch sync failed');
        return;
      }
    } else {
      setSyncStatus('NTP batch syncing unavailable. Proceeding with basic sync');
    }
    // ... existing resync logic ...
    // Always reset resyncInProgress and syncStatus after a timeout
    setTimeout(() => {
      setResyncInProgress(false);
      setSyncStatus('In Sync');
    }, 2000);
  };

  // Smart resync suggestion based on drift patterns
  useEffect(() => {
    if (resyncStats.lastDrift > SYNC_CONFIG.SMART_RESYNC_THRESHOLD && !resyncInProgress) {
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

  // --- Automatic device latency estimation using AudioContext.baseLatency ---
  useEffect(() => {
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.baseLatency && ctx.baseLatency > 0 && ctx.baseLatency < 1) {
        setAudioLatency(ctx.baseLatency);
      }
    } catch (e) {
      // Ignore, fallback to default
    } finally {
      if (ctx && typeof ctx.close === 'function') ctx.close();
    }
  }, []);

  // On manual latency change, update state and localStorage
  useEffect(() => {
    if (manualLatency && !isNaN(manualLatency)) {
      setAudioLatency(manualLatency);
      localStorage.setItem('audioLatencyOverride', manualLatency.toString());
    }
  }, [manualLatency]);

  // Smoothly animate displayedCurrentTime toward audio.currentTime
  useEffect(() => {
    let raf;
    const animate = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const actual = audio.currentTime;
      setDisplayedCurrentTime(prev => {
        if (isSeeking) return prev;
        if (Math.abs(prev - actual) < 0.015) return actual;
        return prev + (actual - prev) * 0.22;
      });
      raf = requestAnimationFrame(animate);
    };
    if (isPlaying && !isSeeking) {
      raf = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(raf);
  }, [audioUrl, isSeeking, isPlaying]);

  // Wrap handleSeek to emit seek event if controller and update lastSeekTime
  const handleSeekWithEmit = (time) => {
    handleSeek(time); // always update local audio
    lastSeekTime.current = Date.now(); // Mark last seek
    if (isController) {
      emitSeek(time);
    }
  };

  // --- Latency Calibration Wizard Logic ---
  // Remove all LatencyWizardModal JSX usage and related state/handlers
  // Remove startLatencyWizard, playTestSound, handleLatencyWizardNext, handleLatencyWizardCancel, and all references to LatencyWizardModal
  // Remove the calibration button in the expanded mobile view

  // --- MOBILE REDESIGN ---
  if (mobile) {
    const [expanded, setExpanded] = useState(false);
    // Drag state for handle
    const dragStartY = useRef(null);
    const dragDeltaY = useRef(0);
    const [dragging, setDragging] = useState(false);

    // Add loop state for current track
    const [loop, setLoop] = useState(false);
    useEffect(() => {
      if (audioRef.current) {
        audioRef.current.loop = loop;
      }
    }, [loop, audioRef]);

    // Drag event handlers
    const onHandleTouchStart = (e) => {
      if (e.touches && e.touches.length === 1) {
        dragStartY.current = e.touches[0].clientY;
        dragDeltaY.current = 0;
        setDragging(true);
      }
    };
    const onHandleTouchMove = (e) => {
      if (!dragging || !dragStartY.current) return;
      const y = e.touches[0].clientY;
      dragDeltaY.current = y - dragStartY.current;
    };
    const onHandleTouchEnd = () => {
      if (dragging) {
        if (!expanded && dragDeltaY.current < -40) {
          setExpanded(true);
        } else if (expanded && dragDeltaY.current > 40) {
          setExpanded(false);
        }
      }
      setDragging(false);
      dragStartY.current = null;
      dragDeltaY.current = 0;
    };
    // Mouse drag for desktop/mobile emu
    const onHandleMouseDown = (e) => {
      dragStartY.current = e.clientY;
      dragDeltaY.current = 0;
      setDragging(true);
      window.addEventListener('mousemove', onHandleMouseMove);
      window.addEventListener('mouseup', onHandleMouseUp);
    };
    const onHandleMouseMove = (e) => {
      if (!dragging || !dragStartY.current) return;
      dragDeltaY.current = e.clientY - dragStartY.current;
    };
    const onHandleMouseUp = () => {
      if (dragging) {
        if (!expanded && dragDeltaY.current < -40) {
          setExpanded(true);
        } else if (expanded && dragDeltaY.current > 40) {
          setExpanded(false);
        }
      }
      setDragging(false);
      dragStartY.current = null;
      dragDeltaY.current = 0;
      window.removeEventListener('mousemove', onHandleMouseMove);
      window.removeEventListener('mouseup', onHandleMouseUp);
    };
    // Handler for toggling expanded/compact state (tap fallback)
    const toggleExpanded = () => setExpanded((prev) => !prev);

    // --- Smooth drag expansion ---
    // Calculate drag progress (0 = compact, 1 = expanded)
    let dragProgress = 0;
    if (dragging && dragStartY.current !== null) {
      if (!expanded) {
        dragProgress = Math.max(0, Math.min(1, -dragDeltaY.current / 120));
      } else {
        dragProgress = Math.max(0, Math.min(1, 1 - dragDeltaY.current / 120));
      }
    } else {
      dragProgress = expanded ? 1 : 0;
    }
    // Interpolated values
    const minHeight = 80, maxHeight = expanded ? 500 : 340; // Allow more height when expanded
    const interpHeight = minHeight + (maxHeight - minHeight) * dragProgress;
    const interpPadding = 8 + (20 * dragProgress);

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
        {/* Only one audio element for mobile, outside compact/expanded content */}
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
                setDisplayedCurrentTime(0);
              }
            }}
          />
        )}
        <div className={`${shouldAnimate ? 'animate-slide-up-from-bottom' : 'opacity-0 translate-y-full'}`}>
          <div
            className={
              `bg-neutral-900/95 backdrop-blur-xl rounded-3xl shadow-2xl flex flex-col gap-2 border border-neutral-700/50 overflow-hidden` +
              (dragging ? '' : ' transition-all duration-300')
            }
            style={{
              minHeight: expanded ? 'auto' : interpHeight,
              maxHeight: expanded ? 'none' : interpHeight + 60,
              paddingTop: interpPadding,
              paddingBottom: expanded ? 12 : interpPadding,
            }}
          >
            {/* Drag handle / tap area */}
            <div
              className="flex justify-center items-center cursor-pointer select-none"
              onClick={toggleExpanded}
              onTouchStart={onHandleTouchStart}
              onTouchMove={onHandleTouchMove}
              onTouchEnd={onHandleTouchEnd}
              onMouseDown={onHandleMouseDown}
              style={{ touchAction: 'none' }}
            >
              <div className={`w-10 h-1 rounded-full transition-all duration-200 ${dragging ? 'bg-primary shadow-lg' : 'bg-neutral-600'}`} />
            </div>
            {/* Interpolated content: fade/slide between compact and expanded */}
            <div style={{ position: 'relative', flex: 1 }}>
              {/* Compact content */}
              <div
                style={{
                  opacity: 1 - dragProgress,
                  pointerEvents: dragProgress < 0.5 ? 'auto' : 'none',
                  position: dragProgress > 0 ? 'absolute' : 'relative',
                  width: '100%',
                  top: 0,
                  left: 0,
                  transition: dragging ? 'none' : 'opacity 0.25s',
                }}
              >
                {/* ...compact view code... */}
                {!expanded && (
                  <div className="flex items-center gap-3 px-3 py-2">
                    <PlayerControls
                      isPlaying={isPlaying}
                      onPlay={handlePlay}
                      onPause={handlePause}
                      onNext={handleNext}
                      onPrevious={handlePrevious}
                      canGoNext={canGoNext}
                      canGoPrevious={canGoPrevious}
                      disabled={disabled}
                      isController={isController}
                      audioUrl={audioUrl}
                    />
                    {/* Track Info & Progress */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-white font-medium truncate">
                          {displayedTitle || 'Unknown Track'}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono ml-2 flex-shrink-0">
                          {formatTime(displayedCurrentTime)} / {formatTime(duration)}
                        </div>
                      </div>
                      
                      {/* Compact Progress Bar */}
                      <ProgressBar
                        currentTime={displayedCurrentTime}
                        duration={duration}
                        onSeek={handleSeekWithEmit}
                        disabled={disabled || !isController || !audioUrl}
                      />
                    </div>
                  </div>
                )}
              </div>
              {/* Expanded content */}
              <div
                style={{
                  opacity: dragProgress,
                  pointerEvents: dragProgress > 0.5 ? 'auto' : 'none',
                  position: dragProgress < 1 ? 'absolute' : 'relative',
                  width: '100%',
                  top: 0,
                  left: 0,
                  transition: dragging ? 'none' : 'opacity 0.25s',
                }}
              >
                {/* ...expanded view code... */}
                {expanded && (
                  <div className="px-4 py-3 space-y-4 pb-0" style={{ paddingBottom: 0 }}>
                    {/* Header Section */}
                    <div className="space-y-3">
                      {/* Track Title */}
                      <div className="text-center">
                        <TrackInfo
                          title={displayedTitle}
                          animating={animating}
                          direction={direction}
                        />
                      </div>
                      {/* Reformatted metadata row */}
                      <div className="text-[11px] text-neutral-400 truncate flex flex-row flex-wrap gap-x-2 gap-y-0.5 items-center justify-center">
                        {(() => {
                          let artists = currentTrack?.artist;
                          if (Array.isArray(artists)) artists = artists.filter(Boolean);
                          else if (typeof artists === 'string') artists = artists.split(',').map(a => a.trim()).filter(Boolean);
                          else artists = [];
                          const shown = artists.slice(0, 2);
                          return shown.map((a, i) => (
                            <span key={i} className="truncate max-w-[40vw]" title={a}>{a}</span>
                          )).concat(artists.length > 2 ? <span key="more">...</span> : []);
                        })()}
                        {currentTrack?.artist && currentTrack?.album && <span>•</span>}
                        {currentTrack?.album && (
                          <span className="truncate max-w-[40vw]" title={currentTrack.album}>{currentTrack.album}</span>
                        )}
                      </div>
                    </div>

                    {/* Progress Section */}
                    <div className="space-y-2">
                      {/* Time Display */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400 font-mono">{formatTime(displayedCurrentTime)}</span>
                        <span className="text-neutral-400 font-mono">{formatTime(duration)}</span>
                      </div>
                      
                      {/* Progress Bar */}
                      <ProgressBar
                        currentTime={displayedCurrentTime}
                        duration={duration}
                        onSeek={handleSeekWithEmit}
                        disabled={disabled || !isController || !audioUrl}
                      />
                    </div>

                    {/* Controls Section */}
                    <div className="flex items-center justify-between gap-3">
                      {/* Track settings: loop toggle */}
                      <button
                        className={`w-8 h-8 flex items-center justify-center border-none bg-transparent mr-1 p-0 ${loop ? 'text-primary' : 'text-neutral-400 hover:text-primary'}`}
                        onClick={() => setLoop(l => !l)}
                        aria-label={loop ? 'Disable loop' : 'Enable loop'}
                        title={loop ? 'Disable loop' : 'Enable loop'}
                        style={{ boxShadow: 'none' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 1l4 4-4 4" />
                          <path d="M3 11V9a4 4 0 014-4h14" />
                          <path d="M7 23l-4-4 4-4" />
                          <path d="M21 13v2a4 4 0 01-4 4H3" />
                          {loop && <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />}
                        </svg>
                      </button>
                      <PlayerControls
                        isPlaying={isPlaying}
                        onPlay={handlePlay}
                        onPause={handlePause}
                        onNext={handleNext}
                        onPrevious={handlePrevious}
                        canGoNext={canGoNext}
                        canGoPrevious={canGoPrevious}
                        disabled={disabled}
                        isController={isController}
                        audioUrl={audioUrl}
                      />
                      <button
                        className={`w-8 h-8 flex items-center justify-center border-none bg-transparent p-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                          resyncInProgress 
                            ? 'text-blue-500' 
                            : smartResyncSuggestion 
                              ? 'text-orange-400' 
                              : 'text-neutral-400 hover:text-primary'
                        }`}
                        onClick={handleResync}
                        disabled={disabled || !audioUrl || resyncInProgress}
                        aria-label="Re-sync"
                        style={{ boxShadow: 'none' }}
                      >
                        {resyncInProgress ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                            <path d="M21 12a9 9 0 11-6.219-8.56"></path>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                            <path d="M21 3v5h-5"></path>
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                            <path d="M3 21v-5h5"></path>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
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

  // Provide syncQuality and selectedSource for UI display
  const syncQuality = propSyncQuality || { label: 'Unknown', color: 'bg-gray-500', tooltip: 'Sync quality unknown.' };
  const selectedSource = propSelectedSource || 'server';

  return (
    <div className={`audio-player transition-all duration-500 ${audioLoaded.animationClass}`}>
      {/* Only one audio element for desktop, and only if not mobile */}
      {audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          preload="auto"
          onLoadedMetadata={() => {
            // Ensure audio is paused when metadata loads (especially for listeners)
            const audio = audioRef.current;
            if (audio && !isController && !isPlaying) {
              audio.pause();
              setDisplayedCurrentTime(0);
            }
          }}
        />
      )}
      {errorBanner && (
  <ErrorBanner
    message={errorBanner}
    color="#b91c1c"
    onDismiss={() => setErrorBanner(null)}
  />
)}
      {edgeCaseBanner && (
  <ErrorBanner
    message={edgeCaseBanner}
    color="#2563eb"
    onDismiss={() => setEdgeCaseBanner(null)}
    onResync={handleResync}
    showResync={true}
    resyncLabel="Re-sync now"
  />
)}
      {/* Now Playing Section */}
      <div className="bg-neutral-900/50 rounded-lg border border-neutral-800 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center overflow-hidden">
            {currentTrack?.albumArt ? (
              <img
                src={currentTrack.albumArt}
                alt="Album Art"
                className="w-12 h-12 object-cover rounded-lg"
                style={{ minWidth: 48, minHeight: 48 }}
              />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            )}
          </div>
          <div className="flex-1">
            <div className="mb-1 text-white text-base font-semibold min-h-[1.5em] relative flex items-center">
              <TrackInfo
                title={displayedTitle}
                animating={animating}
                direction={direction}
              />
            </div>
            <div className="text-[12px] text-neutral-400 truncate flex flex-row flex-wrap gap-x-2 gap-y-0.5 items-center">
              {(() => {
                let artists = currentTrack?.artist;
                if (Array.isArray(artists)) artists = artists.filter(Boolean);
                else if (typeof artists === 'string') artists = artists.split(',').map(a => a.trim()).filter(Boolean);
                else artists = [];
                const shown = artists.slice(0, 2);
                return shown.map((a, i) => (
                  <span key={i} className="truncate max-w-xs" title={a}>{a}</span>
                )).concat(artists.length > 2 ? <span key="more">...</span> : []);
              })()}
              {currentTrack?.artist && currentTrack?.album && <span>•</span>}
              {currentTrack?.album && (
                <span className="truncate max-w-xs" title={currentTrack.album}>{currentTrack.album}</span>
              )}
            </div>
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
          <div className="relative">
            <div className="h-2 bg-neutral-800 rounded-lg overflow-hidden">
              <div 
                className="h-full bg-white rounded-lg transition-all duration-300"
                style={{ 
                  width: `${isFinite(duration) && duration > 0 ? (displayedCurrentTime / duration) * 100 : 0}%` 
                }}
              />
            </div>
            {/* Custom Thumb */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border border-neutral-300 transition-all duration-200 hover:scale-110"
              style={{ 
                left: `${isFinite(duration) && duration > 0 ? (displayedCurrentTime / duration) * 100 : 0}%`,
                transform: 'translate(-50%, -50%)'
              }}
            />
            <input
              type="range"
              min={0}
              max={isFinite(duration) ? duration : 0}
              step={0.01}
              value={isFinite(displayedCurrentTime) ? displayedCurrentTime : 0}
              onChange={e => handleSeekWithEmit(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={disabled || !isController || !audioUrl}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <PlayerControls
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            onNext={handleNext}
            onPrevious={handlePrevious}
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            disabled={disabled}
            isController={isController}
            audioUrl={audioUrl}
          />
          <div className="text-right">
            <SyncStatusBanner
              status={syncStatus}
              showSmartSuggestion={smartResyncSuggestion}
              syncQuality={syncQuality}
              selectedSource={selectedSource}
              isController={isController}
              resyncStats={resyncStats}
            />
          </div>
        </div>
      </div>
      {import.meta.env.MODE === 'development' && showLatencyCal && (
  <div style={{
    position: 'fixed',
    bottom: 340,
    left: 20,
    zIndex: 10001,
    background: 'rgba(30,30,30,0.97)',
    color: '#fff',
    padding: '16px 22px',
    borderRadius: 10,
    fontSize: 15,
    maxWidth: 340,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
  }}>
    <div style={{fontWeight: 'bold', marginBottom: 8}}>Audio Latency Calibration</div>
    <div>Measured: <b>{audioLatency.toFixed(3)}s</b></div>
    <div>Override: <input type="number" step="0.001" min="0" max="1" value={manualLatency ?? ''} onChange={e => setManualLatency(parseFloat(e.target.value) || 0)} style={{width: 80, marginLeft: 8}} /> s</div>
    <button style={{marginTop: 10, padding: '4px 10px', borderRadius: 6, background: '#444', color: '#fff', border: 'none', cursor: 'pointer'}} onClick={() => { setManualLatency(null); localStorage.removeItem('audioLatencyOverride'); }}>Reset</button>
    <div style={{color:'#aaa', fontSize:12, marginTop:8}}>Press <b>L</b> to toggle this panel.</div>
  </div>
)}
      {import.meta.env.MODE === 'development' && showDriftDebug && (
  <DiagnosticsPanel
    audioLatency={audioLatency}
    manualLatency={manualLatency}
    setManualLatency={setManualLatency}
    resyncStats={resyncStats}
    rtt={rtt}
    jitter={jitter}
    syncQuality={syncQuality}
    selectedSource={selectedSource}
    computedUltraPreciseOffset={canonicalUltraPreciseOffset}
    smoothedOffset={smoothedOffset}
  />
)}
      {import.meta.env.MODE === 'development' && showCalibrateBanner && (
  <LatencyCalBanner
    onCalibrate={() => { setShowCalibrateBanner(false); }}
    onDismiss={() => setShowCalibrateBanner(false)}
  />
)}
    </div>
  );
} 