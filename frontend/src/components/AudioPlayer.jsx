import React, { useEffect, useRef, useState } from 'react';
import SyncStatus from './SyncStatus';
import useSmoothAppearance from '../hooks/useSmoothAppearance';
import LoadingSpinner from './LoadingSpinner';

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

const DRIFT_THRESHOLD = 0.13; // seconds (tighter, robust to jitter)
const PLAY_OFFSET = 0.35; // seconds (350ms future offset for play events)
const DEFAULT_AUDIO_LATENCY = 0.08; // 80ms fallback if not measured

function isFiniteNumber(n) {
  return typeof n === 'number' && isFinite(n);
}

function setCurrentTimeSafely(audio, value, setCurrentTime) {
  const logContext = { value, readyState: audio ? audio.readyState : null, duration: audio ? audio.duration : null };
  
  // Early return if value is not finite
  if (!isFiniteNumber(value)) {
    console.warn('setCurrentTimeSafely: value is not finite', logContext);
    return;
  }
  
  // Early return if audio element doesn't exist
  if (!audio) {
    console.warn('setCurrentTimeSafely: audio element not available', logContext);
    return;
  }
  
  if (
    audio.readyState >= 1 &&
    audio.duration &&
    isFinite(audio.duration)
  ) {
    try {
      console.log('Setting currentTime immediately', logContext);
      audio.currentTime = value;
      setCurrentTime(value);
    } catch (e) {
      console.warn('Failed to set currentTime immediately:', logContext, e);
    }
  } else {
    console.log('Defer setCurrentTime: audio not ready yet (this is normal during initialization)', logContext);
    const onLoaded = () => {
        const context = { value, readyState: audio.readyState, duration: audio.duration };
        if (audio.duration && isFinite(audio.duration)) {
          try {
            console.log('Setting currentTime after loadedmetadata', context);
            audio.currentTime = value;
            setCurrentTime(value);
          } catch (e) {
            console.warn('Failed to set currentTime after loadedmetadata:', context, e);
          }
        } else {
          console.warn('Still not ready after loadedmetadata', context);
        }
        audio.removeEventListener('loadedmetadata', onLoaded);
    };
      audio.addEventListener('loadedmetadata', onLoaded);
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

  // Use controllerClientId/clientId for sticky controller logic
  const isController = controllerClientId && clientId && controllerClientId === clientId;
  
  // Smooth appearance hooks for loading states and status changes
  const audioLoaded = useSmoothAppearance(!loading && !audioError, 200, 'animate-fade-in-slow');
  const syncStatusVisible = useSmoothAppearance(syncStatus !== 'In Sync', 100, 'animate-bounce-in');

  // Modern smooth transition for track title (single element, fade/slide/scale)
  const [displayedTitle, setDisplayedTitle] = useState(currentTrack?.title || '');
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState('up');

  // Jitter buffer: only correct drift if sustained for N checks
  const DRIFT_JITTER_BUFFER = 1; // number of consecutive drift detections required
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
      setLoading(false);
      setAudioError(null);
    }
  }, [currentTrack]);

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

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;
    // Sync state from backend
    const handleSyncState = ({ isPlaying, timestamp, lastUpdated, controllerId: ctrlId }) => {
      // Defensive: check for valid timestamp and lastUpdated
      if (
        typeof timestamp !== 'number' ||
        typeof lastUpdated !== 'number' ||
        !isFinite(timestamp) ||
        !isFinite(lastUpdated)
      ) {
        console.warn('SYNC_STATE: invalid state received', { isPlaying, timestamp, lastUpdated, ctrlId });
        setSyncStatus('Sync failed');
        setTimeout(() => setSyncStatus('In Sync'), 1200);
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      // Calculate expected time
      const now = getServerTime ? getServerTime() : Date.now();
      // Compensate for measured audio latency
      const expected = timestamp + (now - lastUpdated) / 1000 - audioLatency;
      if (!isFiniteNumber(expected)) {
        console.warn('SYNC_STATE: expected is not finite', { expected, timestamp, lastUpdated, now });
        setSyncStatus('Sync failed');
        setTimeout(() => setSyncStatus('In Sync'), 1200);
        return;
      }
      const drift = Math.abs(audio.currentTime - expected);
      if (drift > DRIFT_THRESHOLD) {
        driftCountRef.current += 1;
        if (driftCountRef.current >= DRIFT_JITTER_BUFFER) {
          setSyncStatus('Drifted');
          setCurrentTimeSafely(audio, expected, setCurrentTime);
          setSyncStatus('Re-syncing...');
          setTimeout(() => setSyncStatus('In Sync'), 800);
          // Advanced: trigger immediate time sync if available
          if (typeof socket?.forceTimeSync === 'function') {
            socket.forceTimeSync();
          }
          // Report drift to server for diagnostics/adaptive correction
          if (socket && socket.emit && socket.sessionId && typeof drift === 'number') {
            socket.emit('drift_report', {
              sessionId: socket.sessionId,
              drift,
              clientId,
              timestamp: Date.now()
            });
          }
          driftCountRef.current = 0;
        }
      } else {
        driftCountRef.current = 0;
        setSyncStatus('In Sync');
      }
      setIsPlaying(isPlaying);
      if (isPlaying) {
        playRequestedAt.current = Date.now();
        audio.play();
      } else {
        // Ensure audio is definitely paused and reset to the expected time
        audio.pause();
        setCurrentTimeSafely(audio, expected, setCurrentTime);
      }
      setLastSync(Date.now());
    };
    socket.on('sync_state', handleSyncState);
    return () => {
      socket.off('sync_state', handleSyncState);
    };
  }, [socket]);

  // Periodic drift check (for followers)
  useEffect(() => {
    if (!socket || isController) return;
    const interval = setInterval(() => {
      socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
        if (
          !state ||
          typeof state.timestamp !== 'number' ||
          typeof state.lastUpdated !== 'number' ||
          !isFinite(state.timestamp) ||
          !isFinite(state.lastUpdated)
        ) {
          // Defensive: log and skip if state is invalid
          console.warn('Drift check: invalid state received', { state });
          return;
        }
        const audio = audioRef.current;
        if (!audio) return;
        const now = getServerTime ? getServerTime() : Date.now();
        // Compensate for measured audio latency
        const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency;
        if (!isFiniteNumber(expected)) {
          console.warn('Drift check: expected is not finite', { expected, state });
          return;
        }
        // Use advanced time sync
        const syncedNow = getServerTime ? getServerTime() : Date.now();
        const expectedSynced = state.timestamp + (syncedNow - state.lastUpdated) / 1000;
        const drift = Math.abs(audio.currentTime - expectedSynced);
        if (drift > DRIFT_THRESHOLD) {
          driftCountRef.current += 1;
          if (driftCountRef.current >= DRIFT_JITTER_BUFFER) {
            setSyncStatus('Drifted');
            setCurrentTimeSafely(audio, expectedSynced, setCurrentTime);
            setSyncStatus('Re-syncing...');
            setTimeout(() => setSyncStatus('In Sync'), 800);
            // Advanced: trigger immediate time sync if available
            if (typeof socket?.forceTimeSync === 'function') {
              socket.forceTimeSync();
            }
            // Report drift to server for diagnostics/adaptive correction
            if (socket && socket.emit && socket.sessionId && typeof drift === 'number') {
              socket.emit('drift_report', {
                sessionId: socket.sessionId,
                drift,
                clientId,
                timestamp: Date.now()
              });
            }
            driftCountRef.current = 0;
          }
        } else {
          driftCountRef.current = 0;
          setSyncStatus('In Sync');
        }
      });
    }, 800); // Drift check interval set to 800ms
    return () => clearInterval(interval);
  }, [socket, isController]);

  // On mount, immediately request sync state on join
  useEffect(() => {
    if (!socket) return;
    if (socket.sessionId) {
      socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
        const audio = audioRef.current;
        if (!audio) return;
        
        // If no valid state received, ensure audio is paused and reset to beginning
        if (
          !state ||
          typeof state.timestamp !== 'number' ||
          typeof state.lastUpdated !== 'number' ||
          !isFinite(state.timestamp) ||
          !isFinite(state.lastUpdated)
        ) {
          console.log('No valid sync state received, pausing audio and resetting to beginning');
          audio.pause();
          setCurrentTimeSafely(audio, 0, setCurrentTime);
          setIsPlaying(false);
          return;
        }
        
        const now = getServerTime ? getServerTime() : Date.now();
        // Compensate for measured audio latency
        const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency;
        if (!isFiniteNumber(expected)) {
          console.warn('Invalid expected time, pausing audio');
          audio.pause();
          setIsPlaying(false);
          return;
        }
        
        // Use advanced time sync
        const syncedNow = getServerTime ? getServerTime() : Date.now();
        const expectedSynced = state.timestamp + (syncedNow - state.lastUpdated) / 1000;
        setCurrentTimeSafely(audio, expectedSynced, setCurrentTime);
        setIsPlaying(state.isPlaying);
        if (state.isPlaying) {
          playRequestedAt.current = Date.now();
          audio.play();
        } else {
          // Ensure audio is definitely paused and reset to the expected time
          audio.pause();
          setCurrentTimeSafely(audio, expectedSynced, setCurrentTime);
        }
        setLastSync(Date.now());
      });
    }
  }, [socket]);

  // Emit play/pause/seek events (controller only)
  const emitPlay = () => {
    if (isController && socket && getServerTime) {
      const now = getServerTime();
      const audio = audioRef.current;
      const playAt = (audio ? audio.currentTime : 0) + PLAY_OFFSET;
      socket.emit('play', { sessionId: socket.sessionId, timestamp: playAt });
    }
  };
  const emitPause = () => {
    if (isController && socket) {
      socket.emit('pause', { sessionId: socket.sessionId, timestamp: audioRef.current.currentTime });
    }
  };
  const emitSeek = (time) => {
    if (isController && socket) {
      socket.emit('seek', { sessionId: socket.sessionId, timestamp: time });
    }
  };

  // Play/pause/seek handlers
  const handlePlay = () => {
    playRequestedAt.current = Date.now();
    audioRef.current.play();
    setIsPlaying(true);
    emitPlay();
  };
  const handlePause = () => {
    audioRef.current.pause();
    setIsPlaying(false);
    emitPause();
  };
  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (!isFiniteNumber(time)) {
      console.warn('Seek ignored: non-finite time', time);
      return;
    }
    setIsSeeking(true);
    const audio = audioRef.current;
    setCurrentTimeSafely(audio, time, setCurrentTime);
    emitSeek(time);
    setTimeout(() => setIsSeeking(false), 200);
  };

  // Manual re-sync
  const handleResync = () => {
    if (!socket) return;
    socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
      if (
        !state ||
        typeof state.timestamp !== 'number' ||
        typeof state.lastUpdated !== 'number' ||
        !isFinite(state.timestamp) ||
        !isFinite(state.lastUpdated)
      ) {
        // Log the error as a single object for better grouping in the console
        console.warn('Manual resync: invalid state received', { state });
        setSyncStatus('Sync failed');
        setTimeout(() => setSyncStatus('In Sync'), 1200);
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      const now = getServerTime ? getServerTime() : Date.now();
      // Compensate for measured audio latency
      const expected = state.timestamp + (now - state.lastUpdated) / 1000 - audioLatency;
      if (!isFiniteNumber(expected)) {
        console.warn('Manual resync: expected is not finite', { expected, state });
        setSyncStatus('Sync failed');
        setTimeout(() => setSyncStatus('In Sync'), 1200);
        return;
      }
      // Use advanced time sync
      const syncedNow = getServerTime ? getServerTime() : Date.now();
      const expectedSynced = state.timestamp + (syncedNow - state.lastUpdated) / 1000;
      setCurrentTimeSafely(audio, expectedSynced, setCurrentTime);
      setSyncStatus('Re-syncing...');
      setTimeout(() => setSyncStatus('In Sync'), 800);
    });
  };

  const formatTime = (t) => {
    if (isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Audio latency calibration effect
  useEffect(() => {
    // Only calibrate once per session
    if (!audioRef.current || audioLatency !== DEFAULT_AUDIO_LATENCY) return;

    const audio = audioRef.current;
    let calibrationDone = false;

    const calibrateLatency = () => {
      if (calibrationDone) return;
      calibrationDone = true;

      // Pause and reset audio
      audio.pause();
      audio.currentTime = 0;

      const start = performance.now();
      const onPlaying = () => {
        const end = performance.now();
        const measuredLatency = (end - start) / 1000; // in seconds
        setAudioLatency(measuredLatency);
        audio.removeEventListener('playing', onPlaying);
        // Optionally, pause again after calibration
        audio.pause();
      };

      audio.addEventListener('playing', onPlaying);
      audio.play().catch(() => {
        // Ignore play errors (e.g., autoplay restrictions)
        audio.removeEventListener('playing', onPlaying);
      });
    };

    // Run calibration on mount or when audio is ready
    if (audio.readyState >= 2) {
      calibrateLatency();
    } else {
      audio.addEventListener('canplay', calibrateLatency, { once: true });
    }

    // Cleanup
    return () => {
      audio.removeEventListener('canplay', calibrateLatency);
    };
  }, [audioRef, audioLatency]);

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
            <span className="text-[11px] text-neutral-400 w-8 text-left font-mono">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={isFinite(duration) ? duration : 0}
              step={0.01}
              value={isFinite(currentTime) ? currentTime : 0}
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
              className="ml-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shadow"
              onClick={handleResync}
              disabled={disabled || !audioUrl}
              aria-label="Re-sync"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M3 21v-5h5"></path></svg>
              <span className="hidden sm:inline">Sync</span>
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
              {formatTime(currentTime)} / {formatTime(duration)}
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
            value={isFinite(currentTime) ? currentTime : 0}
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
              className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              onClick={handleResync}
              disabled={disabled || !audioUrl}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                <path d="M3 21v-5h5"></path>
              </svg>
              Re-sync
            </button>
          </div>

          <div className="text-right">
            <SyncStatus status={syncStatus} />
            <div className="text-neutral-400 text-xs mt-1">
              {isController ? 'You are the controller' : 'You are a listener'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 