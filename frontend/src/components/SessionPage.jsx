import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SessionForm from './SessionForm'
import AudioPlayer from './AudioPlayer'
import DeviceList from './DeviceList'
import ControllerRequestManager from './ControllerRequestManager'
import ChatBox from './ChatBox'
import Playlist from './Playlist'
import ResizableLayout from './ResizableLayout'
import ExitRoomModal from './ExitRoomModal'
import BottomTabBar from './BottomTabBar'
import useSmoothAppearance from '../hooks/useSmoothAppearance'
import { 
  saveMessages, 
  loadMessages, 
  saveQueue, 
  loadQueue, 
  saveSessionData, 
  loadSessionData,
  clearSessionData,
  cleanupOldSessions 
} from '../utils/persistence'
import usePeerTimeSync from '../hooks/usePeerTimeSync'

function SessionPage({
  currentSessionId,
  setCurrentSessionId,
  displayName,
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
  drift
}) {
  const { sessionId: urlSessionId } = useParams()
  const [messages, setMessages] = useState([])
  const [queue, setQueue] = useState([])
  const [showExitModal, setShowExitModal] = useState(false)
  const navigate = useNavigate()
  const [mobileTab, setMobileTab] = useState(0); // 0: Audio/Controller/Device, 1: Playlist, 2: Chat
  const [selectedTrackIdx, setSelectedTrackIdx] = useState(0);
  const [currentTrackOverride, setCurrentTrackOverride] = useState(null);
  const pendingTrackIdx = useRef(null); // Buffer for track_change before queue is set
  const [peerIds, setPeerIds] = useState([]);

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
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[SessionPage][AutoJoin] Failed to load session data', e);
        }
      }
      try {
        savedMessages = loadMessages(urlSessionId) || [];
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[SessionPage][AutoJoin] Failed to load messages', e);
        }
      }
      try {
        savedQueue = loadQueue(urlSessionId) || [];
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[SessionPage][AutoJoin] Failed to load queue', e);
        }
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

      // Logging for debugging
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[SessionPage][AutoJoin] Joining session', {
          urlSessionId,
          autoDisplayName,
          savedMessagesCount: savedMessages.length,
          savedQueueCount: savedQueue.length,
        });
      }

      setCurrentSessionId(urlSessionId);
      setDisplayName(autoDisplayName);
      setMessages(Array.isArray(savedMessages) ? savedMessages : []);
      setQueue(Array.isArray(savedQueue) ? savedQueue : []);

      // Save the session data (robustly merge with any existing data)
      try {
        saveSessionData(urlSessionId, {
          ...(savedSessionData || {}),
          displayName: autoDisplayName,
        });
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[SessionPage][AutoJoin] Failed to save session data', e);
        }
      }
    }
  // Add clients as a dependency for duplicate name avoidance
  }, [urlSessionId, currentSessionId, setCurrentSessionId, setDisplayName, clients]);

  useEffect(() => {
    if (!socket) return
    const handleChat = (msg) => {
      setMessages((prev) => {
        const newMessages = [...prev, msg]
        // Save messages to localStorage
        if (currentSessionId) {
          saveMessages(currentSessionId, newMessages)
        }
        return newMessages
      })
    }
    const handleReaction = (reaction) => {
      setMessages((prev) => {
        const newMessages = [...prev, reaction]
        // Save messages to localStorage
        if (currentSessionId) {
          saveMessages(currentSessionId, newMessages)
        }
        return newMessages
      })
    }
    socket.on('chat_message', handleChat)
    socket.on('reaction', handleReaction)
    return () => {
      socket.off('chat_message', handleChat)
      socket.off('reaction', handleReaction)
    }
  }, [socket, currentSessionId])

  useEffect(() => {
    if (!socket) return;
    const handleQueueUpdate = (q) => {
      console.log('[DEBUG] Received queue_update:', q);
      setQueue(q);
      // If a track_change was received before the queue, apply it now
      if (pendingTrackIdx.current !== null) {
        console.log('[DEBUG] Applying buffered track_change:', pendingTrackIdx.current, pendingTrackIdx.currentTrack);
        // If a track was also buffered, set it
        if (pendingTrackIdx.currentTrack) {
          setCurrentTrackOverride(pendingTrackIdx.currentTrack);
        } else {
          setCurrentTrackOverride(null);
        }
        setSelectedTrackIdx(pendingTrackIdx.current);
        console.log('[DEBUG] After applying buffered track_change:', {
          queue: q,
          selectedTrackIdx: pendingTrackIdx.current,
          currentTrackOverride: pendingTrackIdx.currentTrack
        });
        pendingTrackIdx.current = null;
        pendingTrackIdx.currentTrack = null;
      }
    };
    socket.on('queue_update', handleQueueUpdate);
    return () => {
      socket.off('queue_update', handleQueueUpdate);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleTrackChange = (payload) => {
      // Enhanced: Robustly handle various payload shapes and log more details
      let idx, track, extra = {};
      if (typeof payload === 'object' && payload !== null) {
        idx = typeof payload.idx === 'number' ? payload.idx : null;
        track = payload.track || null;
        // Capture any extra fields for debugging
        extra = Object.keys(payload).reduce((acc, key) => {
          if (key !== 'idx' && key !== 'track') acc[key] = payload[key];
          return acc;
        }, {});
      } else {
        idx = payload;
        track = null;
      }

      // Defensive: Validate idx
      if (typeof idx !== 'number' || idx < 0) {
        console.warn('[SessionPage][track_change] Invalid idx received:', idx, 'Payload:', payload);
        return;
      }

      // Enhanced: Log with more context
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[SessionPage][track_change] Received:', { payload, idx, track, extra, queueLength: queue?.length });
      }

      // If queue is not set yet, buffer the track_change
      if (!Array.isArray(queue) || queue.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('[SessionPage][track_change] Buffering until queue is set', { idx, track });
        }
        pendingTrackIdx.current = idx;
        pendingTrackIdx.currentTrack = track;
      } else {
        // Enhanced: Clamp idx to valid range
        const clampedIdx = Math.max(0, Math.min(idx, queue.length - 1));
        setCurrentTrackOverride(track || null);
        setSelectedTrackIdx(clampedIdx);

        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('[SessionPage][track_change] Applied immediately:', {
            queue,
            selectedTrackIdx: clampedIdx,
            currentTrackOverride: track,
            originalIdx: idx
          });
        }
      }
    };

    socket.on('track_change', handleTrackChange);

    // Enhanced: Clean up and warn if handler was still active
    return () => {
      socket.off('track_change', handleTrackChange);
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[SessionPage][track_change] Handler removed');
      }
    };
  }, [socket, queue]);

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
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[SessionPage][listener-fix] Applied buffered track_change after queue set:', {
          clampedIdx,
          currentTrack: pendingTrackIdx.currentTrack,
          queue
        });
      }
      pendingTrackIdx.current = null;
      pendingTrackIdx.currentTrack = null;
    }
  }, [queue]);

  // Debug: Log all socket events received
  useEffect(() => {
    if (!socket) return;
    const logAll = (event, ...args) => {
      console.log('[SOCKET EVENT]', event, ...args);
    };
    socket.onAny(logAll);
    return () => {
      socket.offAny(logAll);
    };
  }, [socket]);

  // Enhanced: On mount or when joining a session, request sync state, set current track, and handle edge cases robustly
  useEffect(() => {
    if (!socket || !currentSessionId) return;

    let didCancel = false;

    // Defensive: Add timeout fallback in case server doesn't respond
    let syncTimeout = setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[SessionPage][sync_request] Timed out waiting for sync state');
      }
    }, 4000);

    socket.emit('sync_request', { sessionId: currentSessionId }, (state) => {
      clearTimeout(syncTimeout);
      if (didCancel) return;

      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[SessionPage][sync_request] Received state:', state);
      }

      if (state && state.currentTrack) {
        setCurrentTrackOverride(state.currentTrack);

        // Try to find the index in the queue if possible, fallback to 0 if not found
        if (queue && queue.length > 0) {
          const idx = queue.findIndex(
            (t) => t && state.currentTrack && t.url === state.currentTrack.url
          );
          if (idx !== -1) {
            setSelectedTrackIdx(idx);
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.log('[SessionPage][sync_request] Matched currentTrack in queue at idx', idx);
            }
          } else {
            setSelectedTrackIdx(0);
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.warn('[SessionPage][sync_request] currentTrack not found in queue, defaulting to idx 0');
            }
          }
        } else {
          setSelectedTrackIdx(0);
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.warn('[SessionPage][sync_request] Queue empty or not loaded, defaulting to idx 0');
          }
        }
      } else if (state && typeof state.currentTrackIdx === 'number' && queue && queue.length > 0) {
        // Fallback: If only currentTrackIdx is provided
        const clampedIdx = Math.max(0, Math.min(state.currentTrackIdx, queue.length - 1));
        setSelectedTrackIdx(clampedIdx);
        setCurrentTrackOverride(queue[clampedIdx] || null);
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('[SessionPage][sync_request] Used currentTrackIdx fallback:', clampedIdx);
        }
      }
    });

    // Cleanup to avoid setting state after unmount
    return () => {
      didCancel = true;
      clearTimeout(syncTimeout);
    };
  }, [socket, currentSessionId, queue]);

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
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[SessionPage][handleJoin] Failed to load messages', e);
      }
      savedMessages = [];
    }
    try {
      savedQueue = loadQueue(sessionId) || [];
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[SessionPage][handleJoin] Failed to load queue', e);
      }
      savedQueue = [];
    }

    setCurrentSessionId(sessionId);
    setDisplayName(displayName);
    setMessages(savedMessages);
    setQueue(savedQueue);

    // Save the session data robustly
    try {
      saveSessionData(sessionId, { displayName });
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[SessionPage][handleJoin] Failed to save session data', e);
      }
    }

    // Optionally focus chat input after join (if present)
    setTimeout(() => {
      const chatInput = document.querySelector('input[name="chat"]');
      if (chatInput) chatInput.focus();
    }, 200);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('[SessionPage][handleJoin] Joined session', { sessionId, displayName, messages: savedMessages.length, queue: savedQueue.length });
    }
  }

  const handleExitRoom = () => {
    setShowExitModal(true)
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
    setShowExitModal(false)
  }

  // Enhanced handler for Playlist selection with improved robustness, logging, and user experience
  const handleSelectTrack = (idx, trackObj) => {
    // If a custom track object is provided (e.g., preview or external), override
    if (trackObj) {
      setCurrentTrackOverride(trackObj);
      setSelectedTrackIdx(idx !== null && typeof idx === 'number' ? idx : 0); // fallback to 0 if idx is null
      if (isController && socket) {
        socket.emit('track_change', { sessionId: currentSessionId, idx }, { override: true, track: trackObj });
      }
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[SessionPage][handleSelectTrack] Overriding with custom track', { idx, trackObj });
      }
      return;
    }

    // Defensive: Validate idx and queue
    if (typeof idx !== 'number' || idx < 0 || !Array.isArray(queue) || idx >= queue.length) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[SessionPage][handleSelectTrack] Invalid track index', { idx, queueLength: queue ? queue.length : null });
      }
      return;
    }

    // Clear override and select from queue
    setCurrentTrackOverride(null);
    setSelectedTrackIdx(idx);
    if (isController && socket) {
      socket.emit('track_change', { sessionId: currentSessionId, idx }, { override: false });
    }
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('[SessionPage][handleSelectTrack] Selected track from queue', { idx, track: queue[idx] });
    }
  };

  // In render, always derive currentTrack from latest queue and selectedTrackIdx
  const currentTrack = currentTrackOverride || (queue && queue.length > 0 ? queue[selectedTrackIdx] : null);
  console.log('[DEBUG] Render: currentTrack', currentTrack, 'selectedTrackIdx', selectedTrackIdx, 'queue', queue);

  // When sessionSyncState changes (from join_session), initialize playback/session state
  useEffect(() => {
    if (sessionSyncState) {
      if (Array.isArray(sessionSyncState.queue)) setQueue(sessionSyncState.queue);
      if (typeof sessionSyncState.selectedTrackIdx === 'number') setSelectedTrackIdx(sessionSyncState.selectedTrackIdx);
      if (sessionSyncState.currentTrack) setCurrentTrackOverride(sessionSyncState.currentTrack);
      // Optionally: handle isPlaying, timestamp, etc. for AudioPlayer
      // You can add more state initializations here as needed
    }
  }, [sessionSyncState]);

  // --- Sync Quality Calculation ---
  const syncQuality = useMemo(() => {
    // Use RTT, jitter, and drift if available
    const r = rtt !== null && !isNaN(rtt) ? rtt : 0;
    const j = jitter !== null && !isNaN(jitter) ? Math.abs(jitter) : 0;
    const d = drift !== null && !isNaN(drift) ? Math.abs(drift) : 0;
    if (r < 30 && j < 10 && d < 10) return { label: 'Good', color: 'bg-green-500', tooltip: 'Sync is excellent. Low latency, jitter, and drift.' };
    if (r < 80 && j < 25 && d < 25) return { label: 'Fair', color: 'bg-yellow-500', tooltip: 'Sync is fair. Some latency, jitter, or drift detected.' };
    return { label: 'Poor', color: 'bg-red-500', tooltip: 'Sync is poor. High latency, jitter, or drift.' };
  }, [rtt, jitter, drift]);

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

  // --- Combine Peer and Server Sync ---
  const allOffsets = [
    ...peerSyncs.map((p, i) => (p && paddedPeerIds[i] && p.connectionState === 'connected' && p.peerRtt !== null) ? { offset: p.peerOffset, rtt: p.peerRtt } : null).filter(Boolean),
    { offset: timeOffset, rtt: rtt }
  ];
  const best = allOffsets.reduce((a, b) => (a.rtt < b.rtt ? a : b));
  const ultraPreciseOffset = best.offset;

  // Debug log for ultra-precise offset
  console.log('Ultra-precise offset:', ultraPreciseOffset, 'All offsets:', allOffsets);

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
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <span className="flex ml-1 items-center gap-1 text-xs font-medium text-blue-300" title={`RTT (Round Trip Time): Time for a message to go to the server and back. Lower is better.\nCurrent: ${rtt !== null && !isNaN(rtt) ? rtt.toFixed(1) : '--'} ms`}> 
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2"/><path d="M10 6v4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span>{rtt !== null && !isNaN(rtt) ? rtt.toFixed(1) : '--'}</span>
                    <span className="text-neutral-400 font-normal">ms</span>
                  </span>
                  {/* Divider */}
                  <span className="w-1 h-1 bg-neutral-600 rounded-full mx-1"></span>
                  {/* Offset */}
                  <span className="flex items-center gap-1 text-xs font-medium text-green-300" title={`Offset: Estimated difference between your clock and the server.\nCurrent: ${timeOffset !== null && !isNaN(timeOffset) ? timeOffset.toFixed(1) : '--'} ms`}> 
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block"><rect x="4" y="9" width="12" height="2" rx="1" fill="currentColor"/><rect x="9" y="4" width="2" height="12" rx="1" fill="currentColor"/></svg>
                    <span>{timeOffset !== null && !isNaN(timeOffset) ? timeOffset.toFixed(1) : '--'}</span>
                    <span className="text-neutral-400 font-normal">ms</span>
                  </span>
                  {/* Divider */}
                  <span className="w-1 h-1 bg-neutral-600 rounded-full mx-1"></span>
                  {/* Sync Quality Badge */}
                  <span className={`flex items-center gap-1 text-xs font-semibold text-white px-2 py-0.5 rounded-full ${syncQuality.color} cursor-help`} title={syncQuality.tooltip}>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block"><circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="10" cy="10" r="4" fill="currentColor"/></svg>
                    {syncQuality.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 text-sm transition-all duration-300 ${connectionStatus.animationClass}`}>
                  <div className={`w-2 h-2 rounded-full transition-all duration-300 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-neutral-400">{connected ? 'Connected' : 'Disconnected'}</span>
                </div>
                
                {isController && (
                  <div className={`px-2 py-1 bg-primary/20 border border-primary/30 rounded text-xs text-primary transition-all duration-300 ${controllerStatus.animationClass}`}>
                    Controller
                  </div>
                )}
                
                <button
                  onClick={() => {
                    if (currentSessionId && window.confirm('Clear all saved data for this session?')) {
                      clearSessionData(currentSessionId)
                      setMessages([])
                      setQueue([])
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-all duration-200 hover:shadow-md"
                  title="Clear saved data"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16,17 21,12 16,7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  Exit Room
                </button>
              </div>
            </header>
            {/* Main Content */}
            <div className={`flex-1 overflow-hidden transition-all duration-500 ${mainContent.animationClass}`}>
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
                        sessionSyncState={sessionSyncState}
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
                  />
                }
                rightPanel={
                  <ChatBox
                    socket={socket}
                    sessionId={currentSessionId}
                    clientId={clientId}
                    messages={messages}
                    onSend={(msg) => {
                      setMessages((prev) => {
                        const newMessages = [...prev, msg]
                        if (currentSessionId) {
                          saveMessages(currentSessionId, newMessages)
                        }
                        return newMessages
                      })
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
            {/* Header (reuse, but smaller padding) */}
            <header className="flex items-center justify-between p-2 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              <button
                onClick={handleExitRoom}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-all duration-200 hover:shadow-md"
                title="Exit room"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  messages={messages}
                  onSend={(msg) => {
                    setMessages((prev) => {
                      const newMessages = [...prev, msg]
                      if (currentSessionId) {
                        saveMessages(currentSessionId, newMessages)
                      }
                      return newMessages
                    })
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
              handleExitRoom={handleExitRoom}
            />
          </div>
          {/* Peer Sync Diagnostics */}
          <div className="mt-2 flex flex-col gap-1 text-xs text-neutral-400">
            {peerSyncs.map((p, i) => (
              p && paddedPeerIds[i] ? (
                <div key={paddedPeerIds[i]}>
                  Peer <span className="font-mono text-blue-300">{paddedPeerIds[i]}</span>:
                  RTT <span className="font-mono text-blue-300">{p.peerRtt !== null ? p.peerRtt.toFixed(1) : '--'}</span> ms,
                  Offset <span className="font-mono text-green-300">{p.peerOffset !== null ? p.peerOffset.toFixed(1) : '--'}</span> ms,
                  State: <span className="font-mono">{p.connectionState}</span>
                </div>
              ) : null
            ))}
            <div>
              <span className="font-semibold text-white">Ultra-precise offset used for sync:</span>
              <span className="font-mono text-green-400 ml-2">{ultraPreciseOffset !== null ? ultraPreciseOffset.toFixed(1) : '--'} ms</span>
            </div>
          </div>
        </>
      )}
      <ExitRoomModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onConfirm={confirmExitRoom}
        roomName={currentSessionId}
      />
    </div>
  )
}

export default SessionPage 