import { useEffect, useRef } from 'react';
import SYNC_CONFIG from '../utils/syncConfig';
import { createEMA } from '../utils/syncConfig'; // Import EMA utility

// Helper: Smoothly fade audio volume in/out
export function fadeAudio(audio, targetVolume, duration = 200) {
  if (!audio) return;
  const start = audio.volume;
  const step = (targetVolume - start) / (duration / 16);
  let current = start;
  let frame = 0;
  function animate() {
    current += step;
    frame++;
    audio.volume = Math.max(0, Math.min(1, current));
    if ((step > 0 && current < targetVolume) || (step < 0 && current > targetVolume)) {
      requestAnimationFrame(animate);
    } else {
      audio.volume = targetVolume;
    }
  }
  animate();
}

// Helper: Smoothly ramp playbackRate to 1 (with lock)
function rampPlaybackRate(audio, duration = 300, lockRef) {
  if (!audio) return;
  if (lockRef && lockRef.current) return; // Prevent overlap
  if (lockRef) lockRef.current = true;
  const start = audio.playbackRate;
  const step = (1 - start) / (duration / 16);
  let current = start;
  function animate() {
    current += step;
    audio.playbackRate = current;
    if ((step > 0 && current < 1) || (step < 0 && current > 1)) {
      requestAnimationFrame(animate);
    } else {
      audio.playbackRate = 1;
      if (lockRef) lockRef.current = false;
    }
  }
  animate();
}

