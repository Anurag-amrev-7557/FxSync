import React, { useEffect, useRef, useState, useCallback } from 'react';
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

const DRIFT_THRESHOLD = 0.15; // seconds (was 0.25)
const PLAY_OFFSET = 0.35; // seconds (350ms future offset for play events)
const DEFAULT_AUDIO_LATENCY = 0.08; // 80ms fallback if not measured
const MICRO_DRIFT_THRESHOLD = 0.04; // seconds (was 0.08)
const MICRO_RATE_CAP = 0.015; // max playbackRate delta (was 0.03, reduced for gentler correction)
const MICRO_CORRECTION_WINDOW = 400; // ms (was 300)
const DRIFT_JITTER_BUFFER = 6; // consecutive drift detections before correction (increased from 4)
const RESYNC_COOLDOWN_MS = 2000; // minimum time between manual resyncs
const RESYNC_HISTORY_SIZE = 5; // number of recent resyncs to track
const SMART_RESYNC_THRESHOLD = 0.3; // drift threshold for smart resync suggestion (was 0.5)
// Micro drift correction constants
const MICRO_DRIFT_MIN = 0.005; // 5ms (was 0.01)
const MICRO_DRIFT_MAX = 0.08;  // 80ms (was 0.15)
const MICRO_RATE_CAP_MICRO = 0.003; // max playbackRate delta for micro-correction
const MIN_BUFFER_AHEAD = 0.5; // seconds, minimum buffer ahead to allow drift correction
const CORRECTION_COOLDOWN = 800; // ms, allow more frequent corrections
// Add at the top, after imports
const BASE_BUFFER_AHEAD = 3; // seconds
const HIGH_LATENCY_BUFFER_AHEAD = 5; // seconds
const HIGH_LATENCY_RTT = 250; // ms
const HIGH_LATENCY_JITTER = 60; // ms

// Add at the top, after imports
let globalAudioContext;
function getAudioContext() {
  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  }
  return globalAudioContext;
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
  socketRef,
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
  const correctionInProgressRef = useRef(false);
  const [displayedCurrentTime, setDisplayedCurrentTime] = useState(0);
  const lastSyncSeq = useRef(-1);
  const [syncReady, setSyncReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Drift correction debug state (move here to ensure defined)
  const [driftCorrectionHistory, setDriftCorrectionHistory] = useState([]);
  const [driftCorrectionCount, setDriftCorrectionCount] = useState(0);
  const [lastCorrectionType, setLastCorrectionType] = useState('none');
  const [bufferedAhead, setBufferedAhead] = useState(0);

  const lastSyncStateTimeRef = useRef(Date.now());
  const lastDriftRef = useRef(0);

  // In the AudioPlayer component, after useState and useRef declarations
  const [bufferReady, setBufferReady] = useState(false);
  const [allClientsReady, setAllClientsReady] = useState(false);
  const [clientReadySent, setClientReadySent] = useState(false);

// --- Drift correction helpers moved inside the component ---
function microCorrectDrift(audio, drift, context = {}, updateDebug) {
  if (!audio) return;
  if (Math.abs(drift) > MICRO_DRIFT_MIN && Math.abs(drift) < MICRO_DRIFT_MAX) {
    let rate = 1 + Math.max(-MICRO_RATE_CAP, Math.min(MICRO_RATE_CAP, drift * 0.5));
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] microCorrectDrift', {
        drift,
        playbackRate: rate,
        jitter: context.jitter,
        audioLatency: context.audioLatency,
        rtt: context.rtt,
        correction: 'micro',
        ...context
      });
    }
    if (typeof updateDebug === 'function') updateDebug('micro', drift, context);
    audio.playbackRate = rate;
    setTimeout(() => {
      audio.playbackRate = 1.0;
    }, MICRO_CORRECTION_WINDOW); // use new constant
  } else {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] microCorrectDrift skipped', {
        drift,
        jitter: context.jitter,
        audioLatency: context.audioLatency,
        rtt: context.rtt,
        correction: 'micro-skip',
        ...context
      });
    }
    if (typeof updateDebug === 'function') updateDebug('micro-skip', drift, context);
    audio.playbackRate = 1.0;
  }
}

