// Helper: Smoothly ramp playbackRate to 1 (with lock)
export function rampPlaybackRate(audio, duration = 300, lockRef) {
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

// Helper: Smoothly fade audio volume in/out
export function fadeAudio(audio, targetVolume, duration = 120) {
  if (!audio) return;
  const start = audio.volume;
  const step = (targetVolume - start) / (duration / 16);
  let current = start;
  function animate() {
    current += step;
    audio.volume = Math.max(0, Math.min(1, current));
    if ((step > 0 && current < targetVolume) || (step < 0 && current > targetVolume)) {
      requestAnimationFrame(animate);
    } else {
      audio.volume = targetVolume;
    }
  }
  animate();
}

import { useEffect, useRef, useCallback } from 'react';
import SYNC_CONFIG from '../utils/syncConfig';

/**
 * useUltraPreciseLagDetection - Ultra-fast lag detection hook
 * Runs on every animation frame to detect lag as quickly as possible
 * Uses predictive algorithms to anticipate lag before it becomes noticeable
 */
export default function useUltraPreciseLagDetection({
  audioRef,
  isController,
  sessionSyncState,
  audioLatency,
  rtt,
  smoothedOffset,
  getServerTime,
  onLagDetected, // Callback when lag is detected
  onLagCorrected, // Callback when lag is corrected
}) {
  // All hooks at the top level!
  const ultraDriftBuffer = useRef([]);
  const ultraRttBuffer = useRef([]);
  const ultraLagPredictionBuffer = useRef([]);
  const ultraCorrectionHistory = useRef([]);
  const lastFrameTime = useRef(performance.now());
  const running = useRef(true);
  const rampLockRef = useRef(false);

  // Constants
  const ULTRA_MICRO_THRESHOLD = 0.00001;
  const ULTRA_MICRO_CORRECTION = 0.00005;
  const ULTRA_CORRECTION_COOLDOWN = 30;

  // Helper: Calculate drift acceleration
  const calculateDriftAcceleration = useCallback((driftHistory) => {
    if (driftHistory.length < 3) return 0;
    const recent = driftHistory.slice(-3);
    return (recent[2] - recent[0]) / 2;
  }, []);

  // Helper: Calculate RTT trend
  const calculateRttTrend = useCallback((rttHistory) => {
    if (rttHistory.length < 3) return 0;
    const recent = rttHistory.slice(-3);
    return (recent[2] - recent[0]) / 2;
  }, []);

  // Helper: Predict future lag
  const predictLag = useCallback((driftHistory, rttHistory, frameTime) => {
    const driftAccel = calculateDriftAcceleration(driftHistory);
    const rttTrend = calculateRttTrend(rttHistory);
    const predictedLag = driftAccel * frameTime * 2 + (rttTrend > 0 ? rttTrend * 0.002 : 0);
    return Math.max(0, predictedLag);
  }, [calculateDriftAcceleration, calculateRttTrend]);

  // Helper: Ultra-fast micro correction (no hooks inside!)
  const ultraMicroCorrection = useCallback((audio, drift) => {
    if (Math.abs(drift) < 0.0001) return false;
    if (Math.abs(drift) >= ULTRA_MICRO_THRESHOLD && Math.abs(drift) < ULTRA_MICRO_CORRECTION) {
      audio.currentTime += -drift * 0.8;
      return true;
    }
    if (Math.abs(drift) >= ULTRA_MICRO_CORRECTION && Math.abs(drift) < 0.001) {
      audio.currentTime += -drift * 0.9;
      return true;
    }
    if (Math.abs(drift) >= 0.001 && Math.abs(drift) < 0.02) {
      audio.currentTime += -drift * 0.95;
      return true;
    }
    if (Math.abs(drift) >= 0.02 && Math.abs(drift) < 0.1) {
      // Use playbackRate ramping
      const rateAdj = 1 + Math.max(-0.08, Math.min(0.08, -drift / 0.2));
      audio.playbackRate = rateAdj;
      setTimeout(() => rampPlaybackRate(audio, 300, rampLockRef), 120);
      return true;
    }
    if (Math.abs(drift) >= 0.1) {
      fadeAudio(audio, 0, 80);
      setTimeout(() => {
        audio.currentTime += -drift;
        fadeAudio(audio, 1, 80);
      }, 90);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!audioRef.current || isController) return;
    const audio = audioRef.current;
    let lastCorrectionTime = 0;
    const detectLag = () => {
      if (!running.current) return;
      const nowFrame = performance.now();
      const frameTime = nowFrame - lastFrameTime.current;
      lastFrameTime.current = nowFrame;
      const now = getServerTime ? getServerTime() : Date.now();
      const rttComp = rtt ? rtt / 2000 : 0;
      const expected = (sessionSyncState && typeof sessionSyncState.timestamp === 'number' && typeof sessionSyncState.lastUpdated === 'number')
        ? sessionSyncState.timestamp + (now - sessionSyncState.lastUpdated) / 1000 + rttComp + smoothedOffset - audioLatency
        : null;
      if (!expected || !isFinite(expected)) {
        requestAnimationFrame(detectLag);
        return;
      }
      const drift = audio.currentTime - expected;
      ultraDriftBuffer.current.push(drift);
      if (ultraDriftBuffer.current.length > 10) ultraDriftBuffer.current.shift();
      if (typeof rtt === 'number') {
        ultraRttBuffer.current.push(rtt);
        if (ultraRttBuffer.current.length > 10) ultraRttBuffer.current.shift();
      }
      // Micro-correction (ultra fast, but smooth)
      const corrected = ultraMicroCorrection(audio, drift);
      if (corrected) {
        const nowMs = Date.now();
        if (nowMs - lastCorrectionTime > ULTRA_CORRECTION_COOLDOWN) {
          ultraCorrectionHistory.current.push({ time: nowMs, drift, type: 'immediate' });
          if (ultraCorrectionHistory.current.length > 20) ultraCorrectionHistory.current.shift();
          if (typeof onLagCorrected === 'function') {
            onLagCorrected({ type: 'immediate', drift, corrected: true });
          }
          lastCorrectionTime = nowMs;
        }
      }
      // Predictive lag detection
      const predictedLag = predictLag(ultraDriftBuffer.current, ultraRttBuffer.current, frameTime);
      ultraLagPredictionBuffer.current.push(predictedLag);
      if (ultraLagPredictionBuffer.current.length > 3) {
        ultraLagPredictionBuffer.current.shift();
      }
      const recentRttSpikes = ultraRttBuffer.current.filter(val => val > 0.1).length;
      const recentDriftSpikes = ultraDriftBuffer.current.filter(val => Math.abs(val) > 0.1).length;
      const hasLagSpikes = recentRttSpikes + recentDriftSpikes >= 1;
      if (predictedLag > 0.02 || hasLagSpikes || Math.abs(drift) > 0.01) {
        const predictedExpected = expected + (typeof rtt === 'number' ? rtt / 1000 : 0) + predictedLag;
        audio.currentTime = predictedExpected;
        const nowMs = Date.now();
        if (nowMs - lastCorrectionTime > ULTRA_CORRECTION_COOLDOWN) {
          ultraCorrectionHistory.current.push({ time: nowMs, drift, predictedLag, type: 'aggressive_predictive' });
          if (ultraCorrectionHistory.current.length > 20) ultraCorrectionHistory.current.shift();
          if (typeof onLagCorrected === 'function') {
            onLagCorrected({ type: 'aggressive_predictive', drift, predictedLag, corrected: true });
          }
          if (typeof onLagDetected === 'function') {
            onLagDetected({ type: 'aggressive_predictive_resync', predictedLag, drift });
          }
          lastCorrectionTime = nowMs;
        }
      }
      if (Math.abs(drift) > 0.1 || (typeof rtt === 'number' && rtt > 0.1)) {
        if (typeof onLagDetected === 'function') {
          onLagDetected({ type: 'lag_spike', drift, rtt });
        }
      }
      requestAnimationFrame(detectLag);
    };
    const rafId = requestAnimationFrame(detectLag);
    return () => {
      running.current = false;
    };
  }, [audioRef, isController, sessionSyncState, audioLatency, rtt, smoothedOffset, getServerTime, ultraMicroCorrection, predictLag, onLagDetected, onLagCorrected]);

  const getLagAnalytics = useCallback(() => {
    return {
      driftBuffer: ultraDriftBuffer.current,
      rttBuffer: ultraRttBuffer.current,
      predictionBuffer: ultraLagPredictionBuffer.current,
      correctionHistory: ultraCorrectionHistory.current,
      avgDrift: ultraDriftBuffer.current.length > 0 ? 
        ultraDriftBuffer.current.reduce((a, b) => a + Math.abs(b), 0) / ultraDriftBuffer.current.length : 0,
      avgRtt: ultraRttBuffer.current.length > 0 ? 
        ultraRttBuffer.current.reduce((a, b) => a + b, 0) / ultraRttBuffer.current.length : 0,
      recentCorrections: ultraCorrectionHistory.current.slice(-5),
    };
  }, []);

  return { getLagAnalytics };
} 