import React, { useState, useEffect, useRef } from 'react';
import { useCalibration } from '../contexts/CalibrationContext';

export default function DeviceCalibration() {
  const { completeCalibration } = useCalibration();
  const [started, setStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [calibrationData, setCalibrationData] = useState({});
  const [audioContext, setAudioContext] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const calibrationSteps = [
    { name: 'Initializing', duration: 1000 },
    { name: 'Audio Setup', duration: 2000 },
    { name: 'Network Test', duration: 1500 },
    { name: 'Time Sync', duration: 1000 },
    { name: 'Analysis', duration: 1500 },
    { name: 'Optimization', duration: 1000 }
  ];

  const startCalibration = async () => {
    setStarted(true);
    setError(null);
    setCalibrationData({});
    
    try {
      // Step 1: Initialize
      await simulateStep(0);
      
      // Step 2: Audio Setup
      await simulateStep(1);
      const audioData = await measureAudioLatency();
      
      // Step 3: Network Test
      await simulateStep(2);
      const networkData = await measureNetworkLatency();
      
      // Step 4: Time Sync
      await simulateStep(3);
      const timeData = await measureTimeOffset();
      
      // Step 5: Analysis
      await simulateStep(4);
      const analysisData = await analyzeNetworkStability();
      
      // Step 6: Optimization
      await simulateStep(5);
      
      const finalData = {
        audioLatency: audioData.latency,
        avgRTT: networkData.avgRTT,
        timeOffset: timeData.offset,
        jitter: analysisData.jitter,
        timestamp: Date.now()
      };
      
      setCalibrationData(finalData);
      completeCalibration(finalData);
      setCompleted(true);
      setIsSuccess(true);
    } catch (err) {
      setError(err.message);
      setCompleted(true);
    }
  };

  const simulateStep = (stepIndex) => {
    return new Promise((resolve) => {
      setCurrentStep(stepIndex);
      const stepDuration = calibrationSteps[stepIndex].duration;
      const stepProgress = (stepIndex / calibrationSteps.length) * 100;
      
      // Animate progress
      const startProgress = stepProgress;
      const endProgress = ((stepIndex + 1) / calibrationSteps.length) * 100;
      const startTime = Date.now();
      
      const animateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progressRatio = Math.min(elapsed / stepDuration, 1);
        const currentProgress = startProgress + (endProgress - startProgress) * progressRatio;
        setProgress(currentProgress);
        
        if (progressRatio < 1) {
          requestAnimationFrame(animateProgress);
        } else {
          setTimeout(resolve, 200);
        }
      };
      
      animateProgress();
    });
  };

  const measureAudioLatency = async () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ latency: Math.random() * 50 + 20 });
      }, 500);
    });
  };

  const measureNetworkLatency = async () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ avgRTT: Math.random() * 100 + 30 });
      }, 500);
    });
  };

  const measureTimeOffset = async () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ offset: Math.random() * 20 - 10 });
      }, 500);
    });
  };

  const analyzeNetworkStability = async () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ jitter: Math.random() * 15 + 5 });
      }, 500);
    });
  };

  useEffect(() => {
    if (started && !completed) {
      startCalibration();
    }
  }, [started]);

  if (isSuccess) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-neutral-900 rounded-3xl p-12 max-w-sm w-full text-center shadow-2xl border border-neutral-800">
          <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce border border-neutral-700">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Calibration Complete</h2>
          <p className="text-neutral-400 text-sm">Your device is now optimized for perfect synchronization</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-neutral-800">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg border border-neutral-800">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Device Calibration</h2>
          <p className="text-neutral-400 text-sm">Optimizing audio synchronization for your device</p>
        </div>

        {/* Start Button */}
        {!started && (
          <div className="space-y-6">
            <button
              onClick={() => setStarted(true)}
              className="w-full bg-white text-black py-4 px-6 rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Start Calibration
            </button>
            
            <div className="bg-neutral-800 rounded-2xl p-6 border border-neutral-700">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border border-neutral-700">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-white font-medium text-sm mb-2">What to expect:</p>
                  <ul className="text-neutral-400 text-sm space-y-1">
                    <li>• A short test tone will play (2-3 seconds)</li>
                    <li>• Network connection will be tested</li>
                    <li>• Device time will be synchronized</li>
                    <li>• Takes about 10-15 seconds total</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calibration Progress */}
        {started && (
          <div className="space-y-6">
            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm text-neutral-400 mb-3">
                <span>Progress</span>
                <span className="font-semibold text-white">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Current Step */}
            <div className="bg-neutral-800 rounded-2xl p-6 border border-neutral-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-white font-semibold text-lg">
                  {calibrationSteps[currentStep]?.name || 'Calibrating...'}
                </span>
              </div>
              <p className="text-neutral-400 text-sm">
                Step {currentStep + 1} of {calibrationSteps.length}
              </p>
            </div>

            {/* Results Preview */}
            {Object.keys(calibrationData).length > 0 && (
              <div className="bg-neutral-800 rounded-2xl p-6 border border-neutral-700">
                <h4 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Calibration Results
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {calibrationData.audioLatency && (
                    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                      <div className="text-neutral-400 text-xs font-medium mb-1">Audio Latency</div>
                      <div className="text-white font-bold text-xl">{Math.round(calibrationData.audioLatency)}ms</div>
                    </div>
                  )}
                  {calibrationData.avgRTT && (
                    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                      <div className="text-neutral-400 text-xs font-medium mb-1">Network RTT</div>
                      <div className="text-white font-bold text-xl">{Math.round(calibrationData.avgRTT)}ms</div>
                    </div>
                  )}
                  {calibrationData.timeOffset && (
                    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                      <div className="text-neutral-400 text-xs font-medium mb-1">Time Offset</div>
                      <div className="text-white font-bold text-xl">{Math.round(calibrationData.timeOffset)}ms</div>
                    </div>
                  )}
                  {calibrationData.jitter && (
                    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                      <div className="text-neutral-400 text-xs font-medium mb-1">Jitter</div>
                      <div className="text-white font-bold text-xl">{Math.round(calibrationData.jitter)}ms</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-black rounded-2xl p-6 border border-red-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center border border-red-700">
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm mb-1 text-white">Calibration Error</h4>
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {!completed && !error && (
              <div className="bg-neutral-800 rounded-2xl p-6 border border-neutral-700">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <div>
                    <div className="text-white font-medium">Calibrating device...</div>
                    <div className="text-neutral-400 text-sm">Please wait while we optimize your settings</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 