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
import ClearDataModal from './ClearDataModal';
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
import ErrorBoundary from './ErrorBoundary';
import { Suspense } from 'react';
import DiagnosticsPanel from './AudioPlayer/DiagnosticsPanel';

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
  forceNtpBatchSync,
}) {
  const { sessionId: urlSessionId } = useParams();
  const pendingTrackIdx = useRef(null); // Buffer for track_change before queue is set
  const [peerIds, setPeerIds] = useState([]);
  const [peerSyncFallback, setPeerSyncFallback] = useState(false);
  const [clockSkewWarning, setClockSkewWarning] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Clean up old sessions on component mount
  useEffect(() => {
    cleanupOldSessions();
  }, []);

  // Clear session data when leaving a session
  useEffect(() => {
    return () => {
      // This cleanup runs when component unmounts or session changes
      // We don't clear data here as we want to persist it
    };
  }, [currentSessionId]);

  // Define isController before using it in hooks
  const isController = controllerClientId && clientId && controllerClientId === clientId;

  // Smooth appearance hooks for elements that load late
  const connectionStatus = useSmoothAppearance(
    connected !== undefined,
    100,
    'animate-fade-in-fast'
  );
  const controllerStatus = useSmoothAppearance(isController, 200, 'animate-bounce-in');
  const mainContent = useSmoothAppearance(
    currentSessionId && connected,
    300,
    'animate-fade-in-slow'
  );

  // Enhanced: Auto-join session if sessionId is in URL, with improved robustness, logging, and user experience
  useEffect(() => {
    if (urlSessionId && !currentSessionId) {
      // Defensive: Try/catch for localStorage access
      let savedSessionData = null,
        savedMessages = [],
        savedQueue = [];
      try {
        savedSessionData = loadSessionData(urlSessionId);
      } catch (e) {}
      try {
        savedMessages = loadMessages(urlSessionId) || [];
      } catch (e) {}
      try {
        savedQueue = loadQueue(urlSessionId) || [];
      } catch (e) {}

      // Generate a random display name for auto-join if no saved data
      let autoDisplayName;
      if (
        savedSessionData &&
        typeof savedSessionData.displayName === 'string' &&
        savedSessionData.displayName.trim()
      ) {
        autoDisplayName = savedSessionData.displayName;
      } else {
        // Enhanced: More adjectives/nouns, avoid duplicate names in a session
        const adjectives = [
          'Cool',
          'Epic',
          'Amazing',
          'Awesome',
          'Radical',
          'Smooth',
          'Groovy',
          'Fresh',
          'Chill',
          'Lively',
          'Electric',
          'Vivid',
          'Sunny',
          'Mellow',
          'Funky',
          'Dynamic',
        ];
        const nouns = [
          'Listener',
          'Groover',
          'Vibes',
          'Beats',
          'Rhythm',
          'Melody',
          'Harmony',
          'Sound',
          'Bass',
          'Wave',
          'Tune',
          'Jam',
          'Note',
          'Pulse',
          'Echo',
          'Chord',
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
          clients.some((c) => c.displayName === generatedName) &&
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
      } catch (e) {}
    }
    // Add clients as a dependency for duplicate name avoidance
  }, [urlSessionId, currentSessionId, setCurrentSessionId, setDisplayName, clients]);

  // Add after session join logic
  useEffect(() => {
    if (!socket || !currentSessionId) return;
    // Request a fresh sync state after a short delay
    const timer = setTimeout(() => {
      socket.emit('sync_request', { sessionId: currentSessionId }, () => {
        // Optionally handle response or errors here
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [socket, currentSessionId]);

  // Ensure savedQueue is always defined before useQueue
  let savedQueue = [];
  try {
    savedQueue = loadQueue(currentSessionId) || [];
  } catch (e) {
    savedQueue = [];
  }

  // After loading savedQueue:
  const [
    queue,
    setQueue,
    selectedTrackIdx,
    setSelectedTrackIdx,
    currentTrackOverride,
    setCurrentTrackOverride,
  ] = useQueue(socket, savedQueue, pendingTrackIdx);

  // Delayed removal state for swipe-to-remove animation
  const [pendingRemoveId, setPendingRemoveId] = useState(null);
  const handleRemove = useCallback((trackId) => {
    setPendingRemoveId(trackId);
  }, []);
  const confirmRemove = useCallback(
    (trackId) => {
      if (pendingRemoveId === null) return; // Prevent double remove
      // Find the index of the track in the queue
      const idx = queue.findIndex((item) => (item.url || item.id || item.title) === trackId);
      if (isController && socket && idx !== -1) {
        socket.emit('remove_from_queue', { sessionId: currentSessionId, index: idx });
      }
      setPendingRemoveId(null);
    },
    [setQueue, pendingRemoveId, isController, socket, currentSessionId, queue]
  );

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
    } catch (e) {}

    // Optionally focus chat input after join (if present)
    setTimeout(() => {
      const chatInput = document.querySelector('input[name="chat"]');
      if (chatInput) chatInput.focus();
    }, 200);
  };

  const handleExitRoom = () => {
    openExitModal();
  };

  const confirmExitRoom = () => {
    // Clear session data
    if (currentSessionId) {
      clearSessionData(currentSessionId);
    }

    // Call the parent's leave session handler
    if (onLeaveSession) {
      onLeaveSession();
    }

    // Close modal
    closeExitModal();
  };

  const confirmClearData = async () => {
    if (currentSessionId) {
      clearSessionData(currentSessionId);
      // Call backend to delete files
      try {
        await fetch('/audio/clear-session-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: currentSessionId }),
        });
      } catch (e) {
        // Optionally handle error
      }
      // Reset the React state to reflect the cleared data
      setMessages([]);
      setQueue([]);
      setSelectedTrackIdx(0);
      setCurrentTrackOverride(null);
    }
    // Close the modal after clearing data
    closeClearDataModal();
  };

  // Enhanced handler for Playlist selection with improved robustness, logging, and user experience
  const handleSelectTrack = useCallback(
    (idx, trackObj) => {
      // If a custom track object is provided (e.g., preview or external), override
      if (trackObj) {
        setCurrentTrackOverride(trackObj);
        setSelectedTrackIdx(idx !== null && typeof idx === 'number' ? idx : 0); // fallback to 0 if idx is null
        if (isController && socket) {
          socket.emit(
            'track_change',
            { sessionId: currentSessionId, idx },
            { override: true, track: trackObj }
          );
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
    },
    [setSelectedTrackIdx, setCurrentTrackOverride, isController, socket, currentSessionId, queue]
  );

  // In render, always derive currentTrack from latest queue and selectedTrackIdx
  const currentTrack = useMemo(
    () => currentTrackOverride || (queue && queue.length > 0 ? queue[selectedTrackIdx] : null),
    [currentTrackOverride, queue, selectedTrackIdx]
  );

  // When sessionSyncState changes (from join_session), initialize playback/session state
  useEffect(() => {
    if (sessionSyncState) {
      // setQueue(sessionSyncState.queue); // This will be handled by useQueue
      if (typeof sessionSyncState.selectedTrackIdx === 'number')
        setSelectedTrackIdx(sessionSyncState.selectedTrackIdx);
      if (sessionSyncState.currentTrack) setCurrentTrackOverride(sessionSyncState.currentTrack);
      // Optionally: handle isPlaying, timestamp, etc. for AudioPlayer
      // You can add more state initializations here as needed
    }
  }, [sessionSyncState]);

  // --- Peer Discovery ---
  useEffect(() => {
    if (!clientId || !clients || clients.length === 0) {
      return;
    }
    const peers = clients.filter((c) => c.clientId && c.clientId !== clientId);
    const peerIds = peers.map((c) => c.clientId);
    setPeerIds(peerIds);
  }, [clients, clientId]);

  useEffect(() => {
  }, [peerIds, clientId, clients]);

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

  // Destructure selectedSource from useUltraPreciseOffset
  const { ultraPreciseOffset, syncQuality, allOffsets, selectedSource, allPeerDisconnected } = useUltraPreciseOffset(
    peerSyncs,
    timeOffset,
    rtt,
    jitter,
    drift,
    setPeerSyncFallback
  );

  // Ensure savedMessages is always defined before useChatMessages
  let savedMessages = [];
  try {
    savedMessages = loadMessages(currentSessionId) || [];
  } catch (e) {
    savedMessages = [];
  }
  const [messages, setMessages, markDelivered] = useChatMessages(
    socket,
    currentSessionId,
    savedMessages
  );

  // Ensure mobileTab is always defined before use
  const [mobileTab, setMobileTab] = useMobileTab(0);

  // Ensure showExitModal is always defined before use
  const [showExitModal, openExitModal, closeExitModal] = useModalState(false);

  // Clear data modal state
  const [showClearDataModal, openClearDataModal, closeClearDataModal] = useModalState(false);

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

  useEffect(() => {
    if (!socket || !currentSessionId) return;
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        socket.emit('sync_request', { sessionId: currentSessionId }, () => {
          // Optionally handle response or errors here
        });
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [socket, currentSessionId]);

  useEffect(() => {
    function handleClockSkew(e) {
      const offset = e.detail?.offset;
      setClockSkewWarning(
        `Warning: Your device clock is out of sync by ${Math.abs(offset / 1000).toFixed(2)}s. Sync quality may be reduced.`
      );
      setTimeout(() => setClockSkewWarning(null), 10000);
    }
    window.addEventListener('fxsync:clockskew', handleClockSkew);
    return () => window.removeEventListener('fxsync:clockskew', handleClockSkew);
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'd' || e.key === 'D') {
        setShowDiagnostics((v) => !v);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Helper to render peer sync diagnostics
  function PeerSyncDiagnostics({ peerSyncs, peerIds }) {
    return (
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-3 mt-2 text-xs">
        <div className="font-semibold text-white mb-2">Peer-to-Peer Sync Diagnostics</div>
        <div className="space-y-1">
          {peerSyncs.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-neutral-400">Peer {i + 1}:</span>
              <span className="text-neutral-200">{peerIds[i] || 'N/A'}</span>
              <span className={`px-2 py-0.5 rounded-full ${p?.connectionState === 'connected' ? 'bg-green-800 text-green-200' : p?.connectionState === 'connecting' ? 'bg-yellow-800 text-yellow-200' : 'bg-red-800 text-red-200'}`}>{p?.connectionState || 'N/A'}</span>
              {typeof p?.peerRtt === 'number' && (
                <span className="ml-2 text-blue-300">RTT: {p.peerRtt.toFixed(1)} ms</span>
              )}
              {typeof p?.peerOffset === 'number' && (
                <span className="ml-2 text-green-300">Offset: {p.peerOffset.toFixed(1)} ms</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {!currentSessionId ? (
        <SessionForm onJoin={handleJoin} currentSessionId={currentSessionId} />
      ) : (
        <>
          {/* Desktop Layout */}
          <div className="hidden md:flex flex-col h-screen">
            {/* Header */}
            <header className="flex items-center justify-between p-2 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-white">FxSync</h1>
                  <p className="text-xs text-neutral-400">Room: {currentSessionId}</p>
                </div>
              </div>
              {/* Center: RTT and Offset display */}
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-3 bg-neutral-800/70 px-1 py-1 rounded-full shadow-sm border border-neutral-700 backdrop-blur-md min-w-[210px] max-w-xs">
                  {/* RTT */}
                  <span
                    className="flex ml-1 items-center gap-1 text-xs font-medium text-blue-300"
                    title={`RTT (Round Trip Time): Time for a message to go to the server and back. Lower is better.\nCurrent: ${rtt !== null && !isNaN(rtt) ? rtt.toFixed(1) : '--'} ms`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="inline-block"
                    >
                      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
                      <path
                        d="M10 6v4l2 2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{rtt !== null && !isNaN(rtt) ? rtt.toFixed(1) : '--'}</span>
                    <span className="text-neutral-400 font-normal">ms</span>
                  </span>
                  {/* Divider */}
                  <span className="w-1 h-1 bg-neutral-600 rounded-full mx-1"></span>
                  {/* Offset */}
                  <span
                    className="flex items-center gap-1 text-xs font-medium text-green-300"
                    title={`Offset: Estimated difference between your clock and the server.\nCurrent: ${timeOffset !== null && !isNaN(timeOffset) ? timeOffset.toFixed(1) : '--'} ms`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="inline-block"
                    >
                      <rect x="4" y="9" width="12" height="2" rx="1" fill="currentColor" />
                      <rect x="9" y="4" width="2" height="12" rx="1" fill="currentColor" />
                    </svg>
                    <span>
                      {timeOffset !== null && !isNaN(timeOffset) ? timeOffset.toFixed(1) : '--'}
                    </span>
                    <span className="text-neutral-400 font-normal">ms</span>
                  </span>
                  {/* Divider */}
                  <span className="w-1 h-1 bg-neutral-600 rounded-full mx-1"></span>
                  {/* Sync Quality Badge */}
                  <span
                    className={`flex items-center gap-1 text-xs font-semibold text-white px-2 py-0.5 rounded-full ${syncQuality.color} cursor-help`}
                    title={syncQuality.tooltip}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="inline-block"
                    >
                      <circle
                        cx="10"
                        cy="10"
                        r="9"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                      <circle cx="10" cy="10" r="4" fill="currentColor" />
                    </svg>
                    {syncQuality.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div
                  className={`flex items-center gap-2 text-sm transition-all duration-300 ${connectionStatus.animationClass}`}
                >
                  <div
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${connected ? 'bg-green-500' : 'bg-red-500'}`}
                  ></div>
                  <span className="text-neutral-400">
                    {connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                {isController && (
                  <div
                    className={`px-2 py-1 bg-primary/20 border border-primary/30 rounded text-xs text-primary transition-all duration-300 ${controllerStatus.animationClass}`}
                  >
                    Controller
                  </div>
                )}

                <button
                  onClick={openClearDataModal}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-all duration-200 hover:shadow-md"
                  title="Clear saved data"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                  Clear Data
                </button>

                <button
                  onClick={handleExitRoom}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-all duration-200 hover:shadow-md"
                  title="Exit room"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16,17 21,12 16,7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  Exit Room
                </button>
              </div>
            </header>
            {/* Main Content */}
            <div
              className={`flex-1 overflow-hidden transition-all duration-500 ${mainContent.animationClass}`}
            >
              {clockSkewWarning && (
                <div className="bg-red-900/80 text-red-200 text-xs p-2 rounded mb-2 text-center">
                  {clockSkewWarning}
                </div>
              )}
              {peerSyncFallback && clients && clients.length > 1 && (
                <div className="bg-yellow-900/80 text-yellow-200 text-xs p-2 rounded mb-2 text-center">
                  Peer-to-peer sync unavailable. Falling back to server sync. Sync quality may be reduced.
                </div>
              )}
              {showDiagnostics && (
                <div>
                  <DiagnosticsPanel
                    audioLatency={rtt}
                    rtt={rtt}
                    jitter={jitter}
                    syncQuality={syncQuality}
                    selectedSource={selectedSource || 'server'}
                    computedUltraPreciseOffset={ultraPreciseOffset}
                    smoothedOffset={ultraPreciseOffset}
                    resyncStats={{ lastDrift: drift, rtt, jitter }}
                  />
                  <PeerSyncDiagnostics peerSyncs={peerSyncs} peerIds={paddedPeerIds} />
                </div>
              )}
              <ResizableLayout
                leftPanel={
                  <div className="flex flex-col h-full">
                    <div className="flex-1 p-4">
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
                        peerSyncs={peerSyncs} // <-- Pass peerSyncs for accurate offset
                      />
                    </div>
                    <div className="p-4">
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
                    <div className="p-4 border-t border-neutral-800">
                      <DeviceList
                        clients={clients}
                        controllerClientId={controllerClientId}
                        clientId={clientId}
                        socket={socket}
                      />
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
                  >
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                  </svg>
                </div>
                <div className="flex items-center gap-1">
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
                  background: copied
                    ? 'linear-gradient(90deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.13) 100%)'
                    : undefined,
                  borderBottom: copied ? '2px solid #22c55e' : '2px solid transparent',
                  transition: 'background 0.3s, border-bottom 0.3s, color 0.3s, transform 0.2s',
                }}
              >
                <span
                  className={`inline-flex items-center gap-1 transition-all duration-300 ${copied ? 'scale-105 opacity-100' : 'opacity-90'}`}
                >
                  {copied ? (
                    <>
                      <svg
                        className="inline-block"
                        width="14"
                        height="14"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 10l4 4 6-6" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>Room: {currentSessionId}</>
                  )}
                </span>
              </button>
              <button
                onClick={openClearDataModal}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-300 hover:bg-neutral-500/10 border border-neutral-500/30 hover:border-neutral-500/50 rounded transition-all duration-200"
                title="Clear data"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 rounded transition-all duration-200"
                title="Exit room"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
                  <div className="p-2 pb-28">
                    {' '}
                    {/* Add extra bottom padding for floating player */}
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
                        peerSyncs={peerSyncs} // <-- Pass peerSyncs for accurate offset
                      />
                    </div>
                  </div>
                </div>
              )}
              {mobileTab === 1 && (
                <ErrorBoundary>
                  <Suspense fallback={<div className="p-4 text-neutral-400">Loading playlist...</div>}>
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
                  </Suspense>
                  {/* Floating AudioPlayer at bottom for Playlist tab */}
                  <div className="fixed left-0 right-0 bottom-20 z-30 flex justify-center pointer-events-none">
                    <div className="w-[95vw] max-w-sm pointer-events-auto">
                      <ErrorBoundary>
                        <Suspense fallback={<div className="p-4 text-neutral-400">Loading player...</div>}>
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
                            peerSyncs={peerSyncs} // <-- Pass peerSyncs for accurate offset
                          />
                        </Suspense>
                      </ErrorBoundary>
                    </div>
                  </div>
                </ErrorBoundary>
              )}
              {mobileTab === 2 && (
                <ErrorBoundary>
                  <Suspense fallback={<div className="p-4 text-neutral-400">Loading chat...</div>}>
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
                  </Suspense>
                </ErrorBoundary>
              )}
            </div>
            {/* Bottom Tab Bar */}
            <BottomTabBar
              mobileTab={mobileTab}
              setMobileTab={setMobileTab}
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
      <ClearDataModal
        isOpen={showClearDataModal}
        onClose={closeClearDataModal}
        onConfirm={confirmClearData}
        sessionId={currentSessionId}
      />
    </div>
  );
}

export default SessionPage;
