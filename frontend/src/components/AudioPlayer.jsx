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

const DRIFT_THRESHOLD = 0.12; // seconds (was 0.3)
const PLAY_OFFSET = 0.35; // seconds (350ms future offset for play events)
const DEFAULT_AUDIO_LATENCY = 0.08; // 80ms fallback if not measured
const MICRO_DRIFT_THRESHOLD = 0.04; // seconds (was 0.08)
const MICRO_RATE_CAP = 0.03; // max playbackRate delta (was 0.07)
const MICRO_CORRECTION_WINDOW = 250; // ms (was 420)
const DRIFT_JITTER_BUFFER = 2; // consecutive drift detections before correction
const RESYNC_COOLDOWN_MS = 2000; // minimum time between manual resyncs
const RESYNC_HISTORY_SIZE = 5; // number of recent resyncs to track
const SMART_RESYNC_THRESHOLD = 0.5; // drift threshold for smart resync suggestion
const MICRO_DRIFT_MIN = 0.01; // 10ms
const MICRO_DRIFT_MAX = 0.1;  // 100ms
const MICRO_RATE_CAP_MICRO = 0.003; // max playbackRate delta for micro-correction

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
      audio.src = audio.src + (audio.src.includes('?') ? '&' : '?') + 'forceReload=' + Date.now();
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
  const [lastSync, setLastSync] = useState(Date.now());
  const audioRef = useRef(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [audioLatency, setAudioLatency] = useState(DEFAULT_AUDIO_LATENCY); // measured latency in seconds
  const playRequestedAt = useRef(null);
  const lastCorrectionRef = useRef(0);
  const CORRECTION_COOLDOWN = 1500; // ms
  const correctionInProgressRef = useRef(false);
  const [displayedCurrentTime, setDisplayedCurrentTime] = useState(0);

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
      console.log('AudioPlayer: Setting audioUrl to', url);
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
    
    const update = () => setCurrentTime(audio.currentTime);
    const setDur = () => setDuration(audio.duration || 0);
    const handlePlaying = () => {
      if (playRequestedAt.current) {
        const latency = (Date.now() - playRequestedAt.current) / 1000;
        setAudioLatency(latency);
        playRequestedAt.current = null;
      }
    };
    
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('durationchange', setDur);
    audio.addEventListener('playing', handlePlaying);
    
    return () => {
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('durationchange', setDur);
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
      if (drift > DRIFT_THRESHOLD) {
        driftCountRef.current += 1;
        if (driftCountRef.current >= DRIFT_JITTER_BUFFER) {
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
      setLastSync(Date.now());
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

    let lastDrift = 0;
    let lastCorrection = 0;
    let correctionCooldown = 1200; // ms, minimum time between corrections

    const interval = setInterval(() => {
      // Defensive check: only emit if sessionId is set
      if (!socket.sessionId) {
        if (process.env.NODE_ENV === 'development') {
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
          if (process.env.NODE_ENV === 'development') {
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
          if (process.env.NODE_ENV === 'development') {
            console.warn('[DriftCheck] Expected is not finite', { expected, state });
          }
          return;
        }

        const syncedNow = getNow(getServerTime);
        const expectedSynced = state.timestamp + (syncedNow - state.lastUpdated) / 1000 + rttComp + smoothedOffset;
        const drift = Math.abs(audio.currentTime - expectedSynced);

        // Enhanced: log drift only if significant or in dev
        if (drift > DRIFT_THRESHOLD || process.env.NODE_ENV === 'development') {
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

        if (drift > DRIFT_THRESHOLD) {
          driftCountRef.current += 1;
          lastDrift = drift;

          if (driftCountRef.current >= DRIFT_JITTER_BUFFER && canCorrect) {
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
          if (driftCountRef.current > 0 && process.env.NODE_ENV === 'development') {
            console.log('[DriftCheck] Drift back in threshold, resetting counter');
          }
          driftCountRef.current = 0;
          setSyncStatus('In Sync');
        }
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [socket, isController, getServerTime, audioLatency, clientId, rtt, smoothedOffset]);

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
          setLastSync(Date.now());
          return;
        }

        // Defensive: check for negative/NaN/absurd timestamps
        if (state.timestamp < 0 || state.lastUpdated < 0) {
          warn('Sync state has negative timestamp(s)', { state });
          audio.pause();
          setCurrentTimeSafely(audio, 0, setCurrentTime);
          setIsPlaying(false);
          setLastSync(Date.now());
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
          playRequestedAt.current = Date.now();
          // Defensive: try/catch for play() (may throw in some browsers)
          audio.play().catch((err) => {
            warn('audio.play() failed on sync_request', err);
          });
        } else {
          // Ensure audio is definitely paused and reset to the expected time
          audio.pause();
          setCurrentTimeSafely(audio, safeExpected, setCurrentTime);
        }
        setLastSync(Date.now());
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
    playRequestedAt.current = Date.now();
    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        await playPromise;
      }
      setIsPlaying(true);
      emitPlay();
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[AudioPlayer][handlePlay] Play triggered successfully');
      }
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

    setCurrentTimeSafely(audio, time, setCurrentTime);
    emitSeek(time);

    // If the user seeks while paused, update UI immediately
    if (audio.paused) {
      setCurrentTime(time);
    }

    setTimeout(() => setIsSeeking(false), 200);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('[AudioPlayer][handleSeek] Seeked to', time);
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

  // --- Production logging for drift corrections ---
  function logDriftCorrection(type, drift) {
    if (process.env.NODE_ENV === 'production') {
      fetch('/log/drift', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          drift,
          correctionType: type,
          timestamp: Date.now()
        }),
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {});
    }
  }

  // --- Trigger resync on tab focus or network reconnect ---
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && typeof socket?.triggerResync === 'function') {
        socket.triggerResync();
      }
    }
    function handleOnline() {
      if (typeof socket?.triggerResync === 'function') {
        socket.triggerResync();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [socket]);

  /**
   * Attempts to correct audio drift by seeking to the expected time.
   * Enhanced: 
   *   - Adds detailed logging (dev only)
   *   - Handles edge cases (audio not ready, expected not finite)
   *   - Optionally fires a custom event for analytics/debugging
   *   - Returns an object with status and details
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
    correctionInProgressRef.current = true;

    // Only correct if audio is playing (never pause to correct drift)
    if (!audio.paused) {
      const before = audio.currentTime;
      const drift = expected - before;
      // --- Log drift correction ---
      if (Math.abs(drift) > 0.01) {
        logDriftCorrection(Math.abs(drift) < MICRO_DRIFT_THRESHOLD ? 'playbackRate' : 'seek', drift);
      }
      // Ultra-micro-correction for very small drifts
      if (Math.abs(drift) < MICRO_DRIFT_THRESHOLD) {
        // Calculate a very gentle playbackRate adjustment (ultra-micro)
        const rate = 1 + Math.max(-MICRO_RATE_CAP, Math.min(MICRO_RATE_CAP, drift * 0.7));
        audio.playbackRate = rate;
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('[DriftCorrection] Ultra-micro-correcting with playbackRate', rate, 'for drift', drift);
        }
        setTimeout(() => {
          audio.playbackRate = 1;
          correctionInProgressRef.current = false;
        }, MICRO_CORRECTION_WINDOW); // ultra-micro correction window
        return { corrected: true, micro: true, before, after: expected, drift, rate };
      } else {
        setCurrentTimeSafely(audio, expected, setCurrentTime);
        lastCorrectionRef.current = now;
        // Enhanced: fire a custom event for debugging/analytics
        if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
          try {
            window.dispatchEvent(
              new CustomEvent('audio-drift-corrected', {
                detail: {
                  before,
                  after: expected,
                  at: now,
                  src: audio.currentSrc,
                },
              })
            );
          } catch (e) {
            // ignore
          }
        }
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log(
            '[DriftCorrection] Seeked to',
            expected,
            'from',
            before,
            'at',
            now,
            '| src:',
            audio.currentSrc
          );
        }
        setTimeout(() => {
          audio.playbackRate = 1;
          correctionInProgressRef.current = false;
        }, 500); // allow some time for audio to stabilize
        return { corrected: true, before, after: expected, at: now };
      }
    } else {
      correctionInProgressRef.current = false;
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[DriftCorrection] Audio is paused, not correcting drift');
      }
      return { corrected: false, reason: 'paused' };
    }
  }

  // --- Monitor and auto-resync for high drift ---
  useEffect(() => {
    if (typeof displayedCurrentTime !== 'number' || typeof duration !== 'number') return;
    const drift = Math.abs(displayedCurrentTime - currentTime);
    if (drift > 0.5 && typeof socket?.triggerResync === 'function') {
      setSyncStatus('High drift detected! Auto-resyncing...');
      socket.triggerResync();
    }
  }, [displayedCurrentTime, currentTime, socket]);

  // --- Debug panel for latency, offset, RTT, drift (dev only) ---
  const debugPanel = process.env.NODE_ENV !== 'production' ? (
    <div className="text-xs text-neutral-400 mt-2 p-2 bg-neutral-900/80 rounded-lg border border-neutral-800">
      <div>Audio Latency: {audioLatency ? (audioLatency * 1000).toFixed(1) : 'N/A'} ms</div>
      <div>Time Offset: {typeof smoothedOffset === 'number' ? smoothedOffset.toFixed(1) : 'N/A'} ms</div>
      <div>RTT: {rtt ? rtt.toFixed(1) : 'N/A'} ms</div>
      <div>Last Drift: {typeof displayedCurrentTime === 'number' && typeof currentTime === 'number' ? (displayedCurrentTime - currentTime).toFixed(3) : 'N/A'} s</div>
    </div>
  ) : null;

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
                  setCurrentTime(0);
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
              onChange={handleSeek}
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
          {debugPanel}
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
        {debugPanel}
      </div>
    </div>
  );
} 