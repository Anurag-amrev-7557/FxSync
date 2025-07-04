import React, { useEffect, useRef, useState } from 'react';
import SyncStatus from './SyncStatus';

// Add global error handlers
if (typeof window !== 'undefined' && !window._audioPlayerErrorHandlerAdded) {
  window.addEventListener('unhandledrejection', function(event) {
    console.error('UNHANDLED PROMISE REJECTION:', event.reason);
  });
  window.addEventListener('error', function(event) {
    console.error('GLOBAL ERROR:', event.error);
  });
  window._audioPlayerErrorHandlerAdded = true;
}

const DRIFT_THRESHOLD = 0.1; // seconds (tighter sync)
const PLAY_OFFSET = 0.15; // seconds (150ms future offset for play events)

function isFiniteNumber(n) {
  return typeof n === 'number' && isFinite(n);
}

function setCurrentTimeSafely(audio, value, setCurrentTime) {
  const logContext = { value, readyState: audio ? audio.readyState : null, duration: audio ? audio.duration : null };
  if (
    isFiniteNumber(value) &&
    audio &&
    audio.readyState >= 1 &&
    audio.duration &&
    isFinite(audio.duration)
  ) {
    try {
      if (!isFiniteNumber(value)) {
        throw new Error('Attempted to set non-finite currentTime');
      }
      console.log('Setting currentTime immediately', logContext);
      audio.currentTime = value;
      setCurrentTime(value);
    } catch (e) {
      console.warn('Failed to set currentTime immediately:', logContext, e);
    }
  } else {
    console.warn('Defer setCurrentTime: audio not ready or value not finite', logContext);
    if (audio) {
      const onLoaded = () => {
        const context = { value, readyState: audio.readyState, duration: audio.duration };
        if (isFiniteNumber(value) && audio.duration && isFinite(audio.duration)) {
          try {
            if (!isFiniteNumber(value)) {
              throw new Error('Attempted to set non-finite currentTime after loadedmetadata');
            }
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

  // Use controllerClientId/clientId for sticky controller logic
  const isController = controllerClientId && clientId && controllerClientId === clientId;

  // Fetch audio URL
  useEffect(() => {
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
              Please set <span className="font-mono bg-gray-100 px-1 rounded">VITE_BACKEND_URL</span> in your environment.
            </span>
          </span>
        </>
      );
      setLoading(false);
      return;
    }
    fetch(`${backendUrl}/audio-url`)
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
  }, []);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setCurrentTime(audio.currentTime);
    const setDur = () => setDuration(audio.duration || 0);
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('durationchange', setDur);
    return () => {
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('durationchange', setDur);
    };
  }, [audioUrl]);

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
      const now = Date.now();
      const expected = timestamp + (now - lastUpdated) / 1000;
      if (!isFiniteNumber(expected)) {
        console.warn('SYNC_STATE: expected is not finite', { expected, timestamp, lastUpdated, now });
        setSyncStatus('Sync failed');
        setTimeout(() => setSyncStatus('In Sync'), 1200);
        return;
      }
      const drift = Math.abs(audio.currentTime - expected);
      if (drift > DRIFT_THRESHOLD) {
        setSyncStatus('Drifted');
        setCurrentTimeSafely(audio, expected, setCurrentTime);
        setSyncStatus('Re-syncing...');
        setTimeout(() => setSyncStatus('In Sync'), 800);
      } else {
        setSyncStatus('In Sync');
      }
      setIsPlaying(isPlaying);
      if (isPlaying) {
        audio.play();
      } else {
        audio.pause();
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
        const now = Date.now();
        const expected = state.timestamp + (now - state.lastUpdated) / 1000;
        if (!isFiniteNumber(expected)) {
          console.warn('Drift check: expected is not finite', { expected, state });
          return;
        }
        const drift = Math.abs(audio.currentTime - expected);
        if (drift > DRIFT_THRESHOLD) {
          setSyncStatus('Drifted');
          setCurrentTimeSafely(audio, expected, setCurrentTime);
          setSyncStatus('Re-syncing...');
          setTimeout(() => setSyncStatus('In Sync'), 800);
        }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [socket, isController]);

  // On mount, immediately request sync state on join
  useEffect(() => {
    if (!socket) return;
    if (socket.sessionId) {
      socket.emit('sync_request', { sessionId: socket.sessionId }, (state) => {
        // Same logic as handleSyncState
        if (
          !state ||
          typeof state.timestamp !== 'number' ||
          typeof state.lastUpdated !== 'number' ||
          !isFinite(state.timestamp) ||
          !isFinite(state.lastUpdated)
        ) return;
        const audio = audioRef.current;
        if (!audio) return;
        const now = Date.now();
        const expected = state.timestamp + (now - state.lastUpdated) / 1000;
        if (!isFiniteNumber(expected)) return;
        setCurrentTimeSafely(audio, expected, setCurrentTime);
        setIsPlaying(state.isPlaying);
        if (state.isPlaying) audio.play();
        else audio.pause();
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
      const now = Date.now();
      const expected = state.timestamp + (now - state.lastUpdated) / 1000;
      if (!isFiniteNumber(expected)) {
        console.warn('Manual resync: expected is not finite', { expected, state });
        setSyncStatus('Sync failed');
        setTimeout(() => setSyncStatus('In Sync'), 1200);
        return;
      }
      setCurrentTimeSafely(audio, expected, setCurrentTime);
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

  if (loading) return <div className="text-center py-8">Loading audio...</div>;
  if (audioError) {
    return (
      <div className="max-w-xl mx-auto mt-8 p-6 bg-white rounded shadow flex flex-col items-center">
        <div className="text-red-600 font-semibold mb-2">Audio Error</div>
        <div className="text-gray-700 text-sm mb-4">{audioError}</div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-8 p-6 bg-white rounded shadow flex flex-col items-center">
      {audioUrl ? (
        <audio ref={audioRef} src={audioUrl} preload="auto" />
      ) : null}
      <div className="flex items-center gap-4 mb-4">
        <button
          className={`px-4 py-2 rounded ${isPlaying ? 'bg-red-500' : 'bg-green-500'} text-white disabled:opacity-50`}
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={disabled || !isController || !audioUrl}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <span className="font-mono text-sm">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <button
          className="ml-4 px-3 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          onClick={handleResync}
          disabled={disabled || !audioUrl}
        >
          Re-sync
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={isFinite(duration) ? duration : 0}
        step={0.01}
        value={isFinite(currentTime) ? currentTime : 0}
        onChange={handleSeek}
        className="w-full accent-blue-500"
        disabled={disabled || !isController || !audioUrl}
      />
      <div className="mt-2">
        <SyncStatus status={syncStatus} />
      </div>
      <div className="mt-2 text-xs text-gray-400">{isController ? 'You are the controller' : 'You are a listener'}</div>
    </div>
  );
} 