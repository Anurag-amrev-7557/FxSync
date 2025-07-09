import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import SessionPage from './components/SessionPage'
import CreateRoomPage from './components/CreateRoomPage'
import useSocket from './hooks/useSocket'
import './App.css'

// Enhanced App component with better state management and routing
function App() {
  // Enhanced session state management
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    // Initialize from URL params or localStorage
    const urlParams = new URLSearchParams(window.location.search)
    const sessionFromUrl = urlParams.get('session')
    const sessionFromStorage = localStorage.getItem('fxSync_sessionId')
    return sessionFromUrl || sessionFromStorage || null
  })
  
  const [displayName, setDisplayName] = useState(() => {
    // Initialize display name from localStorage or generate new one
    const savedName = localStorage.getItem('fxSync_displayName')
    if (savedName) return savedName
    
    const adjectives = ['Cool', 'Epic', 'Amazing', 'Awesome', 'Radical', 'Smooth', 'Groovy', 'Fresh']
    const nouns = ['Listener', 'Groover', 'Vibes', 'Beats', 'Rhythm', 'Melody', 'Harmony', 'Sound']
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)]
    return `${randomAdj} ${randomNoun}`
  })

  // Advanced sync state for session
  const [sessionSyncState, setSessionSyncState] = useState(null);

  // Enhanced socket connection with better error handling
  const { rtt, timeOffset, jitter, drift, forceNtpBatchSync, ...socketStuff } = useSocket(currentSessionId, displayName, undefined, setSessionSyncState)

  // Persist session data to localStorage
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('fxSync_sessionId', currentSessionId)
    } else {
      localStorage.removeItem('fxSync_sessionId')
    }
  }, [currentSessionId])

  useEffect(() => {
    if (displayName) {
      localStorage.setItem('fxSync_displayName', displayName)
    }
  }, [displayName])

  // Enhanced session management functions
  const handleSessionJoin = (sessionId, name) => {
    setCurrentSessionId(sessionId)
    if (name) setDisplayName(name)
    
    // Update URL without page reload
    if (sessionId) {
      const newUrl = `${window.location.origin}/?session=${sessionId}`
      window.history.pushState({ sessionId }, '', newUrl)
    } else {
      window.history.pushState({}, '', window.location.origin)
    }
  }

  const handleSessionLeave = () => {
    setCurrentSessionId(null)
    window.history.pushState({}, '', window.location.origin)
  }

  // Global device change recalibration prompt
  const [showRecalibratePrompt, setShowRecalibratePrompt] = useState(false);
  useEffect(() => {
    function handleDeviceChange() {
      setShowRecalibratePrompt(true);
    }
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    }
  }, []);
  function handleRecalibrate() {
    setShowRecalibratePrompt(false);
    // Dispatch a global event for calibration (to be handled elsewhere)
    window.dispatchEvent(new Event('startCalibration'));
  }

  return (
    <Router>
      <div className="app-container">
        {showRecalibratePrompt && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-yellow-600 text-white px-4 py-2 rounded shadow z-50 flex items-center gap-2">
            <span>Audio output device changed.</span>
            <button onClick={handleRecalibrate} className="underline font-semibold">Recalibrate</button>
            <span>for best sync.</span>
            <button onClick={() => setShowRecalibratePrompt(false)} className="ml-2 text-white/70 hover:text-white">&times;</button>
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              <SessionPage
                currentSessionId={currentSessionId}
                setCurrentSessionId={handleSessionJoin}
                displayName={displayName}
                setDisplayName={setDisplayName}
                onLeaveSession={handleSessionLeave}
                {...socketStuff}
                sessionSyncState={sessionSyncState}
                setSessionSyncState={setSessionSyncState}
                rtt={rtt}
                timeOffset={timeOffset}
                jitter={jitter}
                drift={drift}
                forceNtpBatchSync={forceNtpBatchSync}
              />
            }
          />
          <Route
            path="/create-room"
            element={
              <CreateRoomPage
                setCurrentSessionId={handleSessionJoin}
                setDisplayName={setDisplayName}
                currentDisplayName={displayName}
              />
            }
          />
          <Route
            path="/:sessionId"
            element={
              <SessionPage
                currentSessionId={currentSessionId}
                setCurrentSessionId={handleSessionJoin}
                displayName={displayName}
                setDisplayName={setDisplayName}
                onLeaveSession={handleSessionLeave}
                {...socketStuff}
                sessionSyncState={sessionSyncState}
                setSessionSyncState={setSessionSyncState}
                rtt={rtt}
                timeOffset={timeOffset}
                jitter={jitter}
                drift={drift}
                forceNtpBatchSync={forceNtpBatchSync}
              />
            }
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App
