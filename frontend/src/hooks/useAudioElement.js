import { useState, useRef, useEffect, useCallback } from 'react';
import { fadeAudio } from './useDriftCorrection';

// Extracted fade logic for clarity
function fadeAndSeek(audio, value, setCurrentTime, fadeDuration = 100) {
  if (typeof fadeAudio === 'function') {
    fadeAudio(audio, 0, fadeDuration);
    setTimeout(() => {
      audio.currentTime = value;
      setCurrentTime(value);
      fadeAudio(audio, 1, fadeDuration);
    }, fadeDuration + 10);
  } else {
    audio.currentTime = value;
    setCurrentTime(value);
  }
}

// Improved setCurrentTimeSafely with error surfacing
function setCurrentTimeSafely(audio, value, setCurrentTime, options = {}, setAudioError) {
  const logContext = {
    value,
    readyState: audio ? audio.readyState : null,
    duration: audio ? audio.duration : null,
    src: audio ? audio.currentSrc : null,
  };

  if (typeof value !== 'number' || !isFinite(value)) {
    const msg = 'setCurrentTimeSafely: value is not finite';
    if (import.meta.env && import.meta.env.MODE === 'development') {
      throw new Error(msg + ': ' + JSON.stringify(logContext));
    } else {
      setAudioError && setAudioError(msg);
      console.warn(msg, logContext);
    }
    return;
  }

  if (!audio) {
    const msg = 'setCurrentTimeSafely: audio element not available';
    setAudioError && setAudioError(msg);
    console.warn(msg, logContext);
    return;
  }

  const doSet = (context, eventType = 'immediate') => {
    try {
      if (Math.abs(audio.currentTime - value) > 0.01) {
        if (options.fade) {
          fadeAndSeek(audio, value, setCurrentTime, 100);
        } else {
          audio.currentTime = value;
          setCurrentTime(value);
        }
        if (import.meta.env && import.meta.env.MODE === 'development') {
          console.log(`[setCurrentTimeSafely] Set currentTime (${eventType})`, { ...context, actual: audio.currentTime });
        }
      }
    } catch (e) {
      setAudioError && setAudioError(`[setCurrentTimeSafely] Failed to set currentTime (${eventType})`);
      console.warn(`[setCurrentTimeSafely] Failed to set currentTime (${eventType}):`, context, e);
    }
  };

  if (
    audio.readyState >= 1 &&
    audio.duration &&
    isFinite(audio.duration)
  ) {
    doSet(logContext, 'immediate');
    return;
  }

  if (audio.duration === undefined || isNaN(audio.duration)) {
    if (value === 0 && audio.src && !audio.src.includes('forceReload')) {
      audio.src = audio.src + (audio.src.includes('?') ? '&' : '?') + 'forceReload=' + Date.now();
      if (import.meta.env && import.meta.env.MODE === 'development') {
        console.log('[setCurrentTimeSafely] Forcing reload due to NaN duration', logContext);
      }
    }
  }

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
      setAudioError && setAudioError('[setCurrentTimeSafely] Still not ready after loadedmetadata');
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
      setAudioError && setAudioError('[setCurrentTimeSafely] Still not ready after canplay');
      console.warn('[setCurrentTimeSafely] Still not ready after canplay', context);
    }
    cleanup();
  };

  audio.addEventListener('loadedmetadata', onLoaded, { once: true });
  audio.addEventListener('canplay', onCanPlay, { once: true });

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
        setAudioError && setAudioError('[setCurrentTimeSafely] Timeout waiting for audio readiness');
        console.warn('[setCurrentTimeSafely] Timeout waiting for audio readiness', context);
      }
      cleanup();
    }
  }, 3000);
}

export default function useAudioElement({ currentTrack, isController, getServerTime }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioError, setAudioError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [displayedCurrentTime, setDisplayedCurrentTime] = useState(0);
  const audioRef = useRef(null);
  // Ref to prevent race conditions on rapid audioUrl changes
  const latestAudioUrlRef = useRef(null);

  // Set audio source to currentTrack.url if available
  useEffect(() => {
    if (currentTrack && currentTrack.url) {
      let url = currentTrack.url;
      if (url.startsWith('/audio/')) {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        url = backendUrl.replace(/\/$/, '') + url;
      }
      latestAudioUrlRef.current = url;
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
      // Prevent race: only play if audioUrl matches latest
      if (audioUrl === latestAudioUrlRef.current) {
        audio.play().catch((err) => {
          setAudioError && setAudioError('Audio playback error: ' + (err?.message || ''));
        });
      }
    }
  }, [audioUrl, isPlaying, isController]);

  // Fetch default audio URL only if no currentTrack
  useEffect(() => {
    if (currentTrack && currentTrack.url) return;
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    if (!backendUrl) {
      setAudioError('Audio backend URL is not configured.');
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
          latestAudioUrlRef.current = data.url;
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
    const update = () => setDisplayedCurrentTime(audio.currentTime);
    const setDur = () => setDuration(audio.duration || 0);
    const handlePlaying = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => setAudioError('Audio playback error.');
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('durationchange', setDur);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);
    return () => {
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('durationchange', setDur);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
    };
  }, [audioUrl]);

  // Seek handler
  const handleSeek = useCallback((time) => {
    const audio = audioRef.current;
    if (audio && typeof time === 'number') {
      if (Math.abs(audio.currentTime - time) > 0.05) {
        setCurrentTimeSafely(audio, time, setDisplayedCurrentTime, { fade: true }, setAudioError);
      }
    }
  }, []);

  return {
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
  };
} 