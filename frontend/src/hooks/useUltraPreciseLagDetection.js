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
  // Ultra-precise detection buffers
  const ultraDriftBuffer = useRef([]);
  const ultraRttBuffer = useRef([]);
  const ultraLagPredictionBuffer = useRef([]);
  const ultraCorrectionHistory = useRef([]);
  const lastFrameTime = useRef(performance.now());
  const running = useRef(true);

  // AGGRESSIVE Ultra-precise constants - Much more sensitive
  const ULTRA_MICRO_THRESHOLD = 0.00001; // 0.01ms - 10x more sensitive
  const ULTRA_MICRO_CORRECTION = 0.00005; // 0.05ms - 2x more sensitive
  const ULTRA_PREDICTIVE_THRESHOLD = 0.01; // 10ms - 5x more sensitive
  const ULTRA_RTT_SPIKE = 50; // ms - 3x more sensitive
  const ULTRA_DRIFT_SPIKE = 0.05; // s - 3x more sensitive
  const ULTRA_PREDICTION_WINDOW = 3; // frames - faster response
  const ULTRA_CORRECTION_COOLDOWN = 100; // ms - Increased to prevent stuttering

  // Helper: Calculate drift acceleration
  const calculateDriftAcceleration = useCallback((driftHistory) => {
    if (driftHistory.length < 3) return 0;
    const recent = driftHistory.slice(-3);
    return (recent[2] - recent[0]) / 2; // Rate of change
  }, []);

  // Helper: Calculate RTT trend
  const calculateRttTrend = useCallback((rttHistory) => {
    if (rttHistory.length < 3) return 0;
    const recent = rttHistory.slice(-3);
    return (recent[2] - recent[0]) / 2; // Rate of change
  }, []);

  // Helper: Predict future lag
  const predictLag = useCallback((driftHistory, rttHistory, frameTime) => {
    const driftAccel = calculateDriftAcceleration(driftHistory);
    const rttTrend = calculateRttTrend(rttHistory);
    
    // Predict lag based on current trends - More aggressive prediction
    const predictedLag = driftAccel * frameTime * 2 + (rttTrend > 0 ? rttTrend * 0.002 : 0);
    return Math.max(0, predictedLag);
  }, [calculateDriftAcceleration, calculateRttTrend]);

  // Helper: Ultra-fast micro correction - More aggressive
  const ultraMicroCorrection = useCallback((audio, drift) => {
    if (Math.abs(drift) < ULTRA_MICRO_THRESHOLD) return false;
    
    // Ultra-micro correction (0.01ms - 0.05ms) - Smooth correction
    if (Math.abs(drift) >= ULTRA_MICRO_THRESHOLD && Math.abs(drift) < ULTRA_MICRO_CORRECTION) {
      audio.currentTime += -drift * 0.8; // 80% correction - smoother
      return true;
    }
    
    // Micro correction (0.05ms - 1ms) - Smooth correction
    if (Math.abs(drift) >= ULTRA_MICRO_CORRECTION && Math.abs(drift) < 0.001) {
      audio.currentTime += -drift * 0.9; // 90% correction - smoother
      return true;
    }
    
    // Small correction (1ms - 10ms) - Smooth correction
    if (Math.abs(drift) >= 0.001 && Math.abs(drift) < 0.01) {
      audio.currentTime += -drift * 0.95; // 95% correction - smoother
      return true;
    }
    
    return false;
  }, []);

  // Main ultra-precise detection loop
  useEffect(() => {
    if (!audioRef.current || isController) return;
    
    const audio = audioRef.current;
    let lastCorrectionTime = 0;
    
    const detectLag = () => {
      if (!running.current) return;
      
      const nowFrame = performance.now();
      const frameTime = nowFrame - lastFrameTime.current;
      lastFrameTime.current = nowFrame;
      
      // Get current sync state
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
      
      // Update ultra-precise buffers
      ultraDriftBuffer.current.push(drift);
      if (ultraDriftBuffer.current.length > 10) ultraDriftBuffer.current.shift();
      
      if (typeof rtt === 'number') {
        ultraRttBuffer.current.push(rtt);
        if (ultraRttBuffer.current.length > 10) ultraRttBuffer.current.shift();
      }
      
      // 1. IMMEDIATE correction for ANY drift - No cooldown
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
      
      // 2. AGGRESSIVE predictive lag detection
      const predictedLag = predictLag(ultraDriftBuffer.current, ultraRttBuffer.current, frameTime);
      ultraLagPredictionBuffer.current.push(predictedLag);
      if (ultraLagPredictionBuffer.current.length > ULTRA_PREDICTION_WINDOW) {
        ultraLagPredictionBuffer.current.shift();
      }
      
      // 3. Detect lag spikes - Much more sensitive
      const recentRttSpikes = ultraRttBuffer.current.filter(val => val > ULTRA_RTT_SPIKE).length;
      const recentDriftSpikes = ultraDriftBuffer.current.filter(val => Math.abs(val) > ULTRA_DRIFT_SPIKE).length;
      const hasLagSpikes = recentRttSpikes + recentDriftSpikes >= 1; // Any spike triggers correction
      
      // 4. AGGRESSIVE predictive correction - No minimum correction history
      if (predictedLag > ULTRA_PREDICTIVE_THRESHOLD || hasLagSpikes || Math.abs(drift) > 0.01) {
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
      
      // 5. Report lag if detected - Much more sensitive
      if (Math.abs(drift) > ULTRA_DRIFT_SPIKE || (typeof rtt === 'number' && rtt > ULTRA_RTT_SPIKE)) {
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

  // Return lag detection analytics
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