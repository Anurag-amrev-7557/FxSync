import React, { useEffect, useState } from 'react';
import LoadingSpinner from './LoadingSpinner';

export default function DeviceCalibration({ onComplete }) {
  const [audioLatency, setAudioLatency] = useState(null);
  const [testLatency, setTestLatency] = useState(null);
  const [networkLatency, setNetworkLatency] = useState(null);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  // Measure AudioContext.baseLatency
  useEffect(() => {
    setStep(1);
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.baseLatency && ctx.baseLatency > 0 && ctx.baseLatency < 1) {
        setAudioLatency(ctx.baseLatency);
      }
    } catch (e) {
      setAudioLatency(null);
    } finally {
      if (ctx && typeof ctx.close === 'function') ctx.close();
    }
    setTimeout(() => setStep(2), 500);
  }, []);

  // Measure short audio test latency
  useEffect(() => {
    if (step !== 2) return;
    let start, audio;
    // Use a short silent buffer for test
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = ctx.createBuffer(1, ctx.sampleRate / 10, ctx.sampleRate); // 0.1s
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      start = performance.now();
      source.start();
      source.onended = () => {
        const latency = (performance.now() - start) / 1000;
        setTestLatency(latency);
        ctx.close();
        setTimeout(() => setStep(3), 500);
      };
    } catch (e) {
      setTestLatency(null);
      setTimeout(() => setStep(3), 500);
    }
  }, [step]);

  // Measure network latency (ping backend)
  useEffect(() => {
    if (step !== 3) return;
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const start = performance.now();
    fetch(backendUrl + '/health')
      .then(() => setNetworkLatency((performance.now() - start) / 1000))
      .catch(() => setNetworkLatency(null))
      .finally(() => {
        setTimeout(() => setStep(4), 500);
      });
  }, [step]);

  // Complete calibration
  useEffect(() => {
    if (step === 4 && !done) {
      setDone(true);
      setTimeout(() => {
        onComplete && onComplete({
          audioLatency,
          testLatency,
          networkLatency
        });
      }, 600);
    }
  }, [step, done, audioLatency, testLatency, networkLatency, onComplete]);

  // UI
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/95 animate-fade-in">
      <div className="flex flex-col items-center gap-6 p-8 rounded-2xl shadow-2xl bg-neutral-900/80 border border-neutral-800 min-w-[320px] max-w-xs">
        <LoadingSpinner size="xl" text={null} />
        <div className="text-white text-lg font-semibold tracking-tight mb-2 animate-fade-in-slow">Calibrating your device…</div>
        <div className="w-full flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span>Audio Latency</span>
            <span className={audioLatency !== null ? 'text-primary font-bold' : 'opacity-50'}>
              {audioLatency !== null ? `${(audioLatency * 1000).toFixed(1)} ms` : '…'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span>Test Sound</span>
            <span className={testLatency !== null ? 'text-primary font-bold' : 'opacity-50'}>
              {testLatency !== null ? `${(testLatency * 1000).toFixed(1)} ms` : '…'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span>Network</span>
            <span className={networkLatency !== null ? 'text-primary font-bold' : 'opacity-50'}>
              {networkLatency !== null ? `${(networkLatency * 1000).toFixed(1)} ms` : '…'}
            </span>
          </div>
        </div>
        <div className="mt-6 text-xs text-neutral-500 text-center animate-fade-in-slow">
          This helps ensure perfect sync for your session.<br />Please keep this tab active.
        </div>
      </div>
    </div>
  );
} 