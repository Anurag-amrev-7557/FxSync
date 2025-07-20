import { useEffect, useRef } from 'react';
import SYNC_CONFIG from '../utils/syncConfig';
import { createEMA } from '../utils/syncConfig'; // Import EMA utility

// --- Ultra-Precise Lag Detection & Predictive Sync ---
const ULTRA_LAG_SPIKE_RTT = 100; // ms, balanced for stability
const ULTRA_LAG_SPIKE_DRIFT = 0.1; // s, balanced for stability
const ULTRA_LAG_SPIKE_WINDOW = 2; // Number of samples to consider, reduced from 3
const ULTRA_LAG_SPIKE_PERSIST = 1; // Number of consecutive spikes to trigger predictive resync, reduced from 2
const MICRO_RAMP_DURATION = 1200; // ms, ramp playbackRate back to 1.0 after correction

// --- New Ultra-Precise Detection Constants - AGGRESSIVE (more sensitive for immediate sync) ---
const ULTRA_MICRO_DRIFT_THRESHOLD = 0.00005; // 0.05ms - balanced sensitivity
const ULTRA_MICRO_CORRECTION_THRESHOLD = 0.0001; // 0.1ms - balanced correction
const ULTRA_PREDICTIVE_LAG_THRESHOLD = 0.008; // Lowered from 0.02 to 0.008 (8ms)
const ULTRA_RTT_SPIKE_THRESHOLD = 80; // Lowered from 100ms to 80ms
const ULTRA_DRIFT_ACCELERATION_THRESHOLD = 0.001; // 1ms/s - balanced acceleration
const ULTRA_LAG_PREDICTION_WINDOW = 2; // Lowered from 3 to 2

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

// --- New: Ultra-precise lag prediction function ---
function predictLag(driftHistory, rttHistory, frameTime) {
  // AGGRESSIVE: Remove history length check so prediction always runs
  // if (driftHistory.length < 3 || rttHistory.length < 3) return 0;
  const recentDrifts = driftHistory.slice(-3);
  const driftAcceleration = recentDrifts.length === 3 ? (recentDrifts[2] - recentDrifts[0]) / 2 : 0;
  const recentRtts = rttHistory.slice(-3);
  const rttTrend = recentRtts.length === 3 ? (recentRtts[2] - recentRtts[0]) / 2 : 0;
  const predictedLag = driftAcceleration * frameTime + (rttTrend > 0 ? rttTrend * 0.001 : 0);
  return Math.max(0, predictedLag);
}

