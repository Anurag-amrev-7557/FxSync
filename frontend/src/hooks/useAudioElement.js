import { useState, useRef, useEffect, useCallback } from 'react';
import { fadeAudio } from './useDriftCorrection';
import SYNC_CONFIG from '../utils/syncConfig';

export default function useAudioElement({ currentTrack, isController, getServerTime }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioError, setAudioError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [displayedCurrentTime, setDisplayedCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const audioRef = useRef(null);

  // Set audio source to currentTrack.url if available
  useEffect(() => {
    if (currentTrack && currentTrack.url) {
      let url = currentTrack.url;
      if (url.startsWith('/audio/')) {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
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
      audio.play().catch(() => {});
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
      // Only update displayedCurrentTime if not currently seeking
      if (!isSeeking) {
        setDisplayedCurrentTime(audio.currentTime);
      }
    };
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
  }, [audioUrl, isSeeking]);

  // Seek handler
  const handleSeek = useCallback((time) => {
    const audio = audioRef.current;
    if (audio && typeof time === 'number') {
      setIsSeeking(true);
      setDisplayedCurrentTime(time);
      
      fadeAudio(audio, 0, 100);
      setTimeout(() => {
        audio.currentTime = time;
        fadeAudio(audio, 1, 100);
        // Allow timeupdate events to resume after a short delay
        setTimeout(() => setIsSeeking(false), 200);
      }, 110);
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
    isSeeking,
  };
} 