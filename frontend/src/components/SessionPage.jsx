import React, { useState, useEffect, useRef } from 'react'
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
  controllerOfferDeclined
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

  // Auto-join session if sessionId is in URL
  useEffect(() => {
    if (urlSessionId && !currentSessionId) {
      // Load saved session data
      const savedSessionData = loadSessionData(urlSessionId)
      const savedMessages = loadMessages(urlSessionId)
      const savedQueue = loadQueue(urlSessionId)
      
      // Generate a random display name for auto-join if no saved data
      let autoDisplayName
      if (savedSessionData && savedSessionData.displayName) {
        autoDisplayName = savedSessionData.displayName
      } else {
        const adjectives = ['Cool', 'Epic', 'Amazing', 'Awesome', 'Radical', 'Smooth', 'Groovy', 'Fresh']
        const nouns = ['Listener', 'Groover', 'Vibes', 'Beats', 'Rhythm', 'Melody', 'Harmony', 'Sound']
        const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)]
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)]
        autoDisplayName = `${randomAdj} ${randomNoun}`
      }
      
      setCurrentSessionId(urlSessionId)
      setDisplayName(autoDisplayName)
      setMessages(savedMessages)
      setQueue(savedQueue)
      
      // Save the session data
      saveSessionData(urlSessionId, { displayName: autoDisplayName })
    }
  }, [urlSessionId, currentSessionId, setCurrentSessionId, setDisplayName])

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
      console.log('Received queue_update:', q);
      setQueue(q);
      // If a track_change was received before the queue, apply it now
      if (pendingTrackIdx.current !== null) {
        console.log('Applying buffered track_change:', pendingTrackIdx.current);
        setCurrentTrackOverride(null);
        setSelectedTrackIdx(pendingTrackIdx.current);
        pendingTrackIdx.current = null;
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
      // Support both old (number) and new (object) payloads for safety
      const idx = typeof payload === 'object' && payload !== null ? payload.idx : payload;
      console.log('Received track_change:', payload);
      // If queue is not set yet, buffer the track_change
      if (!queue || queue.length === 0) {
        console.log('Buffering track_change until queue is set');
        pendingTrackIdx.current = idx;
      } else {
        setCurrentTrackOverride(null);
        setSelectedTrackIdx(idx);
      }
    };
    socket.on('track_change', handleTrackChange);
    return () => {
      socket.off('track_change', handleTrackChange);
    };
  }, [socket, queue]);

  // When queue changes, reset selected track if needed
  useEffect(() => {
    if (queue.length === 0) setSelectedTrackIdx(0);
    else if (selectedTrackIdx >= queue.length) setSelectedTrackIdx(0);
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

  const handleJoin = (sessionId, name) => {
    // Load saved data for the session
    const savedMessages = loadMessages(sessionId)
    const savedQueue = loadQueue(sessionId)
    
    setCurrentSessionId(sessionId)
    setDisplayName(name || '')
    setMessages(savedMessages)
    setQueue(savedQueue)
    
    // Save the session data
    saveSessionData(sessionId, { displayName: name || '' })
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

  // New handler for Playlist selection
  const handleSelectTrack = (idx, trackObj) => {
    if (trackObj) {
      setCurrentTrackOverride(trackObj);
      if (isController && socket) {
        socket.emit('track_change', idx);
      }
    } else {
      setCurrentTrackOverride(null);
      setSelectedTrackIdx(idx);
      if (isController && socket) {
        socket.emit('track_change', idx);
      }
    }
  };

  // In render, always derive currentTrack from latest queue and selectedTrackIdx
  const currentTrack = currentTrackOverride || (queue && queue.length > 0 ? queue[selectedTrackIdx] : null);

  // Debug: Log currentTrack, selectedTrackIdx, and queue
  console.log('SessionPage: currentTrack', currentTrack, 'selectedTrackIdx', selectedTrackIdx, 'queue', queue);

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
                  <h1 className="text-lg font-semibold gradient-text">FxSync</h1>
                  <p className="text-xs text-neutral-400">Room: {currentSessionId}</p>
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
                  <h1 className="text-lg font-semibold gradient-text">FxSync</h1>
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