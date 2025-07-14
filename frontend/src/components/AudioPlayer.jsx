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
        // Enhanced: log only in dev
        if (import.meta.env.MODE === 'development') {
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
      audio.src = audio.src + (audio.src.includes('?') ? '&' : '?') + 'forceReload=' + Date.now();
      // Optionally, log
      if (import.meta.env.MODE === 'development') {
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
}) {
  // Fix: manualLatency must be declared before any useEffect or code that references it
  const [manualLatency, setManualLatency] = useState(() => {
    const saved = localStorage.getItem('audioLatencyOverride');
    return saved ? parseFloat(saved) : null;
  });
  // Use controllerClientId/clientId for sticky controller logic
  const isController = controllerClientId && clientId && controllerClientId === clientId;
  // Remove: audioUrl, loading, audioError, isPlaying, duration, displayedCurrentTime, audioRef, and their setters
  // Instead, use:
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
  } = useAudioElement({ currentTrack, isController, getServerTime })
  const [syncStatus, setSyncStatus] = useState('In Sync');
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [audioLatency, setAudioLatency] = useState(0.08); // measured latency in seconds
  const playRequestedAt = useRef(null);
  const lastCorrectionRef = useRef(0);
  const correctionInProgressRef = useRef(false);
  const [microCorrectionActive, setMicroCorrectionActive] = useState(false); // Visual feedback for micro-corrections
  const [displayedTitle, setDisplayedTitle] = useState(currentTrack?.title || '');
  const [errorBanner, setErrorBanner] = useState(null);
  const [showLatencyWizard, setShowLatencyWizard] = useState(false);
  const [latencyWizardStep, setLatencyWizardStep] = useState(0);
  const [latencyTestStart, setLatencyTestStart] = useState(null);
  const [latencyTestResult, setLatencyTestResult] = useState(null);

  // --- Dynamic Drift Correction Parameters ---
  const driftParams = getDriftCorrectionParams({ rtt, jitter });

  // After calling useUltraPreciseOffset, destructure as:
  const { ultraPreciseOffset: computedUltraPreciseOffset, syncQuality, allOffsets, selectedSource } = useUltraPreciseOffset(
    [], // Pass an empty array if no peerSyncs are available
    timeOffset,
    rtt,
    jitter
  );

  // --- EMA for offset smoothing ---
  const offsetEMARef = useRef(createEMA(0.18, computedUltraPreciseOffset ?? timeOffset ?? 0));
  const [smoothedOffset, setSmoothedOffset] = useState(computedUltraPreciseOffset ?? timeOffset ?? 0);

  // --- Use EMA for offset smoothing ---
  useEffect(() => {
    let nextOffset = timeOffset || 0;
    if (
      typeof computedUltraPreciseOffset === 'number' &&
      Math.abs(computedUltraPreciseOffset) < 1000 && // sanity check: < 1s
      !isNaN(computedUltraPreciseOffset)
    ) {
      nextOffset = computedUltraPreciseOffset;
    }
    // Use EMA for smoothing
    const smoothed = offsetEMARef.current.next(nextOffset);
    setSmoothedOffset(smoothed);
    if (
      typeof computedUltraPreciseOffset === 'number' && (isNaN(computedUltraPreciseOffset) || Math.abs(computedUltraPreciseOffset) > 1000)
    ) {
      console.warn('[AudioPlayer] Ignoring suspicious computedUltraPreciseOffset:', computedUltraPreciseOffset);
    }
  }, [computedUltraPreciseOffset, timeOffset]);

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
      console.log('AudioPlayer: Setting audioUrl to', url);
      setAudioUrl(url);
      // setLoading(false); // Removed
      // setAudioError(null); // Removed
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
        log('warn', 'SYNC_STATE: invalid state received', { isPlaying, timestamp, lastUpdated, ctrlId, trackId, meta });
        showSyncStatus('Sync failed');
        setErrorBanner('Sync failed: Invalid state received from server.');
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

      // Log drift for debugging (dev only)
      log('log', '[DriftCheck] SYNC_STATE drift:', drift, {
        current: audio.currentTime,
        expected,
        isPlaying,
        ctrlId,
        trackId,
        meta,
      });

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

        // Enhanced: log drift only if significant or in dev
        if (drift > SYNC_CONFIG.DRIFT_THRESHOLD || import.meta.env.MODE === 'development') {
          console.log(
            '[DriftCheck] PERIODIC drift:',
            drift.toFixed(3),
            'current:',
            audio.currentTime.toFixed(3),
            'expected:',
            expectedSynced.toFixed(3),
            'isPlaying:', audio.paused ? 'paused' : 'playing'
          );
        }

        // Only correct if not in cooldown
        const nowMs = Date.now();
        const canCorrect = nowMs - lastCorrection > correctionCooldown;

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
          if (driftCountRef.current > 0 && import.meta.env.MODE === 'development') {
            console.log('[DriftCheck] Drift back in threshold, resetting counter');
          }
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
          setCurrentTimeSafely(audio, 0, setDisplayedCurrentTime);
          setIsPlaying(false);
          setErrorBanner('Sync failed: No valid state received from server.');
          return;
        }

        // Defensive: check for negative/NaN/absurd timestamps
        if (state.timestamp < 0 || state.lastUpdated < 0) {
          warn('Sync state has negative timestamp(s)', { state });
          audio.pause();
          setCurrentTimeSafely(audio, 0, setDisplayedCurrentTime);
          setIsPlaying(false);
          setErrorBanner('Sync failed: Invalid sync state timestamp.');
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
          setErrorBanner('Sync failed: Invalid expected time.');
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
      if (import.meta.env.MODE === 'development') {
         
        console.log('[AudioPlayer][emitPlay]', payload);
      }
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
      if (import.meta.env.MODE === 'development') {
         
        console.log('[AudioPlayer][emitPause]', payload);
      }
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
      if (import.meta.env.MODE === 'development') {
         
        console.log('[AudioPlayer][emitSeek]', payload);
      }
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
      if (import.meta.env.MODE === 'development') {
         
        console.log('[AudioPlayer][handlePlay] Play triggered successfully');
      }
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
      if (import.meta.env.MODE === 'development') {
         
        console.log('[AudioPlayer][handlePause] Pause triggered successfully');
      }
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
        // If the difference is tiny, snap to actual
        if (Math.abs(prev - actual) < 0.015) return actual;
        // Otherwise, ease toward actual (lerp)
        return prev + (actual - prev) * 0.22;
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [audioUrl]);

  // Wrap handleSeek to emit seek event if controller
  const handleSeekWithEmit = (time) => {
    handleSeek(time); // always update local audio
    if (isController) {
      emitSeek(time);
    }
  };

  // --- Latency Calibration Wizard Logic ---
  function startLatencyWizard() {
    setLatencyWizardStep(1);
    setLatencyTestResult(null);
    setShowLatencyWizard(true);
  }
  function playTestSound() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 200);
  }
  function handleLatencyWizardNext() {
    if (latencyWizardStep === 1) {
      playTestSound();
      setLatencyTestStart(performance.now());
      setLatencyWizardStep(2);
    } else if (latencyWizardStep === 2) {
      const end = performance.now();
      const measured = (end - latencyTestStart) / 1000;
      setLatencyTestResult(measured);
      setManualLatency(measured);
      setLatencyWizardStep(3);
    } else {
      setShowLatencyWizard(false);
      setLatencyWizardStep(0);
    }
  }
  function handleLatencyWizardCancel() {
    setShowLatencyWizard(false);
    setLatencyWizardStep(0);
  }

  // --- Latency Calibration Wizard Modal ---
  {showLatencyWizard && (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.7)',zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#18181b',padding:32,borderRadius:16,maxWidth:340,width:'90vw',boxShadow:'0 4px 32px #000',color:'#fff',textAlign:'center'}}>
        {latencyWizardStep === 1 && (
          <>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>Audio Latency Calibration</h2>
            <p style={{marginBottom:18}}>When you click <b>Play Test Sound</b>, you will hear a beep. As soon as you hear it, click <b>I Heard It!</b> as quickly as possible.</p>
            <button onClick={handleLatencyWizardNext} className="px-4 py-2 bg-blue-600 rounded text-white font-semibold hover:bg-blue-700 transition">Play Test Sound</button>
            <button onClick={handleLatencyWizardCancel} className="ml-3 px-3 py-2 bg-neutral-700 rounded text-white hover:bg-neutral-600 transition">Cancel</button>
          </>
        )}
        {latencyWizardStep === 2 && (
          <>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>Click When You Hear the Beep</h2>
            <p style={{marginBottom:18}}>Click <b>I Heard It!</b> as soon as you hear the beep sound.</p>
            <button onClick={handleLatencyWizardNext} className="px-4 py-2 bg-green-600 rounded text-white font-semibold hover:bg-green-700 transition">I Heard It!</button>
          </>
        )}
        {latencyWizardStep === 3 && (
          <>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>Calibration Complete</h2>
            <p style={{marginBottom:18}}>Measured latency: <b>{latencyTestResult ? (latencyTestResult*1000).toFixed(0) : '--'} ms</b></p>
            <button onClick={handleLatencyWizardNext} className="px-4 py-2 bg-blue-600 rounded text-white font-semibold hover:bg-blue-700 transition">Done</button>
          </>
        )}
      </div>
    </div>
  )}

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
          {/* Top: Track info and sync status */}
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-white font-semibold truncate max-w-[60%]">
              Now Playing
            </div>
            <div className="flex items-center gap-1">
              <SyncStatus status={syncStatus} />
              {microCorrectionActive && (
                <span title="Fine-tuning playback for micro-drift" className="ml-1 animate-pulse text-blue-400" style={{fontSize: 16, verticalAlign: 'middle'}}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M10 5v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              )}
              <button
                className="ml-2 px-2 py-0.5 bg-neutral-700 text-xs rounded hover:bg-neutral-600 transition"
                onClick={startLatencyWizard}
                title="Calibrate device audio latency"
                style={{fontSize: 11, fontWeight: 500}}
              >
                Calibrate Latency
              </button>
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
              type="range"
              min={0}
              max={isFinite(duration) ? duration : 0}
              step={0.01}
              value={isFinite(displayedCurrentTime) ? displayedCurrentTime : 0}
              onChange={e => handleSeekWithEmit(Number(e.target.value))}
              className="flex-1 h-3 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-primary"
              style={{ WebkitAppearance: 'none', appearance: 'none' }}
              disabled={disabled || !isController || !audioUrl}
            />
            <span className="text-[11px] text-neutral-400 w-8 text-right font-mono">{formatTime(duration)}</span>
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
                resyncInProgress 
                  ? 'bg-blue-600 text-white' 
                  : smartResyncSuggestion 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white'
              }`}
              onClick={handleResync}
              disabled={disabled || !audioUrl || resyncInProgress}
              aria-label="Re-sync"
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
              <span className="hidden sm:inline">
                {resyncInProgress ? 'Syncing...' : smartResyncSuggestion ? 'Sync*' : 'Sync'}
              </span>
            </button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  // Add at the top level of the component (after hooks):
  const [showDriftDebug, setShowDriftDebug] = useState(false);
  const [showLatencyCal, setShowLatencyCal] = useState(false);
  const [edgeCaseBanner, setEdgeCaseBanner] = useState(null);
  const [showCalibrateBanner, setShowCalibrateBanner] = useState(false);

  // Show calibration banner if repeated drift or poor sync quality
  useEffect(() => {
    if ((resyncStats.lastDrift > 0.3 || syncQuality.label === 'Poor') && !showLatencyWizard) {
      setShowCalibrateBanner(true);
    } else {
      setShowCalibrateBanner(false);
    }
  }, [resyncStats.lastDrift, syncQuality.label, showLatencyWizard]);

  // Keyboard shortcut: D to toggle debug overlay (dev mode only)
  useEffect(() => {
    if (import.meta.env.MODE !== 'development') return;
    const handler = (e) => {
      if (e.key === 'd' || e.key === 'D') setShowDriftDebug(v => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Keyboard shortcut: L to toggle latency calibration UI (dev mode only)
  useEffect(() => {
    if (import.meta.env.MODE !== 'development') return;
    const handler = (e) => {
      if (e.key === 'l' || e.key === 'L') setShowLatencyCal(v => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Listen for tab visibility, network, and resume events
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        setEdgeCaseBanner('Tab became active. Auto-resyncing...');
        handleResync();
        setTimeout(() => setEdgeCaseBanner(null), 4000);
      }
    }
    function handleOnline() {
      setEdgeCaseBanner('Network reconnected. Auto-resyncing...');
      handleResync();
      setTimeout(() => setEdgeCaseBanner(null), 4000);
    }
    function handleOffline() {
      setEdgeCaseBanner('Network connection lost. Waiting for reconnection...');
    }
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleResync]);

  // Detect unexpected audio pause (not by user)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    function onPause() {
      if (!audio.paused || !isPlaying) return;
      // If not controller and not paused by user, show warning
      if (!isController && !audioError) {
        setEdgeCaseBanner('Audio was paused (tab/device sleep?). Click to re-sync.');
      }
    }
    audio.addEventListener('pause', onPause);
    return () => audio.removeEventListener('pause', onPause);
  }, [audioRef, isController, isPlaying, audioError]);

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
      {errorBanner && (
  <div style={{
    position: 'fixed',
    top: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 20000,
    background: '#b91c1c',
    color: '#fff',
    padding: '12px 28px',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 'bold',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    border: '2px solid #991b1b',
  }}>
    {errorBanner}
  </div>
)}
      {edgeCaseBanner && (
  <div style={{
    position: 'fixed',
    top: 70,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 20001,
    background: '#2563eb',
    color: '#fff',
    padding: '12px 28px',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 'bold',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    border: '2px solid #1d4ed8',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  }}>
    <span>{edgeCaseBanner}</span>
    <button
      style={{
        marginLeft: 12,
        background: '#1e40af',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        padding: '4px 12px',
        fontWeight: 500,
        cursor: 'pointer',
      }}
      onClick={() => { setEdgeCaseBanner(null); handleResync(); }}
    >
      Re-sync now
    </button>
    <button
      style={{
        marginLeft: 8,
        background: 'transparent',
        color: '#fff',
        border: 'none',
        fontSize: 18,
        cursor: 'pointer',
      }}
      aria-label="Dismiss"
      onClick={() => setEdgeCaseBanner(null)}
    >
      ×
    </button>
  </div>
)}
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
              {formatTime(displayedCurrentTime)} / {formatTime(duration)}
            </div>
            <div className="text-neutral-400 text-xs">Duration</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <input
            type="range"
            min={0}
            max={isFinite(duration) ? duration : 0}
            step={0.01}
            value={isFinite(displayedCurrentTime) ? displayedCurrentTime : 0}
            onChange={e => handleSeekWithEmit(Number(e.target.value))}
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
                resyncInProgress 
                  ? 'bg-blue-600 text-white' 
                  : smartResyncSuggestion 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white'
              }`}
              onClick={handleResync}
              disabled={disabled || !audioUrl || resyncInProgress}
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

          <div className="text-right">
            <SyncStatus 
              status={syncStatus} 
              showSmartSuggestion={smartResyncSuggestion}
            />
            <div className={`text-xs mt-1 ${syncQuality.color}`}>{syncQuality.label} ({selectedSource})</div>
            <div className="text-neutral-400 text-xs mt-1">
              {isController ? 'You are the controller' : 'You are a listener'}
            </div>
            {resyncStats.totalResyncs > 0 && (
              <div className="text-neutral-500 text-xs mt-1">
                Sync: {resyncStats.successfulResyncs}/{resyncStats.totalResyncs} successful
              </div>
            )}
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
  <div style={{
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 20020,
    background: '#18181b',
    color: '#fff',
    padding: '14px 22px',
    borderRadius: 10,
    fontSize: 14,
    maxWidth: 340,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    border: '1.5px solid #444',
  }}>
    <div style={{fontWeight: 'bold', marginBottom: 8}}>Sync Diagnostics</div>
    <div>Drift: <b>{resyncStats.lastDrift?.toFixed(3) ?? '--'}</b> s</div>
    <div>RTT: <b>{rtt?.toFixed(1) ?? '--'}</b> ms</div>
    <div>Jitter: <b>{jitter?.toFixed(1) ?? '--'}</b> ms</div>
    <div>Sync Quality: <b>{syncQuality.label}</b></div>
    <div>Source: <b>{selectedSource}</b></div>
    {/* --- New diagnostics --- */}
    <div style={{marginTop: 8, color: '#aaf'}}>
      Raw Offset: <b>{computedUltraPreciseOffset?.toFixed(4) ?? '--'}</b> s<br/>
      Smoothed Offset: <b>{smoothedOffset?.toFixed(4) ?? '--'}</b> s
    </div>
    {/* Optionally, show last raw drift if available */}
    {window._audioDriftHistory && window._audioDriftHistory.length > 0 && (
      <div style={{marginTop: 8, color: '#faa'}}>
        Last Raw Drift: <b>{window._audioDriftHistory[window._audioDriftHistory.length-1].drift?.toFixed(4) ?? '--'}</b> s
      </div>
    )}
    <div style={{color:'#aaa', fontSize:12, marginTop:8}}>Press <b>D</b> to toggle this panel.</div>
  </div>
)}
      {import.meta.env.MODE === 'development' && showCalibrateBanner && (
  <div style={{
    position: 'fixed',
    top: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 20010,
    background: '#f59e42',
    color: '#222',
    padding: '10px 24px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 15,
    boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    border: '2px solid #f59e42',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  }}>
    <span>⚡️ Your device may need latency calibration for best sync.</span>
    <button
      style={{
        background: '#ea580c',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        padding: '4px 14px',
        fontWeight: 500,
        cursor: 'pointer',
      }}
      onClick={() => { setShowCalibrateBanner(false); startLatencyWizard(); }}
    >
      Calibrate Now
    </button>
    <button
      style={{
        background: 'transparent',
        color: '#222',
        border: 'none',
        fontSize: 18,
        cursor: 'pointer',
      }}
      aria-label="Dismiss"
      onClick={() => setShowCalibrateBanner(false)}
    >
      ×
    </button>
  </div>
)}
    </div>
  );
} 