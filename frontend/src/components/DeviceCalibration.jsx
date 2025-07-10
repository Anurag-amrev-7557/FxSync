import React, { useEffect, useState, useRef } from 'react';
import LoadingSpinner from './LoadingSpinner';

// Advanced calibration steps
const STEPS = [
  { label: 'Measuring audio latency', key: 'audioLatency' },
  { label: 'Testing sound output', key: 'testLatency' },
  { label: 'Checking network', key: 'networkLatency' },
  { label: 'Measuring jitter', key: 'jitter' },
  { label: 'Measuring clock drift', key: 'clockDrift' },
];

function getStatusIcon(status) {
  if (status === null) return (
    <svg className="w-4 h-4 text-neutral-500 animate-pulse" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /></svg>
  );
  if (typeof status === 'number') return (
    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
  );
  if (status === false) return (
    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
  );
  return null;
}

export default function DeviceCalibration({ onComplete }) {
  const [audioLatency, setAudioLatency] = useState(null);
  const [testLatency, setTestLatency] = useState(null);
  const [networkLatency, setNetworkLatency] = useState(null);
  const [jitter, setJitter] = useState(null);
  const [clockDrift, setClockDrift] = useState(null);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef();

  // Timer for elapsed time
  useEffect(() => {
    if (step > 0 && !done) {
      setStartTime(performance.now());
    }
  }, [step]);

  useEffect(() => {
    if (startTime && step > 0 && !done) {
      timerRef.current = setInterval(() => {
        setElapsed(((performance.now() - startTime) / 1000) || 0);
      }, 100);
      return () => clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [startTime, step, done]);

  // Step 1: Measure AudioContext.baseLatency
  useEffect(() => {
    setStep(1);
    setError('');
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.baseLatency && ctx.baseLatency > 0 && ctx.baseLatency < 1) {
        setAudioLatency(ctx.baseLatency);
      } else {
        setAudioLatency(null);
      }
    } catch (e) {
      setAudioLatency(null);
      setError('AudioContext not supported or blocked.');
    } finally {
      if (ctx && typeof ctx.close === 'function') ctx.close();
    }
    setTimeout(() => setStep(2), 600);
  }, []);

  // Step 2: Measure short audio test latency (multiple times for advanced stats)
  useEffect(() => {
    if (step !== 2) return;
    setError('');
    let latencies = [];
    let count = 0;
    const runs = 5;
    let cancelled = false;

    const runTest = () => {
      if (cancelled) return;
      let start;
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
          latencies.push(latency);
          ctx.close();
          count++;
          if (count < runs) {
            setTimeout(runTest, 120);
          } else {
            // Calculate mean and stddev for advanced calibration
            const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            const stddev = Math.sqrt(latencies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / latencies.length);
            setTestLatency({ mean, stddev, samples: latencies });
            setTimeout(() => setStep(3), 600);
          }
        };
      } catch (e) {
        setTestLatency(null);
        setError('Audio test failed. Please check your device output.');
        setTimeout(() => setStep(3), 600);
      }
    };

    runTest();
    return () => { cancelled = true; };
  }, [step]);

  // Step 3: Measure network latency and jitter (multiple pings)
  useEffect(() => {
    if (step !== 3) return;
    setError('');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const pings = [];
    let count = 0;
    const runs = 6;
    let cancelled = false;

    const ping = () => {
      if (cancelled) return;
      const start = performance.now();
      fetch(backendUrl + '/health', { cache: 'no-store' })
        .then(() => {
          const latency = (performance.now() - start) / 1000;
          pings.push(latency);
        })
        .catch(() => {
          pings.push(null);
          setError('Network check failed. Please check your connection.');
        })
        .finally(() => {
          count++;
          if (count < runs) {
            setTimeout(ping, 120);
          } else {
            // Remove failed pings (nulls)
            const validPings = pings.filter(x => typeof x === 'number');
            if (validPings.length === 0) {
              setNetworkLatency(null);
              setJitter(null);
            } else {
              const mean = validPings.reduce((a, b) => a + b, 0) / validPings.length;
              const stddev = Math.sqrt(validPings.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validPings.length);
              setNetworkLatency({ mean, stddev, samples: validPings });
              setJitter(stddev);
            }
            setTimeout(() => setStep(4), 600);
          }
        });
    };

    ping();
    return () => { cancelled = true; };
  }, [step]);

  // Step 4: Estimate clock drift (using Date.now() vs performance.now())
  useEffect(() => {
    if (step !== 4) return;
    setError('');
    let cancelled = false;
    let driftSamples = [];
    let lastPerf = performance.now();
    let lastDate = Date.now();
    let count = 0;
    const runs = 10;

    const measureDrift = () => {
      if (cancelled) return;
      setTimeout(() => {
        const nowPerf = performance.now();
        const nowDate = Date.now();
        const drift = ((nowDate - lastDate) - (nowPerf - lastPerf));
        driftSamples.push(drift);
        lastPerf = nowPerf;
        lastDate = nowDate;
        count++;
        if (count < runs) {
          measureDrift();
        } else {
          // Calculate mean drift in ms
          const mean = driftSamples.reduce((a, b) => a + b, 0) / driftSamples.length;
          setClockDrift({ mean, samples: driftSamples });
          setTimeout(() => setStep(5), 600);
        }
      }, 100);
    };

    measureDrift();
    return () => { cancelled = true; };
  }, [step]);

  // Step 5: Complete calibration
  useEffect(() => {
    if (step === 5 && !done) {
      setDone(true);
      clearInterval(timerRef.current);
      setTimeout(() => {
        onComplete && onComplete({
          audioLatency,
          testLatency,
          networkLatency,
          jitter,
          clockDrift
        });
      }, 800);
    }
  }, [step, done, audioLatency, testLatency, networkLatency, jitter, clockDrift, onComplete]);

  // UI
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/95 animate-fade-in">
      <div className="flex flex-col items-center gap-6 p-8 rounded-2xl shadow-2xl bg-neutral-900/80 border border-neutral-800 min-w-[320px] max-w-xs relative">
        <LoadingSpinner size="xl" text={null} />
        <div className="absolute top-4 right-4">
          <button
            className="text-xs text-neutral-500 hover:text-primary underline"
            onClick={() => setShowDetails(v => !v)}
            aria-label="Show calibration details"
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
        </div>
        <div className="text-white text-lg font-semibold tracking-tight mb-2 animate-fade-in-slow">
          Calibrating your device…
        </div>
        <div className="w-full flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span className="flex items-center gap-2">
              {getStatusIcon(audioLatency)}
              Audio Latency
            </span>
            <span className={audioLatency !== null ? 'text-primary font-bold' : 'opacity-50'}>
              {audioLatency !== null
                ? `${(audioLatency * 1000).toFixed(1)} ms`
                : '…'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span className="flex items-center gap-2">
              {getStatusIcon(testLatency && testLatency.mean)}
              Test Sound
            </span>
            <span className={testLatency !== null ? 'text-primary font-bold' : 'opacity-50'}>
              {testLatency !== null
                ? `${(testLatency.mean * 1000).toFixed(1)} ms`
                : '…'}
              {testLatency && testLatency.stddev !== undefined && (
                <span className="ml-1 text-xs text-neutral-400">±{(testLatency.stddev * 1000).toFixed(1)} ms</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span className="flex items-center gap-2">
              {getStatusIcon(networkLatency && networkLatency.mean)}
              Network
            </span>
            <span className={networkLatency !== null ? 'text-primary font-bold' : 'opacity-50'}>
              {networkLatency !== null
                ? `${(networkLatency.mean * 1000).toFixed(1)} ms`
                : '…'}
              {networkLatency && networkLatency.stddev !== undefined && (
                <span className="ml-1 text-xs text-neutral-400">±{(networkLatency.stddev * 1000).toFixed(1)} ms</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span className="flex items-center gap-2">
              {getStatusIcon(jitter)}
              Jitter
            </span>
            <span className={jitter !== null ? 'text-primary font-bold' : 'opacity-50'}>
              {jitter !== null
                ? `${(jitter * 1000).toFixed(1)} ms`
                : '…'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span className="flex items-center gap-2">
              {getStatusIcon(clockDrift && clockDrift.mean)}
              Clock Drift
            </span>
            <span className={clockDrift !== null ? 'text-primary font-bold' : 'opacity-50'}>
              {clockDrift !== null
                ? `${clockDrift.mean.toFixed(2)} ms`
                : '…'}
            </span>
          </div>
        </div>
        {showDetails && (
          <div className="w-full mt-2 p-2 rounded bg-neutral-800/60 text-xs text-neutral-300 animate-fade-in-fast">
            <div>
              <span className="font-semibold">Elapsed:</span> {elapsed.toFixed(1)}s
            </div>
            <div>
              <span className="font-semibold">AudioContext.baseLatency:</span> {audioLatency !== null ? audioLatency : 'n/a'}
            </div>
            <div>
              <span className="font-semibold">Test buffer latency samples:</span> {testLatency && testLatency.samples ? testLatency.samples.map(x => (x * 1000).toFixed(1)).join(', ') + ' ms' : 'n/a'}
            </div>
            <div>
              <span className="font-semibold">Network ping samples:</span> {networkLatency && networkLatency.samples ? networkLatency.samples.map(x => (x * 1000).toFixed(1)).join(', ') + ' ms' : 'n/a'}
            </div>
            <div>
              <span className="font-semibold">Jitter (stddev):</span> {jitter !== null ? (jitter * 1000).toFixed(2) + ' ms' : 'n/a'}
            </div>
            <div>
              <span className="font-semibold">Clock drift samples:</span> {clockDrift && clockDrift.samples ? clockDrift.samples.map(x => x.toFixed(2)).join(', ') + ' ms' : 'n/a'}
            </div>
          </div>
        )}
        {error && (
          <div className="w-full mt-2 p-2 rounded bg-red-900/30 text-xs text-red-300 animate-fade-in-fast">
            {error}
          </div>
        )}
        <div className="mt-6 text-xs text-neutral-500 text-center animate-fade-in-slow">
          This helps ensure perfect sync for your session.<br />Please keep this tab active.
        </div>
      </div>
    </div>
  );
}