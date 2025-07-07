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
  const { rtt, timeOffset, jitter, drift, ...socketStuff } = useSocket(currentSessionId, displayName, undefined, setSessionSyncState)

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

  return (
    <Router>
      <div className="app-container">
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
              />
            }
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App