function maybeCorrectDrift(audio, expected, context = {}, updateDebug) {
  if (!audio) return;
  const drift = audio.currentTime - expected;
  // Prevent correction if buffer is low
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
  if (bufferAhead < MIN_BUFFER_AHEAD) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] Skipped: buffer ahead too low', { bufferAhead, drift });
    }
    if (typeof updateDebug === 'function') updateDebug('buffer-skip', drift, { ...context, bufferAhead });
    return;
  }
  // Add cooldown after correction
  const now = Date.now();
  if (lastCorrectionRef.current && now - lastCorrectionRef.current < CORRECTION_COOLDOWN) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] Skipped: cooldown active', { lastCorrection: lastCorrectionRef.current, now });
    }
    if (typeof updateDebug === 'function') updateDebug('cooldown-skip', drift, { ...context, bufferAhead });
    return;
  }
  if (Math.abs(drift) > MICRO_DRIFT_MIN && Math.abs(drift) < MICRO_DRIFT_MAX) {
    microCorrectDrift(audio, drift, context, updateDebug);
    lastCorrectionRef.current = now;
    return;
  }
  if (Math.abs(drift) >= MICRO_DRIFT_MAX) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] Hard seek', {
        drift,
        expected,
        current: audio.currentTime,
        jitter: context.jitter,
        audioLatency: context.audioLatency,
        rtt: context.rtt,
        correction: 'seek',
        ...context
      });
    }
    if (typeof updateDebug === 'function') updateDebug('seek', drift, { ...context, bufferAhead });
    setCurrentTimeSafely(audio, expected, (val) => {
      audio.currentTime = val;
    });
    audio.playbackRate = 1.0;
    lastCorrectionRef.current = now;
  } else {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DriftCorrection] No correction needed', {
        drift,
        expected,
        current: audio.currentTime,
        jitter: context.jitter,
        audioLatency: context.audioLatency,
        rtt: context.rtt,
        correction: 'none',
        ...context
      });
    }
    if (typeof updateDebug === 'function') updateDebug('none', drift, { ...context, bufferAhead });
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

    // Buffer monitoring effect
    useEffect(() => {
      const audio = audioRef.current;
      if (!audio || !audio.src) return;
      const checkBuffer = () => {
        const buf = audio.buffered;
        const current = audio.currentTime;
        let bufferAhead = 0;
        for (let i = 0; i < buf.length; i++) {
          if (buf.start(i) <= current && buf.end(i) > current) {
            bufferAhead = buf.end(i) - current;
            break;
          }
        }
        const required = getRequiredBufferAhead();
        if (bufferAhead >= required) {
          setBufferReady(true);
        } else {
          setBufferReady(false);
        }
      };
      audio.addEventListener('progress', checkBuffer);
      audio.addEventListener('timeupdate', checkBuffer);
      // Initial check
      checkBuffer();
      return () => {
        audio.removeEventListener('progress', checkBuffer);
        audio.removeEventListener('timeupdate', checkBuffer);
      };
    }, [audioRef, rtt, jitter]);
  
    // Readiness signaling effect
    useEffect(() => {
      if (bufferReady && !clientReadySent && socket && socket.emit && socket.sessionId) {
        socket.emit('client_ready', { sessionId: socket.sessionId, clientId });
        setClientReadySent(true);
      }
      if (!bufferReady) {
        setClientReadySent(false);
      }
    }, [bufferReady, clientReadySent, socket, clientId]);
  
    // Listen for all_clients_ready event from server
    useEffect(() => {
      if (!socket) return;
      const handler = (data) => {
        setAllClientsReady(!!data?.allReady);
      };
      socket.on('all_clients_ready', handler);
      return () => {
        socket.off('all_clients_ready', handler);
      };
    }, [socket]);
  
    // Only allow playback to start if allClientsReady is true
    // (You may need to gate play/pause/seek UI and auto-play logic with allClientsReady)
    // Example: in handlePlay or auto-play logic, add:
    // if (!allClientsReady) {
    //   setSyncStatus('Waiting for all clients to buffer...');
    //   return;
    // }

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

  useEffect(() => {
    const stableSocket = socketRef?.current || socket;
    if (!stableSocket || !clientId) return;
    const interval = setInterval(() => {
      // If drift is too high, request sync
      if (typeof lastDriftRef.current === 'number' && lastDriftRef.current > DRIFT_THRESHOLD) {
        if (stableSocket.emit) {
          stableSocket.emit('sync_request', { sessionId: stableSocket.sessionId }, () => {});
        }
      }
      // If no sync_state received for 4 seconds, request sync
      if (Date.now() - lastSyncStateTimeRef.current > 4000) {
        if (stableSocket.emit) {
          stableSocket.emit('sync_request', { sessionId: stableSocket.sessionId }, () => {});
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [socketRef, clientId]);

  // Audio event listeners and initialization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const update = () => {
      setCurrentTime(audio.currentTime);
      // Update buffered ahead
      let ahead = 0;
      try {
        const buf = audio.buffered;
        for (let i = 0; i < buf.length; i++) {
          if (audio.currentTime >= buf.start(i) && audio.currentTime <= buf.end(i)) {
            ahead = buf.end(i) - audio.currentTime;
            break;
          }
        }
      } catch (e) {}
      setBufferedAhead(ahead);
    };
    const setDur = () => setDuration(audio.duration || 0);
    const handlePlaying = () => {
      if (playRequestedAt.current) {
        const latency = (getAudioContext().currentTime * 1000 - playRequestedAt.current) / 1000;
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

      // Enhanced: show drift in UI if large
      if (drift > DRIFT_THRESHOLD) {
        driftCountRef.current += 1;
        if (driftCountRef.current >= DRIFT_JITTER_BUFFER) {
          showSyncStatus('Drifted', 1000);
          maybeCorrectDrift(
            audio,
            expected,
            { jitter, audioLatency, rtt, drift },
            (type, driftVal, ctx) => {
              setDriftCorrectionCount(c => c + 1);
              setLastCorrectionType(type);
              setDriftCorrectionHistory(h => [{ type, drift: driftVal, ctx, ts: getAudioContext().currentTime * 1000 }, ...h.slice(0, 9)]);
            }
          );
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
          console.warn('SYNC_STATE: failed to play audio', e);
        });
      } else if (!isPlaying && !audio.paused) {
        audio.pause();
        // Do not seek to correct drift if paused
      }
      setLastSync(Date.now());
      setSyncReady(true);
      lastSyncStateTimeRef.current = Date.now();
      lastDriftRef.current = drift;
    };

    socket.on('sync_state', handleSyncState);

    return () => {
      socket.off('sync_state', handleSyncState);
      if (syncTimeout) clearTimeout(syncTimeout);
      if (resyncTimeout) clearTimeout(resyncTimeout);
    };
  }, [socket, audioLatency, getServerTime, clientId, rtt, smoothedOffset, testLatency, networkLatency]);

  // --- Adaptive Drift Threshold ---
  const adaptiveThreshold = Math.max(0.12, (jitter || 0) * 2, (audioLatency || 0) * 2);

  // Enhanced periodic drift check (for followers)
  useEffect(() => {
    if (!socket || isController || !socket.sessionId) return;

    const audioContext = getAudioContext();
    let lastDrift = 0;
    let lastCorrection = 0;
    let correctionCooldown = 1200; // ms, minimum time between corrections

    const interval = setInterval(() => {
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

        // Use AudioContext clock for precise timing
        const now = audioContext.currentTime * 1000; // ms
        const rttComp = rtt ? rtt / 2000 : 0; // ms to s, one-way
        const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset;
        if (!isFiniteNumber(expected)) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[DriftCheck] Expected is not finite', { expected, state });
          }
          return;
        }

        const syncedNow = audioContext.currentTime * 1000; // ms
        const expectedSynced = state.timestamp + (syncedNow - state.lastUpdated) / 1000 + rttComp + smoothedOffset;
        const drift = Math.abs(audio.currentTime - expectedSynced);

        // Only correct if not in cooldown
        const nowMs = Date.now();
        const canCorrect = nowMs - lastCorrection > correctionCooldown;

        if (drift > adaptiveThreshold) {
          driftCountRef.current += 1;
          lastDrift = drift;

          if (driftCountRef.current >= DRIFT_JITTER_BUFFER && canCorrect) {
            setSyncStatus('Drifted');
            maybeCorrectDrift(
              audio,
              expectedSynced,
              { jitter, audioLatency, rtt, drift },
              (type, driftVal, ctx) => {
                setDriftCorrectionCount(c => c + 1);
                setLastCorrectionType(type);
                setDriftCorrectionHistory(h => [{ type, drift: driftVal, ctx, ts: getAudioContext().currentTime * 1000 }, ...h.slice(0, 9)]);
              }
            );
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
    }, 1200);

    return () => clearInterval(interval);
  }, [socket, isController, getServerTime, audioLatency, clientId, rtt, smoothedOffset, adaptiveThreshold, socket?.sessionId]);

  // --- Heartbeat-based drift correction ---
useEffect(() => {
  if (!socket || !audioRef.current) return;

  const audio = audioRef.current;
  const DRIFT_THRESHOLD_HEARTBEAT = 0.05; // 50ms

  function handleHeartbeat({ isPlaying, timestamp, lastUpdated, controllerId, serverTime, syncSeq }) {
    if (!audio) return;
    if (!isPlaying) return;
    // Use getNow for best time sync
    const now = getNow(getServerTime);
    // Estimate expected playback position
    const expected = timestamp + (now - lastUpdated) / 1000;
    if (!isFiniteNumber(expected)) return;
    const drift = audio.currentTime - expected;
    if (Math.abs(drift) > DRIFT_THRESHOLD_HEARTBEAT) {
      setCurrentTimeSafely(audio, expected, setCurrentTime);
      setSyncStatus('Heartbeat Drift Correction');
      setTimeout(() => setSyncStatus('In Sync'), 600);
      setDriftCorrectionCount(c => c + 1);
      setLastCorrectionType('heartbeat');
      setDriftCorrectionHistory(h => [{ type: 'heartbeat', drift, ts: now }, ...h.slice(0, 9)]);
    }
  }

  socket.on('playback_heartbeat', handleHeartbeat);
  return () => {
    socket.off('playback_heartbeat', handleHeartbeat);
  };
}, [socket, getServerTime]);

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
          playRequestedAt.current = getAudioContext().currentTime * 1000;
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
    playRequestedAt.current = getAudioContext().currentTime * 1000;
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
    let ntpStart = getAudioContext().currentTime * 1000;
    let ntpEnd = ntpStart;
    let ntpSuccess = false;
    // --- Use NTP batch sync for manual resync if available ---
    if (typeof forceNtpBatchSync === 'function') {
      try {
        const result = forceNtpBatchSync();
        if (result && typeof result.then === 'function') {
          await result;
        }
        ntpEnd = getAudioContext().currentTime * 1000;
        ntpSuccess = true;
        setSyncStatus('NTP synced. Fetching state...');
      } catch (e) {
        setSyncStatus('NTP sync failed.');
        setTimeout(() => setSyncStatus('In Sync'), 1500);
        setResyncInProgress(false);
        updateResyncHistory('failed', 0, 'NTP batch sync failed', getAudioContext().currentTime * 1000 - ntpStart);
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
      updateResyncHistory('failed', 0, 'Audio not ready', getAudioContext().currentTime * 1000 - ntpStart);
      return;
    }
    let syncStateStart = getAudioContext().currentTime * 1000;
    socket.emit('sync_request', { sessionId: socket.sessionId, reason: 'manual_resync' }, (state) => {
      let syncStateEnd = getAudioContext().currentTime * 1000;
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
          playRequestedAt.current = getAudioContext().currentTime * 1000;
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

  // Smoothly animate displayedCurrentTime toward audio.currentTime
  useEffect(() => {
    setDisplayedCurrentTime(0); // Immediately reset timer visually on track change
    let raf;
    const animate = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const actual = audio.currentTime;
      setDisplayedCurrentTime(prev => {
        // If the difference is extremely tiny, snap to actual
        if (Math.abs(prev - actual) < 0.005) return actual;
        // Ultra-smooth lerp (smaller factor)
        return prev + (actual - prev) * 0.10;
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
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

  useEffect(() => {
    if (typeof displayedCurrentTime !== 'number' || typeof currentTime !== 'number') return;
    const drift = Math.abs(displayedCurrentTime - currentTime);
    setDriftHistory(prev => {
      const newHistory = [...prev, drift].slice(-PERSISTENT_DRIFT_WINDOW);
      return newHistory;
    });
    // Outlier filtering for persistent drift
    const med = median(driftHistory);
    const deviation = mad(driftHistory, med);
    const filteredDrifts = driftHistory.filter(d => Math.abs(d - med) <= 2 * deviation);
    const now = Date.now();
    if (drift > adaptiveThreshold) {
      persistentDriftCountRef.current += 1;
      if (
        persistentDriftCountRef.current >= PERSISTENT_DRIFT_LIMIT &&
        !autoResyncTriggered &&
        now - lastAutoResyncTime > AUTO_RESYNC_COOLDOWN &&
        filteredDrifts.filter(d => d > adaptiveThreshold).length >= Math.floor(PERSISTENT_DRIFT_WINDOW * 0.7)
      ) {
        setSyncStatus('Auto-resyncing...');
        setAutoResyncTriggered(true);
        setLastAutoResyncTime(now);
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
              timestamp: now,
              threshold: adaptiveThreshold,
              autoResync: true
            }),
            headers: { 'Content-Type': 'application/json' }
          }).catch(() => {});
        }
        persistentDriftCountRef.current = 0;
      }
    } else {
      persistentDriftCountRef.current = 0;
      setAutoResyncTriggered(false);
    }
  }, [displayedCurrentTime, currentTime, adaptiveThreshold, socket, clientId]);

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
    // Album art logic (same as desktop)
    let albumArt = currentTrack?.albumArtUrl;
    const isAbsoluteUrl = (url) => /^https?:\/\//i.test(url) || url?.startsWith('data:');
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
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        albumArt = backendUrl.replace(/\/$/, '') + albumArt;
      } else if (!isAbsoluteUrl(albumArt)) {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        albumArt = backendUrl.replace(/\/$/, '') + '/' + albumArt.replace(/^\//, '');
      }
    } else {
      albumArt = defaultAlbumArt;
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
                <SyncStatus status={syncStatus + (typeof lastDriftRef.current === 'number' ? ` (drift: ${lastDriftRef.current.toFixed(3)}s)` : '')} showIcon={true} />
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
            {/* Album Art and Title for Mobile (side by side) */}
            <div className="flex items-center mb-2 mt-1 gap-3">
              {/* Smoothly transitioning album art */}
              <span
                className="relative w-12 h-12 rounded-lg flex-shrink-0 block"
                style={{ minWidth: 0, minHeight: 0 }}
              >
                {albumArt ? (
                  <img
                    key={albumArt}
                    src={albumArt}
                    alt="Album Art"
                    className={`w-12 h-12 rounded-lg object-cover shadow border border-neutral-800 bg-neutral-800 absolute inset-0 transition-opacity duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${animating ? 'opacity-0' : 'opacity-100'}`}
                    style={{
                      minWidth: 0,
                      minHeight: 0,
                      zIndex: 2,
                    }}
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center absolute inset-0 z-2">
                    {/* Fallback icon if no album art */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#52525b" strokeWidth="2" fill="transparent" />
                      <polygon points="9 8 17 12 9 16 9 8" fill="#a3a3a3" />
                      <circle cx="12" cy="12" r="2.5" fill="#fff" opacity="0.7" />
                    </svg>
                  </div>
                )}
              </span>
              <span
                className={`inline-block text-md font-semibold text-white transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
                  ${animating && direction === 'up' ? 'opacity-0 translate-x-6 scale-95' : ''}
                  ${animating && direction === 'down' ? 'opacity-0 -translate-x-6 scale-95' : ''}
                  ${!animating ? 'opacity-100 translate-x-0 scale-100' : ''}
                `}
                style={{
                  willChange: 'opacity, transform',
                  transitionProperty: 'opacity, transform',
                  minHeight: '3em',
                  display: 'flex',
                  alignItems: 'center',
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

  // Helper to determine required buffer ahead
  function getRequiredBufferAhead() {
    if ((rtt && rtt > HIGH_LATENCY_RTT) || (jitter && jitter > HIGH_LATENCY_JITTER)) {
      return HIGH_LATENCY_BUFFER_AHEAD;
    }
    return BASE_BUFFER_AHEAD;
  }

  return (
    <>
      {!mobile && (
        <div className="flex items-center justify-between mb-3 px-2">
          <div className="flex items-center">
            <SyncStatus status={syncStatus + (typeof lastDriftRef.current === 'number' ? ` (drift: ${lastDriftRef.current.toFixed(3)}s)` : '')} showIcon={true} />
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