import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { getClientId } from '../utils/clientId';

const CalibrationContext = createContext();

export function useCalibration() {
  const context = useContext(CalibrationContext);
  if (!context) {
    throw new Error('useCalibration must be used within a CalibrationProvider');
  }
  return context;
}

export function CalibrationProvider({ children }) {
  const [calibrationData, setCalibrationData] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [hasCalibrated, setHasCalibrated] = useState(false);
  const [calibrationError, setCalibrationError] = useState(null);

  // Load calibration data from localStorage on mount
  useEffect(() => {
    try {
      const savedCalibration = localStorage.getItem('fxSync_calibration');
      console.log('Loading calibration data from localStorage:', savedCalibration);
      
      if (savedCalibration) {
        const data = JSON.parse(savedCalibration);
        console.log('Parsed calibration data:', data);
        
        // Check if calibration is still valid (less than 24 hours old)
        const isRecent = Date.now() - data.timestamp < 24 * 60 * 60 * 1000;
        console.log('Calibration age check:', {
          now: Date.now(),
          timestamp: data.timestamp,
          age: Date.now() - data.timestamp,
          isRecent
        });
        
        if (isRecent) {
          setCalibrationData(data);
          setHasCalibrated(true);
          console.log('Calibration data loaded successfully');
        } else {
          // Clear old calibration data
          localStorage.removeItem('fxSync_calibration');
          console.log('Old calibration data cleared');
        }
      } else {
        console.log('No calibration data found in localStorage');
      }
    } catch (error) {
      console.error('Failed to load calibration data:', error);
    }
  }, []);

  const startCalibration = () => {
    setIsCalibrating(true);
    setCalibrationError(null);
  };

  const completeCalibration = (data) => {
    console.log('Completing calibration with data:', data);
    setCalibrationData(data);
    setIsCalibrating(false);
    setHasCalibrated(true);
    setCalibrationError(null);
    
    // Also save to localStorage immediately
    try {
      localStorage.setItem('fxSync_calibration', JSON.stringify(data));
      console.log('[CalibrationContext] Calibration data saved to localStorage');
    } catch (error) {
      console.error('[CalibrationContext] Failed to save calibration data to localStorage:', error);
    }
  };

  const failCalibration = (error) => {
    setIsCalibrating(false);
    setCalibrationError(error);
  };

  const resetCalibration = () => {
    setCalibrationData(null);
    setHasCalibrated(false);
    setCalibrationError(null);
    localStorage.removeItem('fxSync_calibration');
  };

  const getCalibrationValue = (key, defaultValue = null) => {
    if (!calibrationData) return defaultValue;
    return calibrationData[key] ?? defaultValue;
  };

  const isCalibrationValid = () => {
    if (!calibrationData) return false;
    
    // Check if calibration is recent (less than 24 hours old)
    const isRecent = Date.now() - calibrationData.timestamp < 24 * 60 * 60 * 1000;
    
    // Check if we have essential calibration data
    const hasEssentialData = calibrationData.audioLatency !== undefined && 
                            calibrationData.avgRTT !== undefined &&
                            calibrationData.timeOffset !== undefined &&
                            calibrationData.jitter !== undefined;
    
    // Debug logging to help identify the issue
    if (!isRecent) {
      console.log('Calibration not recent:', {
        now: Date.now(),
        timestamp: calibrationData.timestamp,
        age: Date.now() - calibrationData.timestamp,
        maxAge: 24 * 60 * 60 * 1000
      });
    }
    
    if (!hasEssentialData) {
      console.log('Missing essential calibration data:', {
        audioLatency: calibrationData.audioLatency,
        avgRTT: calibrationData.avgRTT,
        timeOffset: calibrationData.timeOffset,
        jitter: calibrationData.jitter
      });
    }
    
    return isRecent && hasEssentialData;
  };

  const getOptimizedSyncParams = () => {
    if (!isCalibrationValid()) {
      // Return default values if no valid calibration
      const defaultParams = {
        audioLatency: 80,
        networkRTT: 50,
        timeOffset: 0,
        jitter: 10,
        syncInterval: 1000,
        driftThreshold: 0.05,
        correctionStrength: 0.8
      };
      console.log('[CalibrationContext] Using default sync params:', defaultParams);
      return defaultParams;
    }

    const { audioLatency, avgRTT, timeOffset, jitter } = calibrationData;
    
    // Calculate optimized sync parameters based on calibration data
    const networkQuality = Math.max(0.1, Math.min(1.0, 1 - (avgRTT / 1000))); // 0-1 scale
    const jitterQuality = Math.max(0.1, Math.min(1.0, 1 - (jitter / 100))); // 0-1 scale
    
    // Adaptive sync interval based on network quality
    const syncInterval = Math.max(400, Math.min(2000, 1000 / networkQuality));
    
    // Adaptive drift threshold based on jitter
    const driftThreshold = Math.max(0.02, Math.min(0.2, 0.05 + (jitter / 1000)));
    
    // Adaptive correction strength based on network stability
    const correctionStrength = Math.max(0.3, Math.min(1.0, 0.8 * networkQuality));

    const optimizedParams = {
      audioLatency: Math.round(audioLatency),
      networkRTT: Math.round(avgRTT),
      timeOffset: Math.round(timeOffset),
      jitter: Math.round(jitter),
      syncInterval: Math.round(syncInterval),
      driftThreshold: Math.round(driftThreshold * 1000) / 1000,
      correctionStrength: Math.round(correctionStrength * 100) / 100,
      networkQuality: Math.round(networkQuality * 100) / 100,
      jitterQuality: Math.round(jitterQuality * 100) / 100
    };
    
    console.log('[CalibrationContext] Using optimized sync params:', optimizedParams);
    return optimizedParams;
  };

  // Memoize the calibration validation result
  const isValid = useMemo(() => {
    const valid = isCalibrationValid();
    console.log('[CalibrationContext] Calibration validation result:', valid);
    return valid;
  }, [calibrationData]);

  const value = {
    calibrationData,
    isCalibrating,
    hasCalibrated,
    calibrationError,
    isCalibrationValid: isValid,
    startCalibration,
    completeCalibration,
    failCalibration,
    resetCalibration,
    getCalibrationValue,
    getOptimizedSyncParams
  };

  return (
    <CalibrationContext.Provider value={value}>
      {children}
    </CalibrationContext.Provider>
  );
} 