// Helper: Median of an array
function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function useDriftCorrection({
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
  MICRO_DRIFT_THRESHOLD,
  MICRO_CORRECTION_WINDOW,
  MICRO_DRIFT_MIN,
  MICRO_DRIFT_MAX,
  MICRO_RATE_CAP,
  MICRO_RATE_CAP_MICRO,
  CORRECTION_COOLDOWN,
  correctionInProgressRef,
  lastCorrectionRef,
  clientId,
  sessionId,
  onDriftDetected, // optional callback for timer drift/throttling
  onMicroCorrection, // optional callback for micro-correction visual feedback
}) {
  // Add a lock for ramp/fade overlap
  const rampLockRef = useRef(false);
  // --- EMA for drift smoothing ---
  const driftEMARef = useRef(createEMA(0.18, 0));
  // --- Drift buffer for median filter ---
  const driftBufferRef = useRef([]);

  // --- Adaptive thresholds based on jitter ---
  let adaptiveMin = MICRO_DRIFT_MIN;
  let adaptiveMax = MICRO_DRIFT_MAX;
  if (typeof rtt === 'number' && typeof sessionSyncState?.jitter === 'number') {
    // If jitter is high, increase thresholds
    const jitterVal = sessionSyncState.jitter;
    if (jitterVal > 30) {
      adaptiveMin = 0.025; // 25ms
      adaptiveMax = 0.25;  // 250ms
    } else if (jitterVal > 15) {
      adaptiveMin = 0.015;
      adaptiveMax = 0.15;
    } else {
      adaptiveMin = MICRO_DRIFT_MIN;
      adaptiveMax = MICRO_DRIFT_MAX;
    }
  }

  /**
   * Micro-Drift Correction Effect (requestAnimationFrame version)
   * Uses EMA-smoothed and median-filtered drift for ultra-precise, stable corrections.
   * For sub-10ms drift, uses direct currentTime nudge (micro-nudging).
   */
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    let running = true;
    let lastFrameTime = performance.now();
    let microActive = false;
    let pausedByVisibility = false;
    driftEMARef.current.reset(0); // Reset EMA on effect re-run
    driftBufferRef.current = [];
    function correctMicroDriftRAF() {
      if (!running || pausedByVisibility) return;
      if (!audio || isController) return;
      const nowFrame = performance.now();
      const frameElapsed = nowFrame - lastFrameTime;
      lastFrameTime = nowFrame;
      // Detect animation frame throttling (e.g., tab backgrounded)
      if (frameElapsed > 500 && typeof onDriftDetected === 'function') {
        onDriftDetected('raf_drift');
      }
      const now = getServerTime ? getServerTime() : Date.now();
      const rttComp = rtt ? rtt / 2000 : 0;
      const expected = (sessionSyncState && typeof sessionSyncState.timestamp === 'number' && typeof sessionSyncState.lastUpdated === 'number')
        ? sessionSyncState.timestamp + (now - sessionSyncState.lastUpdated) / 1000 - audioLatency + rttComp + smoothedOffset
        : null;
      if (!isFiniteNumber(expected)) {
        requestAnimationFrame(correctMicroDriftRAF);
        return;
      }
      const drift = audio.currentTime - expected;
      // --- Use EMA for smoothing drift ---
      const smoothedDrift = driftEMARef.current.next(drift);
      // --- Median filter ---
      driftBufferRef.current.push(smoothedDrift);
      if (driftBufferRef.current.length > 9) driftBufferRef.current.shift();
      const medianDrift = median(driftBufferRef.current);
      // --- Micro-nudging for sub-10ms drift ---
      if (Math.abs(medianDrift) > 0.002 && Math.abs(medianDrift) < 0.010) { // 2ms < drift < 10ms
        audio.currentTime += -medianDrift * 0.5; // Nudge toward expected
        if (!microActive && typeof onMicroCorrection === 'function') onMicroCorrection(true);
        microActive = true;
        if (import.meta.env.MODE === 'development') {
          window._driftAnalytics = window._driftAnalytics || [];
          window._driftAnalytics.push({ type: 'nudge', drift: medianDrift, time: Date.now(), current: audio.currentTime, expected });
        }
      } else if (Math.abs(medianDrift) > adaptiveMin && Math.abs(medianDrift) < adaptiveMax) {
        // Use playbackRate micro-correction
        if (!microActive && typeof onMicroCorrection === 'function') onMicroCorrection(true);
        microActive = true;
        let rateAdj = 1 - Math.max(-MICRO_RATE_CAP_MICRO, Math.min(MICRO_RATE_CAP_MICRO, medianDrift / adaptiveMax * MICRO_RATE_CAP_MICRO));
        rateAdj = Math.max(1 - MICRO_RATE_CAP_MICRO, Math.min(1 + MICRO_RATE_CAP_MICRO, rateAdj));
        if (Math.abs(audio.playbackRate - rateAdj) > 0.0005) {
          audio.playbackRate = rateAdj;
          if (import.meta.env.MODE === 'development') {
            window._driftAnalytics = window._driftAnalytics || [];
            window._driftAnalytics.push({ type: 'micro', drift: medianDrift, rateAdj, time: Date.now(), current: audio.currentTime, expected });
          }
        }
      } else {
        if (microActive && typeof onMicroCorrection === 'function') onMicroCorrection(false);
        microActive = false;
        if (audio.playbackRate !== 1) {
          rampPlaybackRate(audio, 300, rampLockRef);
        }
      }
      requestAnimationFrame(correctMicroDriftRAF);
    }
    let rafId = requestAnimationFrame(correctMicroDriftRAF);
    // Page Visibility API: pause/resume correction loop
    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        pausedByVisibility = true;
      } else {
        pausedByVisibility = false;
        rafId = requestAnimationFrame(correctMicroDriftRAF);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      running = false;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isController, sessionSyncState, audioLatency, rtt, smoothedOffset, getServerTime]);

  // maybeCorrectDrift function (unchanged)
  function maybeCorrectDrift(audio, expected) {
    if (!audio || typeof audio.currentTime !== 'number') return { corrected: false, reason: 'audio_invalid' };
    if (!isFiniteNumber(expected) || expected < 0) return { corrected: false, reason: 'expected_invalid' };
    if (correctionInProgressRef.current) return { corrected: false, reason: 'in_progress' };
    const now = Date.now();
    if (now - lastCorrectionRef.current < CORRECTION_COOLDOWN) return { corrected: false, reason: 'cooldown' };
    correctionInProgressRef.current = true;
    if (!audio.paused) {
      const before = audio.currentTime;
      const drift = expected - before;
      if (Math.abs(drift) < MICRO_DRIFT_THRESHOLD) {
        const rate = 1 + Math.max(-MICRO_RATE_CAP, Math.min(MICRO_RATE_CAP, drift * 0.7));
        audio.playbackRate = rate;
        setTimeout(() => {
          rampPlaybackRate(audio, 300, rampLockRef);
          correctionInProgressRef.current = false;
        }, MICRO_CORRECTION_WINDOW);
        // Log micro-correction
        if (import.meta.env.MODE === 'development') {
          window._driftAnalytics = window._driftAnalytics || [];
          window._driftAnalytics.push({ type: 'micro', drift, rate, time: Date.now(), before, after: expected });
        }
        return { corrected: true, micro: true, before, after: expected, drift, rate };
      } else {
        // Large correction: fade out, seek, fade in
        fadeAudio(audio, 0, 120);
        setTimeout(() => {
          setCurrentTimeSafely(audio, expected, setDisplayedCurrentTime);
          fadeAudio(audio, 1, 120);
          lastCorrectionRef.current = now;
          setTimeout(() => {
            correctionInProgressRef.current = false;
            rampPlaybackRate(audio, 300, rampLockRef); // Always ramp back to 1.0 after correction
          }, 500);
        }, 130);
        // Log large correction
        if (import.meta.env.MODE === 'development') {
          window._driftAnalytics = window._driftAnalytics || [];
          window._driftAnalytics.push({ type: 'large', drift, time: Date.now(), before, after: expected });
        }
        return { corrected: true, before, after: expected, at: now };
      }
    } else {
      correctionInProgressRef.current = false;
      return { corrected: false, reason: 'paused' };
    }
  }

  return { maybeCorrectDrift };
} 