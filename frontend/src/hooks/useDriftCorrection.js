import { useEffect, useRef } from 'react';
import SYNC_CONFIG from '../utils/syncConfig';
import { createEMA } from '../utils/syncConfig'; // Import EMA utility

// --- Enhancement: Lag Detection & Predictive Sync ---
const LAG_SPIKE_RTT = 350; // ms, RTT spike threshold
const LAG_SPIKE_DRIFT = 0.45; // s, drift spike threshold
const LAG_SPIKE_WINDOW = 5; // Number of samples to consider
const LAG_SPIKE_PERSIST = 3; // Number of consecutive spikes to trigger predictive resync
const MICRO_RAMP_DURATION = 1200; // ms, ramp playbackRate back to 1.0 after correction

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

// --- Enhanced: Micro-ramp playbackRate to 1.0 over a longer period ---
function microRampPlaybackRate(audio, lockRef) {
  rampPlaybackRate(audio, MICRO_RAMP_DURATION, lockRef);
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

  // --- Enhancement: Lag/Drift spike tracking ---
  const rttSpikeHistory = useRef([]); // ms
  const driftSpikeHistory = useRef([]); // s
  const lagSpikeCount = useRef(0);

  // --- Adaptive thresholds (if enabled) ---
  let adaptiveMin = MICRO_DRIFT_MIN;
  let adaptiveMax = MICRO_DRIFT_MAX;
  let adaptiveDriftThreshold = MICRO_DRIFT_THRESHOLD;
  let adaptiveCorrectionCooldown = CORRECTION_COOLDOWN;
  if (SYNC_CONFIG.ADAPTIVE.ENABLED) {
    // Use recent RTT and drift to adjust thresholds
    const avgRtt = rttSpikeHistory.current.length ? rttSpikeHistory.current.reduce((a, b) => a + b, 0) / rttSpikeHistory.current.length : (typeof rtt === 'number' ? rtt : 80);
    const avgDrift = driftSpikeHistory.current.length ? driftSpikeHistory.current.reduce((a, b) => a + Math.abs(b), 0) / driftSpikeHistory.current.length : 0;
    if (avgRtt > 250 || avgDrift > 0.25) {
      adaptiveMin *= 1.5;
      adaptiveMax *= 1.5;
      adaptiveDriftThreshold *= 1.5;
      adaptiveCorrectionCooldown *= 1.5;
    } else if (avgRtt < 100 && avgDrift < 0.1) {
      adaptiveMin *= 0.8;
      adaptiveMax *= 0.8;
      adaptiveDriftThreshold *= 0.8;
      adaptiveCorrectionCooldown *= 0.8;
    }
  }

  /**
   * Micro-Drift Correction Effect (requestAnimationFrame version)
   * Uses EMA-smoothed and median-filtered drift for ultra-precise, stable corrections.
   * For sub-10ms drift, uses direct currentTime nudge (micro-nudging).
   * Enhanced: Lag detection, predictive correction, and micro-ramp.
   *
   * Now: Runs on every animation frame for near-instantaneous detection and correction of micro-millisecond gaps.
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
    rttSpikeHistory.current = [];
    driftSpikeHistory.current = [];
    lagSpikeCount.current = 0;
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
      // Calculate expected playback position
      // For listeners, always subtract audioLatency to compensate for output delay
      const expected = (sessionSyncState && typeof sessionSyncState.timestamp === 'number' && typeof sessionSyncState.lastUpdated === 'number')
        ? sessionSyncState.timestamp + (now - sessionSyncState.lastUpdated) / 1000 + rttComp + smoothedOffset - (isController ? 0 : audioLatency)
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

      // --- Ultra-microsecond lag detection and correction ---
      // If drift > 0.1ms, immediately correct on this frame
      if (Math.abs(medianDrift) > 0.0001 && Math.abs(medianDrift) < 0.005) { // 0.1ms < drift < 5ms
        audio.currentTime += -medianDrift * 0.8; // Direct nudge, ultra-gentle, ultra-micro sync
        if (!microActive && typeof onMicroCorrection === 'function') onMicroCorrection(true);
        microActive = true;
        if (import.meta.env.MODE === 'development') {
          window._driftAnalytics = window._driftAnalytics || [];
          window._driftAnalytics.push({ type: 'ultra_micro_nudge', drift: medianDrift, time: Date.now(), current: audio.currentTime, expected });
        }
      } else if (Math.abs(medianDrift) >= 0.005 && Math.abs(medianDrift) < 0.010) { // 5ms < drift < 10ms
        audio.currentTime += -medianDrift * 0.5; // Nudge toward expected
        if (!microActive && typeof onMicroCorrection === 'function') onMicroCorrection(true);
        microActive = true;
        if (import.meta.env.MODE === 'development') {
          window._driftAnalytics = window._driftAnalytics || [];
          window._driftAnalytics.push({ type: 'nudge', drift: medianDrift, time: Date.now(), current: audio.currentTime, expected });
        }
      } else if (Math.abs(medianDrift) >= adaptiveMin && Math.abs(medianDrift) < adaptiveMax) {
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
          microRampPlaybackRate(audio, rampLockRef); // Enhanced: ramp back smoothly
        }
      }
      // --- End ultra-fast micro-millisecond correction ---

      // --- Enhancement: Lag/Drift spike detection ---
      if (typeof rtt === 'number') {
        rttSpikeHistory.current.push(rtt);
        if (rttSpikeHistory.current.length > LAG_SPIKE_WINDOW) rttSpikeHistory.current.shift();
      }
      driftSpikeHistory.current.push(medianDrift);
      if (driftSpikeHistory.current.length > LAG_SPIKE_WINDOW) driftSpikeHistory.current.shift();
      // Count lag spikes
      const recentRttSpikes = rttSpikeHistory.current.filter(val => val > LAG_SPIKE_RTT).length;
      const recentDriftSpikes = driftSpikeHistory.current.filter(val => Math.abs(val) > LAG_SPIKE_DRIFT).length;
      if (recentRttSpikes + recentDriftSpikes >= LAG_SPIKE_PERSIST) {
        lagSpikeCount.current++;
      } else {
        lagSpikeCount.current = 0;
      }
      // If lag spike persists, trigger predictive resync
      if (lagSpikeCount.current >= LAG_SPIKE_PERSIST) {
        // Predictive correction: estimate where controller will be after RTT
        const predictedExpected = expected + (typeof rtt === 'number' ? rtt / 1000 : 0);
        audio.currentTime = predictedExpected;
        microRampPlaybackRate(audio, rampLockRef); // Smoothly ramp back
        lagSpikeCount.current = 0;
        if (import.meta.env.MODE === 'development') {
          window._driftAnalytics = window._driftAnalytics || [];
          window._driftAnalytics.push({ type: 'predictive_resync', predictedExpected, time: Date.now(), current: audio.currentTime });
        }
        if (typeof onDriftDetected === 'function') onDriftDetected('predictive_resync');
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

  // maybeCorrectDrift function (unchanged, but use microRampPlaybackRate for smooth return)
  function maybeCorrectDrift(audio, expected) {
    if (!audio || typeof audio.currentTime !== 'number') return { corrected: false, reason: 'audio_invalid' };
    if (!isFiniteNumber(expected) || expected < 0) return { corrected: false, reason: 'expected_invalid' };
    if (correctionInProgressRef.current) return { corrected: false, reason: 'in_progress' };
    const now = Date.now();
    if (now - lastCorrectionRef.current < adaptiveCorrectionCooldown) return { corrected: false, reason: 'cooldown' };
    correctionInProgressRef.current = true;
    if (!audio.paused) {
      const before = audio.currentTime;
      const drift = expected - before;
      if (Math.abs(drift) < adaptiveDriftThreshold) {
        const rate = 1 + Math.max(-MICRO_RATE_CAP, Math.min(MICRO_RATE_CAP, drift * 0.7));
        audio.playbackRate = rate;
        setTimeout(() => {
          microRampPlaybackRate(audio, rampLockRef); // Enhanced: ramp back smoothly
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
            microRampPlaybackRate(audio, rampLockRef); // Enhanced: ramp back smoothly
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