import React from 'react';
import { useCalibration } from '../contexts/CalibrationContext';

export default function CalibrationStatus({ className = '' }) {
  const { 
    calibrationData, 
    isCalibrationValid, 
    getOptimizedSyncParams, 
    resetCalibration 
  } = useCalibration();

  if (!isCalibrationValid) {
    return (
      <div className={`flex items-center gap-2 text-yellow-400 text-xs ${className}`}>
        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
        <span>Calibration needed</span>
      </div>
    );
  }

  const params = getOptimizedSyncParams();
  const qualityColor = params.networkQuality > 0.8 ? 'text-green-400' : 
                      params.networkQuality > 0.6 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <div className="w-2 h-2 bg-green-400 rounded-full" />
      <span className="text-neutral-400">Sync:</span>
      <span className={qualityColor}>
        {params.networkQuality * 100}%
      </span>
      <button
        onClick={resetCalibration}
        className="text-neutral-500 hover:text-neutral-300 transition-colors"
        title="Recalibrate device"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
} 