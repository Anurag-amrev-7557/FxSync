import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import SessionForm from './SessionForm';
import AudioPlayer from './AudioPlayer';
import DeviceList from './DeviceList';
import ControllerRequestManager from './ControllerRequestManager';
import ChatBox from './ChatBox';
import Playlist from './Playlist';
import ResizableLayout from './ResizableLayout';
import ExitRoomModal from './ExitRoomModal';
import BottomTabBar from './BottomTabBar';
import useSmoothAppearance from '../hooks/useSmoothAppearance';
import {
  loadMessages,
  loadQueue,
  saveSessionData,
  loadSessionData,
  clearSessionData,
  cleanupOldSessions,
} from '../utils/persistence';
import usePeerTimeSync from '../hooks/usePeerTimeSync';
import useChatMessages from '../hooks/useChatMessages';
import useQueue from '../hooks/useQueue';
import useUltraPreciseOffset from '../hooks/useUltraPreciseOffset';
import useModalState from '../hooks/useModalState';
import useMobileTab from '../hooks/useMobileTab';
import useDeviceType from '../hooks/useDeviceType';

// --- CalibrateLatencyWizard: Automatic device-specific latency measurement ---
function CalibrateLatencyWizard({ onDone, socket, onSkip, theme = 'dark' }) {
  // --- Accessibility: Focus trap, ARIA, keyboard nav ---
  const modalRef = useRef(null);
  useEffect(() => {
    if (!modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) focusable[0].focus();
    function trap(e) {
      if (e.key !== 'Tab') return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    modalRef.current.addEventListener('keydown', trap);
    return () => modalRef.current && modalRef.current.removeEventListener('keydown', trap);
  }, []);

  // --- Calibration steps ---
  const steps = [
    { key: 'latency', label: 'Audio Latency', desc: 'How quickly your device can play sound.' },
    { key: 'rtt', label: 'RTT', desc: 'Network round-trip time to server.' },
    { key: 'jitter', label: 'Jitter', desc: 'Network timing variability.' },
    { key: 'offset', label: 'Offset', desc: 'Clock difference with server.' },
  ];
  const [step, setStep] = useState(0); // 0: latency, 1: rtt, 2: jitter, 3: offset
  const [measuring, setMeasuring] = useState(true);
  const [latency, setLatency] = useState(null);
  const [rtt, setRtt] = useState(null);
  const [jitter, setJitter] = useState(null);
  const [offset, setOffset] = useState(null);
  const [miniProgress, setMiniProgress] = useState(0); // 0-100 for current step
  const [calibrationDone, setCalibrationDone] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [error, setError] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const [manualValues, setManualValues] = useState({ latency: '', rtt: '', jitter: '', offset: '' });
  const [calibrationKey, setCalibrationKey] = useState(0); // For remount
  const [ariaStatus, setAriaStatus] = useState('');

  // --- Minimum time per step for smoothness ---
  const minStepTime = 300;

  useEffect(() => {
    let minTimeTimeout;
    let cancelled = false;
    async function measureAll() {
      setCalibrationDone(false);
      setShowButtons(false);
      setShowResults(false);
      setError(null);
      setAriaStatus('');
      // --- Step 1: Audio Latency ---
      setStep(0);
      setMiniProgress(0);
      let measured = null;
      let audioError = null;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.baseLatency && ctx.baseLatency > 0 && ctx.baseLatency < 1) {
          measured = ctx.baseLatency;
        } else {
          audioError = 'Could not measure audio latency (unsupported browser/device).';
        }
        await ctx.close();
      } catch (e) {
        audioError = 'AudioContext error: ' + (e.message || e);
      }
      setLatency(measured);
      setMiniProgress(100);
      await new Promise(res => setTimeout(res, minStepTime));
      if (audioError) {
        setError(audioError);
        setMeasuring(false);
        setCalibrationDone(false);
        setShowButtons(true);
        setAriaStatus('Calibration failed: ' + audioError);
        return;
      }
      if (cancelled) return;
      // --- Step 2: RTT/Jitter/Offset ---
      setStep(1);
      setMiniProgress(0);
      let rttSamples = [];
      let offsetSamples = [];
      let socketError = null;
      if (socket && typeof socket.emit === 'function') {
        for (let i = 0; i < 5; ++i) {
          await new Promise(resolve => {
            const clientSent = Date.now();
            let responded = false;
            const timeout = setTimeout(() => {
              if (!responded) {
                socketError = 'Network/server error during RTT test.';
                setError(socketError);
                setMeasuring(false);
                setCalibrationDone(false);
                setShowButtons(true);
                setAriaStatus('Calibration failed: ' + socketError);
                resolve();
              }
            }, 2000);
            socket.emit('time_sync', { clientSent }, (res) => {
              responded = true;
              clearTimeout(timeout);
              const clientReceived = Date.now();
              if (res && typeof res.serverTime === 'number' && typeof res.serverReceived === 'number') {
                const rttSample = clientReceived - clientSent;
                const offsetSample = res.serverTime + rttSample / 2 - clientReceived;
                rttSamples.push(rttSample);
                offsetSamples.push(offsetSample);
              }
              setMiniProgress(Math.round(((i + 1) / 5) * 100));
              setTimeout(resolve, 15);
            });
          });
          if (socketError) return;
        }
      } else {
        socketError = 'Socket not available.';
        setError(socketError);
        setMeasuring(false);
        setCalibrationDone(false);
        setShowButtons(true);
        setAriaStatus('Calibration failed: ' + socketError);
        return;
      }
      if (cancelled) return;
      // --- Step 3: Jitter/Offset Calculation ---
      setStep(2);
      setMiniProgress(0);
      await new Promise(res => setTimeout(res, minStepTime));
      if (rttSamples.length) {
        const avgRtt = rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length;
        const mean = avgRtt;
        const stddev = Math.sqrt(rttSamples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rttSamples.length);
        setRtt(avgRtt);
        setJitter(stddev);
      }
      if (offsetSamples.length) {
        const avgOffset = offsetSamples.reduce((a, b) => a + b, 0) / offsetSamples.length;
        setOffset(avgOffset);
      }
      setMiniProgress(100);
      await new Promise(res => setTimeout(res, minStepTime));
      // --- Store in localStorage ---
      const key = 'audioLatency_' + (navigator.userAgent || 'unknown');
      const data = {
        latency: measured,
        rtt: rttSamples.length ? rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length : null,
        jitter: rttSamples.length ? Math.sqrt(rttSamples.reduce((a, b) => a + Math.pow(b - (rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length)), 2), 0) / rttSamples.length : null,
        offset: offsetSamples.length ? offsetSamples.reduce((a, b) => a + b, 0) / offsetSamples.length : null,
      };
      localStorage.setItem(key, JSON.stringify(data));
      // Only now, after all steps, mark measuring as false
      setMeasuring(false);
      setCalibrationDone(true);
      setShowResults(true);
      setAriaStatus('Calibration complete.');
      // Wait for the progress bar to visually reach 100% (matches transition duration)
      minTimeTimeout = setTimeout(() => setShowButtons(true), 100);
    }
    measureAll();
    return () => {
      cancelled = true;
      clearTimeout(minTimeTimeout);
    };
  }, [onDone, socket, calibrationKey]);

  // Handler for Enter Room
  const handleEnterRoom = () => {
    setAriaStatus('Entering room.');
    onDone({ latency, rtt, jitter, offset });
  };
  // Handler for Recalibrate
  const handleRecalibrate = () => {
    setCalibrationKey(k => k + 1);
    setStep(0);
    setMeasuring(true);
    setCalibrationDone(false);
    setShowButtons(false);
    setLatency(null);
    setRtt(null);
    setJitter(null);
    setOffset(null);
    setError(null);
    setShowResults(false);
    setManualOverride(false);
    setManualValues({ latency: '', rtt: '', jitter: '', offset: '' });
    setAriaStatus('Recalibrating.');
  };
  // Handler for Skip
  const handleSkip = () => {
    setAriaStatus('Calibration skipped.');
    if (onSkip) onSkip();
    else onDone({ latency: null, rtt: null, jitter: null, offset: null });
  };
  // Handler for manual override
  const handleManualOverride = () => {
    setManualOverride(true);
    setShowResults(true);
    setShowButtons(true);
    setAriaStatus('Manual override.');
  };
  // Handler for manual value change
  const handleManualChange = (k, v) => {
    setManualValues(vals => ({ ...vals, [k]: v }));
  };
  // Handler for manual submit
  const handleManualSubmit = () => {
    setAriaStatus('Manual calibration entered.');
    onDone({
      latency: parseFloat(manualValues.latency) || null,
      rtt: parseFloat(manualValues.rtt) || null,
      jitter: parseFloat(manualValues.jitter) || null,
      offset: parseFloat(manualValues.offset) || null,
    });
  };
  // Handler for copy results
  const handleCopy = () => {
    const text = `Latency: ${latency}\nRTT: ${rtt}\nJitter: ${jitter}\nOffset: ${offset}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // --- Theme ---
  const isDark = theme === 'dark';
  const cardClass =
    'relative flex flex-col items-center w-full max-w-xs sm:max-w-md mx-auto px-4 sm:px-8 py-8 sm:py-12 rounded-2xl ' +
    (isDark ? 'bg-black/95 border border-white/10' : 'bg-white/95 border border-black/10') +
    ' animate-fade-in-slow transition-all duration-500';

  // --- Animation helpers ---
  const [showModal, setShowModal] = useState(true);
  useEffect(() => { setShowModal(true); return () => setShowModal(false); }, []);
  // For fade/slide in/out of sections (no delay, fast transitions)
  const [showResultsAnim, setShowResultsAnim] = useState(false);
  useEffect(() => { setShowResultsAnim(showResults); }, [showResults]);
  const [showButtonsAnim, setShowButtonsAnim] = useState(false);
  useEffect(() => { setShowButtonsAnim(showButtons); }, [showButtons]);
  const [showErrorAnim, setShowErrorAnim] = useState(false);
  useEffect(() => { setShowErrorAnim(!!error); }, [error]);
  const [showHelpAnim, setShowHelpAnim] = useState(false);
  useEffect(() => { setShowHelpAnim(showHelp); }, [showHelp]);

  // --- Circular Progress Bar SVG ---
  const circleSize = 64;
  const strokeWidth = 2;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // For checkmark animation
  const tickPath = "M24 34 L30 40 L44 24";
  const tickLength = 28; // visually fits the path

  // --- Progress Calculation: linear ---
  let progress;
  if (calibrationDone && showButtons) {
    progress = 100;
  } else {
    progress = Math.round(((step + miniProgress / 100) / steps.length) * 100);
  }
  // Ensure progress never goes backward
  const maxProgressRef = useRef(0);
  useEffect(() => {
    if (progress > maxProgressRef.current) {
      maxProgressRef.current = progress;
    }
  }, [progress]);
  const displayedProgress = Math.max(progress, maxProgressRef.current);
  const progressValue = Math.max(0, Math.min(displayedProgress, 100));
  const offsetValue = circumference * (1 - progressValue / 100);

  // --- UI ---
  // Determine which steps are completed
  const completedStep = calibrationDone && showButtons ? steps.length : step;
  return (
    <div
      ref={modalRef}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 transition-opacity duration-500 ${showModal ? 'opacity-100' : 'opacity-0'}`}
      style={{ minHeight: '100vh', minWidth: '100vw' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calib-title"
      aria-describedby="calib-desc"
    >
      <div
        className={
          'relative flex flex-col items-center w-full max-w-xs sm:max-w-md md:max-w-lg mx-auto p-3 sm:p-6 md:p-10 rounded-xl sm:rounded-2xl ' +
          'bg-black border border-white/10 shadow-none transition-all duration-500 animate-fade-in-slow'
        }
        style={{
          background: 'rgba(0,0,0,1)',
          boxShadow: 'none',
          border: '1.5px solid #fff2',
          transition: 'background 0.2s, box-shadow 0.2s, border 0.2s',
        }}
      >
        {/* Top: Circular progress or tick */}
        <div className="flex items-center justify-center mb-6 transition-all duration-200" style={{ height: circleSize }}>
          <svg
            width={circleSize}
            height={circleSize}
            viewBox={`0 0 ${circleSize} ${circleSize}`}
            className="block"
            aria-hidden="true"
            style={{ display: 'block', transition: 'all 0.2s cubic-bezier(.4,1,.4,1)' }}
          >
            {/* Track */}
            <circle
              cx={circleSize / 2}
              cy={circleSize / 2}
              r={radius}
              fill="none"
              stroke="#222"
              strokeWidth={strokeWidth}
              style={{
                transition: 'stroke 0.2s, opacity 0.2s',
                opacity: calibrationDone ? 0 : 1
              }}
            />
            {/* Progress (always present, animates to full) */}
            <circle
              cx={circleSize / 2}
              cy={circleSize / 2}
              r={radius}
              fill="none"
              stroke="#fff"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={calibrationDone ? 0 : offsetValue}
              strokeLinecap="round"
              style={{
                transition: calibrationDone
                  ? 'stroke-dashoffset 0.3s cubic-bezier(.4,1,.4,1), opacity 0.2s'
                  : 'stroke-dashoffset 0.2s cubic-bezier(.4,1,.4,1), opacity 0.2s',
                filter: 'drop-shadow(0 0 2px #fff2)',
                opacity: calibrationDone ? 0 : 1
              }}
            />
            {/* Percentage, fades out as tick appears */}
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="1rem"
              fill="#fff"
              fontFamily="monospace"
              fontWeight="400"
              style={{
                letterSpacing: '-0.04em',
                opacity: calibrationDone ? 0 : 0.7,
                userSelect: 'none',
                transition: 'opacity 0.2s',
              }}
            >
              {Math.round(progressValue)}%
            </text>
            {/* Checkmark, morphs in as progress completes */}
            <path
              d={tickPath}
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={tickLength}
              strokeDashoffset={calibrationDone ? 0 : tickLength}
              style={{
                filter: 'drop-shadow(0 0 2px #fff2)',
                transition: calibrationDone
                  ? 'stroke-dashoffset 0.2s 0.05s cubic-bezier(.4,1,.4,1), opacity 0.2s'
                  : 'stroke-dashoffset 0.15s',
                opacity: calibrationDone ? 1 : 0,
              }}
            />
          </svg>
        </div>

        {/* Title & subtitle */}
        <div className="mb-4 sm:mb-6 flex flex-col items-center transition-all duration-200">
          <span
            id="calib-title"
            className="text-base sm:text-lg md:text-xl font-semibold tracking-tight font-sans select-none transition-colors duration-500 text-white"
            style={{ letterSpacing: '-0.01em' }}
          >
            {calibrationDone ? 'Calibration Complete' : 'Device & Network Calibration'}
          </span>
          <span
            id="calib-desc"
            className="text-xs sm:text-sm text-center flex justify-center text-white/60 mt-1 font-sans select-none transition-colors duration-500"
            style={{ fontWeight: 400, letterSpacing: '-0.01em' }}
          >
            {calibrationDone
              ? 'Your device and network are ready for perfectly synced music.'
              : 'Measuring your device and network timing for perfect music sync.'}
          </span>
        </div>

        {/* Linear progress bar */}
        {!showButtons && (
          <div className="w-full max-w-xs sm:max-w-sm mb-6 sm:mb-8">
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-200"
                style={{
                  width: `${progressValue}%`,
                  transition: 'width 0.2s cubic-bezier(.4,1,.4,1)'
                }}
              />
            </div>
          </div>
        )}

        {/* Bottom: Enter button and info */}
        <div className={`flex flex-col items-center w-full max-w-xs sm:max-w-sm mt-5 transition-all duration-200 ${calibrationDone && showButtons ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none h-0'}`}>
          <button
            className="w-full py-3 sm:py-[6px] rounded-full bg-white text-black text-base font-semibold transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white transition-all duration-300"
            onClick={handleEnterRoom}
            tabIndex={0}
          >
            Enter Room
          </button>
          <div className="mt-3 sm:mt-4 text-xs sm:text-sm text-white/40 text-center font-sans select-none">
            For best results, use your device's native speakers.
          </div>
        </div>
        {/* ARIA live region for screen readers */}
        <div className="sr-only" aria-live="polite">{ariaStatus}</div>
      </div>
    </div>
  );
}