// --- New: Ultra-fast micro-correction function ---
function ultraMicroCorrection(audio, drift, expected) {
  if (Math.abs(drift) < ULTRA_MICRO_DRIFT_THRESHOLD) return false;
  
  // For ultra-micro drift (0.05ms - 0.1ms), use direct nudge
  if (Math.abs(drift) >= ULTRA_MICRO_DRIFT_THRESHOLD && Math.abs(drift) < ULTRA_MICRO_CORRECTION_THRESHOLD) {
    audio.currentTime += -drift * 0.9; // Direct nudge with 90% correction
    return true;
  }
  
  // For larger micro drift (0.1ms - 1ms), use aggressive nudge
  if (Math.abs(drift) >= ULTRA_MICRO_CORRECTION_THRESHOLD && Math.abs(drift) < 0.001) {
    audio.currentTime += -drift * 0.95; // Aggressive nudge with 95% correction
    return true;
  }
  
  return false;
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
  aggressiveSync = false, // new prop
}) {
  // Add a lock for ramp/fade overlap
  const rampLockRef = useRef(false);
  // --- EMA for drift smoothing ---
  const driftEMARef = useRef(createEMA(0.18, 0));
  // --- Drift buffer for median filter ---
  const driftBufferRef = useRef([]);

  // --- Enhanced: Ultra-precise lag/Drift spike tracking ---
  const rttSpikeHistory = useRef([]); // ms
  const driftSpikeHistory = useRef([]); // s
  const lagSpikeCount = useRef(0);
  
  // --- New: Ultra-precise detection buffers ---
  const ultraDriftHistory = useRef([]); // For lag prediction
  const ultraRttHistory = useRef([]); // For RTT trend analysis
  const ultraLagPredictionBuffer = useRef([]); // For predictive corrections
  const ultraCorrectionCount = useRef(0); // Track correction frequency

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

  // --- Adaptive predictive sync thresholds ---
  const predictiveLagThreshold = aggressiveSync ? ULTRA_PREDICTIVE_LAG_THRESHOLD / 2 : ULTRA_PREDICTIVE_LAG_THRESHOLD;
  const lagSpikePersist = aggressiveSync ? Math.max(0, ULTRA_LAG_SPIKE_PERSIST - 1) : ULTRA_LAG_SPIKE_PERSIST;

  /**
   * Ultra-Precise Micro-Drift Correction Effect (requestAnimationFrame version)
   * Uses EMA-smoothed and median-filtered drift for ultra-precise, stable corrections.
   * For sub-1ms drift, uses direct currentTime nudge (ultra-micro-nudging).
   * Enhanced: Ultra-fast lag detection, predictive correction, and micro-ramp.
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
    
    // --- Reset ultra-precise buffers ---
    ultraDriftHistory.current = [];
    ultraRttHistory.current = [];
    ultraLagPredictionBuffer.current = [];
    ultraCorrectionCount.current = 0;
    
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

      // --- AGGRESSIVE ultra-precise lag detection and correction ---
      // 1. IMMEDIATE correction for ANY drift - Full strength
      if (Math.abs(medianDrift) >= ULTRA_MICRO_DRIFT_THRESHOLD && Math.abs(medianDrift) < 0.01 && Math.abs(medianDrift) > 0.0001) {
        audio.currentTime += -medianDrift * 0.8; // 80% correction - smoother
        if (!microActive && typeof onMicroCorrection === 'function') onMicroCorrection(true);
        microActive = true;
        ultraCorrectionCount.current++;
        if (import.meta.env.MODE === 'development') {
          window._driftAnalytics = window._driftAnalytics || [];
          window._driftAnalytics.push({ type: 'aggressive_immediate', drift: medianDrift, time: Date.now(), current: audio.currentTime, expected });
        }
      }
      // 2. AGGRESSIVE correction for larger drift (10ms+)
      else if (Math.abs(medianDrift) >= 0.01) {
        audio.currentTime += -medianDrift * 0.9; // 90% correction - smoother
        if (!microActive && typeof onMicroCorrection === 'function') onMicroCorrection(true);
        microActive = true;
        ultraCorrectionCount.current++;
        if (import.meta.env.MODE === 'development') {
          window._driftAnalytics = window._driftAnalytics || [];
          window._driftAnalytics.push({ type: 'aggressive_large', drift: medianDrift, time: Date.now(), current: audio.currentTime, expected });
        }
      } else {
        if (microActive && typeof onMicroCorrection === 'function') onMicroCorrection(false);
        microActive = false;
        if (audio.playbackRate !== 1) {
          microRampPlaybackRate(audio, rampLockRef); // Enhanced: ramp back smoothly
        }
      }
      // --- End ultra-fast micro-millisecond correction ---

      // --- Enhanced: Ultra-precise lag/Drift spike detection ---
      if (typeof rtt === 'number') {
        rttSpikeHistory.current.push(rtt);
        ultraRttHistory.current.push(rtt);
        if (rttSpikeHistory.current.length > ULTRA_LAG_SPIKE_WINDOW) rttSpikeHistory.current.shift();
        if (ultraRttHistory.current.length > 10) ultraRttHistory.current.shift();
      }
      
      driftSpikeHistory.current.push(medianDrift);
      ultraDriftHistory.current.push(medianDrift);
      if (driftSpikeHistory.current.length > ULTRA_LAG_SPIKE_WINDOW) driftSpikeHistory.current.shift();
      if (ultraDriftHistory.current.length > 10) ultraDriftHistory.current.shift();
      
      // Count lag spikes with ultra-precise thresholds
      const recentRttSpikes = rttSpikeHistory.current.filter(val => val > ULTRA_RTT_SPIKE_THRESHOLD).length;
      const recentDriftSpikes = driftSpikeHistory.current.filter(val => Math.abs(val) > ULTRA_LAG_SPIKE_DRIFT).length;
      
      if (recentRttSpikes + recentDriftSpikes >= ULTRA_LAG_SPIKE_PERSIST) {
        lagSpikeCount.current++;
      } else {
        lagSpikeCount.current = 0;
      }
      
      // --- Ultra-precise predictive lag detection ---
      const predictedLag = predictLag(ultraDriftHistory.current, ultraRttHistory.current, frameElapsed);
      ultraLagPredictionBuffer.current.push(predictedLag);
      if (ultraLagPredictionBuffer.current.length > ULTRA_LAG_PREDICTION_WINDOW) {
        ultraLagPredictionBuffer.current.shift();
      }
      
      // AGGRESSIVE predictive correction - Trigger immediately for any significant drift
      if (lagSpikeCount.current >= lagSpikePersist || 
          predictedLag > predictiveLagThreshold || 
          Math.abs(medianDrift) > 0.01) {
        // AGGRESSIVE predictive correction: estimate where controller will be after RTT
        const predictedExpected = expected + (typeof rtt === 'number' ? rtt / 1000 : 0) + predictedLag;
        audio.currentTime = predictedExpected;
        microRampPlaybackRate(audio, rampLockRef); // Smoothly ramp back
        lagSpikeCount.current = 0;
        ultraCorrectionCount.current = 0;
        if (import.meta.env.MODE === 'development') {
          window._driftAnalytics = window._driftAnalytics || [];
          window._driftAnalytics.push({ 
            type: 'aggressive_predictive_resync', 
            predictedExpected, 
            predictedLag,
            time: Date.now(), 
            current: audio.currentTime 
          });
        }
        if (typeof onDriftDetected === 'function') onDriftDetected('aggressive_predictive_resync');
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