function SessionPage({
  currentSessionId,
  setCurrentSessionId,
  displayName, // <-- add this line
  setDisplayName,
  onLeaveSession,
  socket,
  connected,
  controllerId,
  controllerClientId,
  clients,
  clientId,
  getServerTime,
  pendingControllerRequests,
  controllerRequestReceived,
  controllerOfferReceived,
  controllerOfferSent,
  controllerOfferAccepted,
  controllerOfferDeclined,
  sessionSyncState,
  rtt,
  timeOffset,
  jitter,
  drift,
  forceNtpBatchSync
}) {
  const { sessionId: urlSessionId } = useParams()
  const pendingTrackIdx = useRef(null); // Buffer for track_change before queue is set
  const [peerIds, setPeerIds] = useState([]);
  const { isMobile, isTablet, isDesktop, width } = useDeviceType();

  // Clean up old sessions on component mount
  useEffect(() => {
    cleanupOldSessions()
  }, [])

  // Clear session data when leaving a session
  useEffect(() => {
    return () => {
      // This cleanup runs when component unmounts or session changes
      // We don't clear data here as we want to persist it
    }
  }, [currentSessionId])

  // Define isController before using it in hooks
  const isController = controllerClientId && clientId && controllerClientId === clientId

  // Smooth appearance hooks for elements that load late
  const connectionStatus = useSmoothAppearance(connected !== undefined, 100, 'animate-fade-in-fast')
  const controllerStatus = useSmoothAppearance(isController, 200, 'animate-bounce-in')
  const mainContent = useSmoothAppearance(currentSessionId && connected, 300, 'animate-fade-in-slow')

  // Enhanced: Auto-join session if sessionId is in URL, with improved robustness, logging, and user experience
  useEffect(() => {
    if (urlSessionId && !currentSessionId) {
      // Defensive: Try/catch for localStorage access
      let savedSessionData = null, savedMessages = [], savedQueue = [];
      try {
        savedSessionData = loadSessionData(urlSessionId);
      } catch (e) {
      }
      try {
        savedMessages = loadMessages(urlSessionId) || [];
      } catch (e) {
      }
      try {
        savedQueue = loadQueue(urlSessionId) || [];
      } catch (e) {
      }

      // Generate a random display name for auto-join if no saved data
      let autoDisplayName;
      if (savedSessionData && typeof savedSessionData.displayName === 'string' && savedSessionData.displayName.trim()) {
        autoDisplayName = savedSessionData.displayName;
      } else {
        // Enhanced: More adjectives/nouns, avoid duplicate names in a session
        const adjectives = [
          'Cool', 'Epic', 'Amazing', 'Awesome', 'Radical', 'Smooth', 'Groovy', 'Fresh',
          'Chill', 'Lively', 'Electric', 'Vivid', 'Sunny', 'Mellow', 'Funky', 'Dynamic'
        ];
        const nouns = [
          'Listener', 'Groover', 'Vibes', 'Beats', 'Rhythm', 'Melody', 'Harmony', 'Sound',
          'Bass', 'Wave', 'Tune', 'Jam', 'Note', 'Pulse', 'Echo', 'Chord'
        ];
        let tries = 0;
        let generatedName = '';
        do {
          const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
          const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
          generatedName = `${randomAdj} ${randomNoun}`;
          tries++;
          // Optionally: check for duplicate names in the current session's clients
        } while (
          clients &&
          Array.isArray(clients) &&
          clients.some(c => c.displayName === generatedName) &&
          tries < 10
        );
        autoDisplayName = generatedName;
      }

      setCurrentSessionId(urlSessionId);
      setDisplayName(autoDisplayName);
      // In auto-join effect, after loading savedQueue:
      // setQueue(Array.isArray(savedQueue) ? savedQueue : []);
      // Instead, pass as initialQueue to useQueue
      // setMessages(Array.isArray(savedMessages) ? savedMessages : []);
      // Instead, pass as initialMessages to useChatMessages
      // setSelectedTrackIdx(0); // This will be handled by useQueue
      // setCurrentTrackOverride(null); // This will be handled by useQueue

      // Save the session data (robustly merge with any existing data)
      try {
        saveSessionData(urlSessionId, {
          ...(savedSessionData || {}),
          displayName: autoDisplayName,
        });
      } catch (e) {
      }
    }
  // Add clients as a dependency for duplicate name avoidance
  }, [urlSessionId, currentSessionId, setCurrentSessionId, setDisplayName, clients]);

  // Ensure savedQueue is always defined before useQueue
  let savedQueue = [];
  try {
    savedQueue = loadQueue(currentSessionId) || [];
  } catch (e) {
    savedQueue = [];
  }

  // After loading savedQueue:
  const [queue, setQueue, selectedTrackIdx, setSelectedTrackIdx, currentTrackOverride, setCurrentTrackOverride] = useQueue(socket, savedQueue, pendingTrackIdx)

  // Delayed removal state for swipe-to-remove animation
  const [pendingRemoveId, setPendingRemoveId] = useState(null);
  const [pendingRemoveIds, setPendingRemoveIds] = useState([]); // Track all tracks pending removal

  const handleRemove = useCallback((trackId) => {
    setPendingRemoveId(trackId);
    setPendingRemoveIds(ids => [...ids, trackId]);
  }, []);

  const confirmRemove = useCallback((trackId) => {
    // Use trackId (url or id) for removal
    if (isController && socket && trackId) {
      socket.emit('remove_from_queue', { sessionId: currentSessionId, trackId });
    }
    setPendingRemoveId(null);
    // Do NOT remove from pendingRemoveIds here; wait for animation end
  }, [setQueue, isController, socket, currentSessionId]);

  // Called by QueueList/TrackRow after animation is done
  const handleRemoveAnimationEnd = useCallback((trackId) => {
    setPendingRemoveIds(ids => ids.filter(id => id !== trackId));
  }, []);

  // Remove the useEffects that handle queue_update, track_change, and related queue/track state, as this is now in the hook

  // When queue changes, reset selected track if needed
  useEffect(() => {
    if (queue.length === 0) setSelectedTrackIdx(0);
    else if (selectedTrackIdx >= queue.length) setSelectedTrackIdx(0);
  }, [queue]);

  // Ensure any buffered track_change is applied as soon as the queue is set
  useEffect(() => {
    if (Array.isArray(queue) && queue.length > 0 && pendingTrackIdx.current !== null) {
      // Defensive: Clamp idx to valid range
      const clampedIdx = Math.max(0, Math.min(pendingTrackIdx.current, queue.length - 1));
      setCurrentTrackOverride(pendingTrackIdx.currentTrack || null);
      setSelectedTrackIdx(clampedIdx);
      pendingTrackIdx.current = null;
      pendingTrackIdx.currentTrack = null;
    }
  }, [queue]);

  // Enhanced: On mount or when joining a session, request sync state, set current track, and handle edge cases robustly
  useEffect(() => {
    if (!socket || !currentSessionId) return;

    let didCancel = false;


    socket.emit('sync_request', { sessionId: currentSessionId }, (state) => {
      if (didCancel) return;

      if (state && state.currentTrack) {
        setCurrentTrackOverride(state.currentTrack);

        // Try to find the index in the queue if possible, fallback to 0 if not found
        if (queue && queue.length > 0) {
          const idx = queue.findIndex(
            (t) => t && state.currentTrack && t.url === state.currentTrack.url
          );
          if (idx !== -1) {
            setSelectedTrackIdx(idx);
          } else {
            setSelectedTrackIdx(0);
          }
        } else {
          setSelectedTrackIdx(0);
        }
      } else if (state && typeof state.currentTrackIdx === 'number' && queue && queue.length > 0) {
        // Fallback: If only currentTrackIdx is provided
        const clampedIdx = Math.max(0, Math.min(state.currentTrackIdx, queue.length - 1));
        setSelectedTrackIdx(clampedIdx);
        setCurrentTrackOverride(queue[clampedIdx] || null);
      }
    });

    // Cleanup to avoid setting state after unmount
    return () => {
      didCancel = true;
      // clearTimeout(syncTimeout); // Removed: syncTimeout is not defined or used
    };
  }, [socket, currentSessionId, queue, selectedTrackIdx]);

  /**
   * Enhanced handleJoin:
   * - Loads saved messages and queue with error handling and fallbacks.
   * - Sets current session, display name, messages, and queue.
   * - Optionally focuses the chat input after join (if present).
   * - Persists session data robustly.
   * - Logs join events in development for debugging.
   */
  const handleJoin = (sessionId, name) => {
    let savedMessages = [];
    let savedQueue = [];
    let displayName = name || '';

    // Defensive: Try/catch for localStorage access
    try {
      savedMessages = loadMessages(sessionId) || [];
    } catch (e) {
      savedMessages = [];
    }
    try {
      savedQueue = loadQueue(sessionId) || [];
    } catch (e) {
      savedQueue = [];
    }

    setCurrentSessionId(sessionId);
    setDisplayName(displayName);
    // setMessages(savedMessages); // This will be handled by useChatMessages
    // setQueue(savedQueue); // This will be handled by useQueue

    // Save the session data robustly
    try {
      saveSessionData(sessionId, { displayName });
    } catch (e) {
    }

    // Optionally focus chat input after join (if present)
    setTimeout(() => {
      const chatInput = document.querySelector('input[name="chat"]');
      if (chatInput) chatInput.focus();
    }, 200);
  }

  const handleExitRoom = () => {
    openExitModal()
  }

  const confirmExitRoom = () => {
    // Clear session data
    if (currentSessionId) {
      clearSessionData(currentSessionId)
    }
    
    // Call the parent's leave session handler
    if (onLeaveSession) {
      onLeaveSession()
    }
    
    // Close modal
    closeExitModal()
  }

  // Enhanced handler for Playlist selection with improved robustness, logging, and user experience
  const handleSelectTrack = useCallback((idx, trackObj) => {
    // If a custom track object is provided (e.g., preview or external), override
    if (trackObj) {
      setCurrentTrackOverride(trackObj);
      setSelectedTrackIdx(idx !== null && typeof idx === 'number' ? idx : 0); // fallback to 0 if idx is null
      if (isController && socket) {
        socket.emit('track_change', { sessionId: currentSessionId, idx }, { override: true, track: trackObj });
      }
      return;
    }

    // Defensive: Validate idx and queue
    if (typeof idx !== 'number' || idx < 0 || !Array.isArray(queue) || idx >= queue.length) {
      return;
    }

    // Clear override and select from queue
    setCurrentTrackOverride(null);
    setSelectedTrackIdx(idx);
    if (isController && socket) {
      socket.emit('track_change', { sessionId: currentSessionId, idx }, { override: false });
    }
  }, [setSelectedTrackIdx, setCurrentTrackOverride, isController, socket, currentSessionId, queue]);

  // In render, always derive currentTrack from latest queue and selectedTrackIdx
  const currentTrack = useMemo(() => currentTrackOverride || (queue && queue.length > 0 ? queue[selectedTrackIdx] : null), [currentTrackOverride, queue, selectedTrackIdx]);

  // When sessionSyncState changes (from join_session), initialize playback/session state
  useEffect(() => {
    if (sessionSyncState) {
      // setQueue(sessionSyncState.queue); // This will be handled by useQueue
      if (typeof sessionSyncState.selectedTrackIdx === 'number') setSelectedTrackIdx(sessionSyncState.selectedTrackIdx);
      if (sessionSyncState.currentTrack) setCurrentTrackOverride(sessionSyncState.currentTrack);
      // Optionally: handle isPlaying, timestamp, etc. for AudioPlayer
      // You can add more state initializations here as needed
    }
  }, [sessionSyncState]);

  // --- Peer Discovery ---
  useEffect(() => {
    if (!socket) return;
    const handleClientsUpdate = (clients) => {
      // Exclude self
      setPeerIds(clients.filter(c => c.clientId && c.clientId !== clientId).map(c => c.clientId));
    };
    socket.on('clients_update', handleClientsUpdate);
    return () => socket.off('clients_update', handleClientsUpdate);
  }, [socket, clientId]);

  // --- Peer-to-Peer Time Sync (Fixed Hooks) ---
  const MAX_PEERS = 5;
  const paddedPeerIds = [...peerIds.slice(0, MAX_PEERS)];
  while (paddedPeerIds.length < MAX_PEERS) paddedPeerIds.push(null);

  const peerSyncA = usePeerTimeSync(socket, clientId, paddedPeerIds[0]);
  const peerSyncB = usePeerTimeSync(socket, clientId, paddedPeerIds[1]);
  const peerSyncC = usePeerTimeSync(socket, clientId, paddedPeerIds[2]);
  const peerSyncD = usePeerTimeSync(socket, clientId, paddedPeerIds[3]);
  const peerSyncE = usePeerTimeSync(socket, clientId, paddedPeerIds[4]);
  const peerSyncs = [peerSyncA, peerSyncB, peerSyncC, peerSyncD, peerSyncE];

  // Remove: syncQuality useMemo and allOffsets/best/ultraPreciseOffset logic
  // Instead, use the hook:
  const { ultraPreciseOffset, syncQuality, allOffsets } = useUltraPreciseOffset(peerSyncs, timeOffset, rtt, jitter, drift)


  // Ensure savedMessages is always defined before useChatMessages
  let savedMessages = [];
  try {
    savedMessages = loadMessages(currentSessionId) || [];
  } catch (e) {
    savedMessages = [];
  }
  const [messages, setMessages, markDelivered] = useChatMessages(socket, currentSessionId, savedMessages)

  // Ensure mobileTab is always defined before use
  const [mobileTab, setMobileTab] = useMobileTab(0);

  // Place chat open state here so it is available to all hooks below
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showFloatingChat, setShowFloatingChat] = useState(false);

  // --- Unread Chat Count Logic ---
  const unreadChatCount = useMemo(() => {
    if (!messages || !clientId) return 0;
    // Only count messages from others that are not read and have a messageId
    return messages.filter(
      (msg) => msg.sender !== clientId && !msg.read && msg.messageId
    ).length;
  }, [messages, clientId]);

  // Reset unread count when chat is open or chat tab is active
  useEffect(() => {
    if (mobileTab === 2 || isChatOpen) {
      // Mark all unread messages as read
      if (messages && socket && currentSessionId && clientId) {
        messages.forEach((msg) => {
          if (msg.sender !== clientId && !msg.read && msg.messageId) {
            socket.emit('message_read', {
              sessionId: currentSessionId,
              messageId: msg.messageId,
              clientId,
            });
          }
        });
      }
    }
  }, [mobileTab, isChatOpen, messages, socket, currentSessionId, clientId]);

  // Ensure showExitModal is always defined before use
  const [showExitModal, openExitModal, closeExitModal] = useModalState(false);

  // Ensure socket.sessionId is always set for AudioPlayer and related consumers
  useEffect(() => {
    if (socket && currentSessionId) {
      socket.sessionId = currentSessionId;
    }
  }, [socket, currentSessionId]);

  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef();
  const handleCopyRoomCode = useCallback(() => {
    if (!currentSessionId) return;
    navigator.clipboard.writeText(currentSessionId);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1200);
  }, [currentSessionId]);
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // --- Latency Calibration Wizard State ---
  const [calibrated, setCalibrated] = useState(true); // Default to true, only show after join
  useEffect(() => {
    // Only check for calibration after a session is joined
    if (currentSessionId) {
      const key = 'audioLatency_' + (navigator.userAgent || 'unknown');
      const stored = localStorage.getItem(key);
      if (!stored || isNaN(parseFloat(stored))) {
        setCalibrated(false);
      } else {
        setCalibrated(true);
      }
    }
  }, [currentSessionId]);

  // --- Always render session UI, but show calibration wizard as modal overlay only after join/create ---
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownAnimatingOut, setDropdownAnimatingOut] = useState(false);
  const deviceDropdownRef = useRef();
  const deviceDropdownTimeout = useRef();

  // Dropdown mount/unmount logic for smooth animation
  useEffect(() => {
    if (showDeviceDropdown) {
      setDropdownVisible(true);
      setDropdownAnimatingOut(false);
    } else if (dropdownVisible) {
      setDropdownAnimatingOut(true);
      const timeout = setTimeout(() => {
        setDropdownVisible(false);
        setDropdownAnimatingOut(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [showDeviceDropdown]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDeviceDropdown) return;
    function handleClick(e) {
      if (deviceDropdownRef.current && !deviceDropdownRef.current.contains(e.target)) {
        setShowDeviceDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDeviceDropdown]);
  // For accessibility: close on Escape
  useEffect(() => {
    if (!showDeviceDropdown) return;
    function handleKey(e) {
      if (e.key === 'Escape') setShowDeviceDropdown(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showDeviceDropdown]);

  // Responsive logic for floating chat button (768px - 1400px)
  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth;
      setShowFloatingChat(w >= 768 && w <= 1400);
      if (w < 768 || w > 1400) setIsChatOpen(false); // auto-close if out of range
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Add a state to trigger the pop-in animation
  const [showChatButtonAnim, setShowChatButtonAnim] = useState(false);

  // When chat overlay closes, trigger the pop-in animation
  useEffect(() => {
    if (!isChatOpen && showFloatingChat) {
      setShowChatButtonAnim(false);
      // Small timeout to allow reflow before animating
      setTimeout(() => setShowChatButtonAnim(true), 10);
    }
  }, [isChatOpen, showFloatingChat]);

  // Add these state variables near the top of the SessionPage component, after other useState hooks
  const [fullSyncAnimating, setFullSyncAnimating] = useState(false);
  const [fullSyncSuccess, setFullSyncSuccess] = useState(false);

  // Wrap forceNtpBatchSync with animation logic
  const handleFullSync = async () => {
    setFullSyncAnimating(true);
    setFullSyncSuccess(false);
    try {
      const result = forceNtpBatchSync && (typeof forceNtpBatchSync === 'function') ? forceNtpBatchSync() : undefined;
      if (result && typeof result.then === 'function') {
        await result;
      }
      setFullSyncSuccess(true);
      setTimeout(() => setFullSyncSuccess(false), 1200);
    } catch (e) {
      // Optionally handle error
    } finally {
      setTimeout(() => setFullSyncAnimating(false), 1200);
    }
  };

  // Add state for collapsible DeviceList near the top of SessionPage
  const [deviceListCollapsed, setDeviceListCollapsed] = useState(false);

  // Add state for clear data modal
  const [showClearDataModal, setShowClearDataModal] = useState(false);

  return <>
    {!calibrated && currentSessionId && (
      <CalibrateLatencyWizard onDone={() => setCalibrated(true)} socket={socket} />
    )}
    <div style={
      !calibrated && currentSessionId
        ? { filter: 'blur(2px)', pointerEvents: 'none', opacity: 0.5, userSelect: 'none' }
        : {}
    }>
      {!currentSessionId ? (
        <SessionForm onJoin={handleJoin} currentSessionId={currentSessionId} />
      ) : (
        <>
          {/* Desktop Layout */}
          <div className="hidden md:flex flex-col h-screen">
            {/* Header */}
            <header className="flex items-center justify-between bg-[#0A0A0A] px-3 py-1 border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-sm min-h-[38px] relative z-[1000]">
              <div className="flex items-center gap-2">
                <div>
                  <h1 className="text-base font-semibold text-neutral-300 leading-none">FxSync</h1>
                </div>
                {/* Full Sync Button */}
                <button
                  onClick={handleFullSync}
                  className="flex items-center gap-1 px-2 py-1 ml-1 text-xs text-neutral-400 hover:text-white hover:bg-white-500/10 border border-neutral-500/30 hover:border-neutral-500/50 rounded-lg transition-all duration-200 hover:shadow-md"
                  title="Manual Full Sync"
                >
                  <span className="relative flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-all duration-500 ${
                        fullSyncAnimating ? 'animate-spin-slow text-primary' : 'text-neutral-400'
                      }`}
                      style={{
                        filter: fullSyncAnimating
                          ? 'drop-shadow(0 0 6px #38bdf8) drop-shadow(0 0 2px #fff)'
                          : 'none',
                        transition: 'filter 0.4s cubic-bezier(0.4,0,0.2,1), color 0.4s cubic-bezier(0.4,0,0.2,1)'
                      }}
                    >
                      <path d="M21 2v6h-6"></path>
                      <path d="M3 12a9 9 0 0 1 15-7.7L21 8"></path>
                      <path d="M3 12a9 9 0 0 0 15 7.7L21 16"></path>
                    </svg>
                    {/* Feedback checkmark animation */}
                    <span
                      className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-500 ${
                        fullSyncSuccess ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                      }`}
                      style={{
                        transition: 'opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1)',
                        zIndex: 2
                      }}
                      aria-hidden="true"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#38d996"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-lg"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  </span>
                  Full Sync
                </button>
                              {/* User Count & Device Dropdown */}
              <div
                className="relative"
                onMouseEnter={() => {
                  if (deviceDropdownTimeout.current) clearTimeout(deviceDropdownTimeout.current);
                  setShowDeviceDropdown(true);
                }}
                onMouseLeave={() => {
                  deviceDropdownTimeout.current = setTimeout(() => setShowDeviceDropdown(false), 200);
                }}
              >
                <button
                  className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  onClick={() => setShowDeviceDropdown(v => !v)}
                  aria-haspopup="true"
                  aria-expanded={showDeviceDropdown}
                  tabIndex={0}
                  style={{ position: 'relative', zIndex: 30 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 mr-1">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span className="font-semibold">{clients?.length || 0}</span>
                  <span className="">user{clients?.length === 1 ? '' : 's'}</span>
                  <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                {/* Dropdown */}
                {dropdownVisible && (
                   <div
                     ref={deviceDropdownRef}
                     className={`absolute left-0 mt-2 min-w-[260px] max-w-[340px] bg-neutral-900 backdrop-blur-lg rounded-2xl shadow-xl z-[9999] border border-white/10 transition-all duration-200 flex flex-col
                       ${dropdownAnimatingOut ? 'opacity-0 translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'}
                     `}
                     style={{ top: '100%', boxShadow: '0 8px 32px 0 rgba(0,0,0,0.18)' }}
                   >
                     <div className="flex-1 min-h-0 overflow-y-auto p-2">
                       <DeviceList
                         clients={clients}
                         controllerClientId={controllerClientId}
                         clientId={clientId}
                         socket={socket}
                         dropdown={true}
                       />
                     </div>
                   </div>
                )}
              </div>
              </div>
              <button
                type="button"
                className={`relative group text-xs text-neutral-400 leading-none px-2 py-1 rounded transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-neutral-700 hover:bg-neutral-800/60 active:scale-95`}
                style={{ userSelect: 'all', WebkitUserSelect: 'all', background: 'none', border: 'none' }}
                onClick={async (e) => {
                  e.preventDefault();
                  if (!currentSessionId) return;
                  try {
                    await navigator.clipboard.writeText(currentSessionId);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  } catch (err) {
                    setCopied('error');
                    setTimeout(() => setCopied(false), 1200);
                  }
                }}
                aria-label="Copy room ID"
              >
                <span className="flex items-center gap-1">
                  Room: {currentSessionId}
                  <svg
                    className="w-4 h-4 ml-1 text-neutral-500 group-hover:text-neutral-300 transition-colors duration-200"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" />
                    <rect x="3" y="3" width="13" height="13" rx="2" stroke="currentColor" />
                  </svg>
                </span>
                {/* Animated feedback */}
                <span
                  className={`
                    pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 px-3 py-1 rounded-lg text-xs font-semibold
                    transition-all duration-400
                    ${copied === true
                      ? 'opacity-100 scale-100 bg-neutral-900 text-white border border-white shadow-lg'
                      : copied === 'error'
                        ? 'opacity-100 scale-100 bg-red-900 text-red-200 border border-red-400 shadow-lg'
                        : 'opacity-0 scale-95'}
                  `}
                  style={{
                    zIndex: 20,
                    boxShadow: copied ? '0 2px 16px 0 rgba(0,0,0,0.25)' : 'none',
                    transition: 'opacity 0.25s cubic-bezier(.4,0,.2,1), transform 0.25s cubic-bezier(.4,0,.2,1)'
                  }}
                >
                  {copied === true && (
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Copied!
                    </span>
                  )}
                  {copied === 'error' && (
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-red-200" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2"/>
                        <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      Copy failed
                    </span>
                  )}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 text-xs transition-all duration-300 ${connectionStatus.animationClass}`}> 
                  <span
                    className={`w-2 h-2 rounded-full inline-block transition-all duration-300 ${connected ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{
                      animation: 'blinking-dot 1.2s infinite',
                      boxShadow: connected
                        ? '0 0 6px 2px rgba(34,197,94,0.5)'
                        : '0 0 6px 2px rgba(239,68,68,0.4)'
                    }}
                  ></span>
                  <span className="text-neutral-400">{connected ? 'Connected' : 'Disconnected'}</span>
                  <style>
                    {`
                      @keyframes blinking-dot {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.25; }
                      }
                    `}
                  </style>
                </div>
                <button
                  onClick={() => setShowClearDataModal(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-all duration-200 hover:shadow-md"
                  title="Clear saved data"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                  Clear
                </button>
                <button
                  onClick={handleExitRoom}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-all duration-200 hover:shadow-md"
                  title="Exit room"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16,17 21,12 16,7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  Exit
                </button>
              </div>
            </header>
            {/* Main Content */}
            <div className={`flex-1 overflow-hidden transition-all duration-500 ${mainContent.animationClass}`}>
              <ResizableLayout
                leftPanel={
                  <div className="flex flex-col h-full justify-between">
                    <div className="p-4">
                      <AudioPlayer
                        disabled={!currentSessionId}
                        socket={socket}
                        isSocketConnected={connected}
                        controllerId={controllerId}
                        controllerClientId={controllerClientId}
                        clientId={clientId}
                        clients={clients}
                        getServerTime={getServerTime}
                        currentTrack={currentTrack}
                        rtt={rtt}
                        ultraPreciseOffset={ultraPreciseOffset} // <-- Canonical hybrid offset
                        sessionSyncState={sessionSyncState}
                        forceNtpBatchSync={forceNtpBatchSync}
                        queue={queue}
                        selectedTrackIdx={selectedTrackIdx}
                        onSelectTrack={handleSelectTrack}
                        sessionId={currentSessionId}
                      />
                    </div>
                    <div className="p-4 border-t border-neutral-800">
                      <div
                        className="controller-request-appear"
                        style={{
                          animation: 'fadeSlideInUp 0.6s cubic-bezier(0.22,1,0.36,1)',
                          willChange: 'opacity, transform',
                        }}
                      >
                        <ControllerRequestManager
                          socket={socket}
                          controllerClientId={controllerClientId}
                          clientId={clientId}
                          pendingControllerRequests={pendingControllerRequests}
                          controllerRequestReceived={controllerRequestReceived}
                          controllerOfferReceived={controllerOfferReceived}
                          controllerOfferSent={controllerOfferSent}
                          controllerOfferAccepted={controllerOfferAccepted}
                          controllerOfferDeclined={controllerOfferDeclined}
                        />
                      </div>
                      <button
                        className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-all duration-200 my-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        onClick={() => setDeviceListCollapsed(v => !v)}
                        aria-expanded={!deviceListCollapsed}
                        aria-controls="device-list-panel"
                        style={{ userSelect: 'none' }}
                      >
                        <svg
                          className={`transition-transform duration-300 ${deviceListCollapsed ? 'rotate-90' : 'rotate-0'}`}
                          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                        <span>{deviceListCollapsed ? 'Show Devices' : 'Hide Devices'}</span>
                      </button>
                      <div
                        id="device-list-panel"
                        style={{
                          maxHeight: deviceListCollapsed ? 0 : 400,
                          overflow: 'hidden',
                          transition: deviceListCollapsed
                            ? 'max-height 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.4s cubic-bezier(0.22,1,0.36,1), transform 0.4s cubic-bezier(0.22,1,0.36,1)'
                            : 'max-height 0.7s cubic-bezier(0.22,1,0.36,1), opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
                          opacity: deviceListCollapsed ? 0 : 1,
                          pointerEvents: deviceListCollapsed ? 'none' : 'auto',
                          transform: deviceListCollapsed ? 'scale(0.98) translateY(12px)' : 'scale(1) translateY(0)',
                        }}
                        aria-hidden={deviceListCollapsed}
                      >
                        <DeviceList
                          clients={clients}
                          controllerClientId={controllerClientId}
                          clientId={clientId}
                          socket={socket}
                        />
                      </div>
                    </div>
                  </div>
                }
                middlePanel={
                  <Playlist
                    queue={queue}
                    isController={isController}
                    socket={socket}
                    sessionId={currentSessionId}
                    onSelectTrack={handleSelectTrack}
                    selectedTrackIdx={selectedTrackIdx}
                    pendingRemoveId={pendingRemoveId}
                    handleRemove={handleRemove}
                    confirmRemove={confirmRemove}
                  />
                }
                rightPanel={
                  <ChatBox
                    socket={socket}
                    sessionId={currentSessionId}
                    clientId={clientId}
                    displayName={displayName}
                    messages={messages}
                    markDelivered={markDelivered}
                    onSend={(msg) => {
                      // setMessages((prev) => { // This will be handled by useChatMessages
                      //   const newMessages = [...prev, msg]
                      //   if (currentSessionId) {
                      //     saveMessages(currentSessionId, newMessages)
                      //   }
                      //   return newMessages
                      // })
                    }}
                    clients={clients}
                  />
                }
                leftMinWidth={200}
                middleMinWidth={200}
                rightMinWidth={200}
              />
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="flex flex-col h-screen md:hidden">
            {/* Header (compact for mobile) */}
            <header className="flex items-center justify-between p-1 border-b border-neutral-800 bg-neutral-900/70 backdrop-blur-sm min-h-[38px]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                  </svg>
                </div>
                <div className='flex items-center gap-1'>
                  <h1 className="text-base font-semibold text-white leading-none">FxSync</h1>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyRoomCode}
                className={`relative text-[11px] leading-none transition-all duration-300 px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
                  ${copied ? 'text-green-600' : 'text-neutral-400 hover:text-primary hover:bg-primary/5 active:scale-97'}`}
                title="Copy room code"
                aria-label="Copy room code"
                style={{
                  background: copied ? 'linear-gradient(90deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.13) 100%)' : undefined,
                  borderBottom: copied ? '2px solid #22c55e' : '2px solid transparent',
                  transition: 'background 0.3s, border-bottom 0.3s, color 0.3s, transform 0.2s',
                }}
              >
                <span className={`inline-flex items-center gap-1 transition-all duration-300 ${copied ? 'scale-105 opacity-100' : 'opacity-90'}`}>
                  {copied ? (
                    <>
                      <svg className="inline-block" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10l4 4 6-6"/></svg>
                      Copied!
                    </>
                  ) : (
                    <>Room: {currentSessionId}</>
                  )}
                </span>
              </button>
              <button
                onClick={handleExitRoom}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 rounded transition-all duration-200"
                title="Exit room"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16,17 21,12 16,7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                Exit
              </button>
            </header>
            {/* Main Content (tab panel) */}
            <div className="flex-1 overflow-hidden pb-16">
              {mobileTab === 0 && (
                <div className="h-full overflow-y-auto relative">
                  {/* Main content (ControllerRequestManager, DeviceList, etc.) */}
                  <div className="p-2 pb-28"> {/* Add extra bottom padding for floating player */}
                    <ControllerRequestManager
                      socket={socket}
                      controllerClientId={controllerClientId}
                      clientId={clientId}
                      pendingControllerRequests={pendingControllerRequests}
                      controllerRequestReceived={controllerRequestReceived}
                      controllerOfferReceived={controllerOfferReceived}
                      controllerOfferSent={controllerOfferSent}
                      controllerOfferAccepted={controllerOfferAccepted}
                      controllerOfferDeclined={controllerOfferDeclined}
                    />
                    <DeviceList
                      clients={clients}
                      controllerClientId={controllerClientId}
                      clientId={clientId}
                      socket={socket}
                      mobile={true}
                      isAudioTabActive={mobileTab === 0}
                    />
                  </div>
                  {/* Floating AudioPlayer at bottom */}
                  <div className="fixed left-0 right-0 bottom-20 z-30 flex justify-center pointer-events-none">
                    <div className="w-[95vw] max-w-sm pointer-events-auto">
                      <AudioPlayer
                        disabled={!currentSessionId}
                        socket={socket}
                        isSocketConnected={connected}
                        controllerId={controllerId}
                        controllerClientId={controllerClientId}
                        clientId={clientId}
                        clients={clients}
                        getServerTime={getServerTime}
                        mobile={true}
                        isAudioTabActive={mobileTab === 0}
                        currentTrack={currentTrack}
                        rtt={rtt}
                        sessionSyncState={sessionSyncState}
                        forceNtpBatchSync={forceNtpBatchSync}
                        queue={queue}
                        selectedTrackIdx={selectedTrackIdx}
                        onSelectTrack={handleSelectTrack}
                        sessionId={currentSessionId}
                      />
                    </div>
                  </div>
                </div>
              )}
              {mobileTab === 1 && (
                <>
                  <Playlist
                    queue={queue}
                    isController={isController}
                    socket={socket}
                    sessionId={currentSessionId}
                    onSelectTrack={handleSelectTrack}
                    selectedTrackIdx={selectedTrackIdx}
                    pendingRemoveId={pendingRemoveId}
                    handleRemove={handleRemove}
                    confirmRemove={confirmRemove}
                    mobile={true}
                  />
                  {/* Floating AudioPlayer at bottom for Playlist tab */}
                  <div className="fixed left-0 right-0 bottom-20 z-30 flex justify-center pointer-events-none">
                    <div className="w-[95vw] max-w-sm pointer-events-auto">
                      <AudioPlayer
                        disabled={!currentSessionId}
                        socket={socket}
                        isSocketConnected={connected}
                        controllerId={controllerId}
                        controllerClientId={controllerClientId}
                        clientId={clientId}
                        clients={clients}
                        getServerTime={getServerTime}
                        mobile={true}
                        isAudioTabActive={mobileTab === 1}
                        currentTrack={currentTrack}
                        rtt={rtt}
                        sessionSyncState={sessionSyncState}
                        forceNtpBatchSync={forceNtpBatchSync}
                        queue={queue}
                        selectedTrackIdx={selectedTrackIdx}
                        onSelectTrack={handleSelectTrack}
                        sessionId={currentSessionId}
                      />
                    </div>
                  </div>
                </>
              )}
              {mobileTab === 2 && (
                <ChatBox
                  socket={socket}
                  sessionId={currentSessionId}
                  clientId={clientId}
                  displayName={displayName}
                  messages={messages}
                  markDelivered={markDelivered}
                  onSend={(msg) => {
                    // setMessages((prev) => { // This will be handled by useChatMessages
                    //   const newMessages = [...prev, msg]
                    //   if (currentSessionId) {
                    //     saveMessages(currentSessionId, newMessages)
                    //   }
                    //   return newMessages
                    // })
                  }}
                  clients={clients}
                  mobile={true}
                  isChatTabActive={mobileTab === 2}
                />
              )}
            </div>
            {/* Bottom Tab Bar */}
            <BottomTabBar
              mobileTab={mobileTab}
              setMobileTab={setMobileTab}
              unreadCount={unreadChatCount}
              handleExitRoom={handleExitRoom}
            />
          </div>
        </>
      )}
      <ExitRoomModal
        isOpen={showExitModal}
        onClose={closeExitModal}
        onConfirm={confirmExitRoom}
        roomName={currentSessionId}
      />
      {currentSessionId && showFloatingChat && !isChatOpen && (
        <>
          {/* Floating Chat Button */}
          <button
            type="button"
            aria-label="Open chat"
            onClick={() => setIsChatOpen(true)}
            className="fixed z-50 bottom-6 right-6 md:bottom-8 md:right-8 bg-white/80 text-neutral-900 shadow-xl rounded-full p-3 flex items-center justify-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-white active:scale-95"
            style={{
              boxShadow: '0 4px 24px 0 rgba(0,0,0,0.18)',
              background: 'rgba(255,255,255,0.8)',
              color: '#222',
              // Only position: fixed, bottom, right are needed for placement
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unreadChatCount > 0 && !isChatOpen && (
              <span
                className="absolute -top-2 -right-2 rounded-full px-2 py-0.5 font-semibold text-xs border-2 shadow-xl transition-all duration-300 animate-fade-in"
                style={{
                  background: 'linear-gradient(135deg, #16a34a 60%, #64748b 100%)', // green to slate (between black and white)
                  color: '#f1f5f9', // very light slate, readable on both dark and light
                  borderColor: '#e2e8f0', // light border for contrast
                  minWidth: 22,
                  minHeight: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 13,
                  letterSpacing: 0.1,
                  opacity: 1,
                  transform: 'scale(1)',
                  boxShadow: '0 2px 8px 0 rgba(30,41,59,0.18)',
                  pointerEvents: 'none',
                  zIndex: 2,
                  textShadow: '0 1px 2px rgba(30,41,59,0.18), 0 0 2px #16a34a',
                }}
                aria-label={`${unreadChatCount > 99 ? '99+' : unreadChatCount} unread messages`}
              >
                <span
                  className="inline-block animate-pulse"
                  style={{
                    animationDuration: unreadChatCount > 10 ? '1.2s' : '1.8s',
                  }}
                >
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              </span>
            )}
          </button>
        </>
      )}
      {currentSessionId && showFloatingChat && (
        <>
          {/* Sliding Chat Overlay */}
          <div
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={`fixed right-0 h-full w-full max-w-md z-40 bg-neutral-900/95 shadow-2xl border-l border-neutral-800 transition-transform duration-400 ease-in-out flex flex-col ${isChatOpen ? 'translate-x-0' : 'translate-x-full'} pointer-events-auto`}
            style={{
              top: 48, // header height (min-h-[38px] + padding/margin)
              height: 'calc(100% - 48px)',
              transition: 'transform 0.4s cubic-bezier(.4,0,.2,1)',
              willChange: 'transform',
              maxWidth: 540,
              minWidth: 320,
            }}
          >
            {/* Close button at middle left */}
            {isChatOpen && (
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => setIsChatOpen(false)}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full z-50 p-0 m-0 flex items-center justify-center text-white group focus:outline-none"
                style={{ background: 'none', border: 'none', boxShadow: 'none' }}
              >
                <svg
                  width="32" height="32" viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-300 group-hover:translate-x-2"
                  style={{ display: 'block' }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
            <div className="flex-1 flex flex-col overflow-hidden">
              <ChatBox
                socket={socket}
                sessionId={currentSessionId}
                clientId={clientId}
                displayName={displayName}
                messages={messages}
                markDelivered={markDelivered}
                clients={clients}
                mobile={false}
              />
            </div>
          </div>
          {/* Overlay background for click-to-close */}
          {isChatOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity duration-300"
              style={{ pointerEvents: isChatOpen ? 'auto' : 'none', opacity: isChatOpen ? 1 : 0 }}
              aria-hidden="true"
              onClick={() => setIsChatOpen(false)}
            />
          )}
        </>
      )}
      {/* Clear Data Modal */}
      <ExitRoomModal
        isOpen={showClearDataModal}
        onClose={() => setShowClearDataModal(false)}
        onConfirm={() => {
          if (currentSessionId) {
            clearSessionData(currentSessionId);
            setMessages([]); // Reset chat messages
            setQueue([]);    // Reset queue
            setSelectedTrackIdx(0); // Reset track selection
            setCurrentTrackOverride(null); // Reset any override
            // Optionally reset other session-related state here
          }
          setShowClearDataModal(false);
        }}
        roomName={currentSessionId}
        // Custom props for clear data
        title="Clear Data"
        description="Are you sure you want to clear all saved data for this session? This cannot be undone."
        confirmLabel="Clear Data"
        iconType="clear"
      />
    </div>
  </>;
}

export default SessionPage 