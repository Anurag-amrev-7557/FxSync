import React, { useState, useEffect, createContext } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import SessionPage from './components/SessionPage'
import CreateRoomPage from './components/SessionForm'
import useSocket from './hooks/useSocket'
import './App.css'
import ErrorBoundary from './components/ErrorBoundary'
import usePrefersReducedMotion from './hooks/usePrefersReducedMotion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const ReducedMotionContext = createContext(false);

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

  const reducedMotion = usePrefersReducedMotion();

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
    <ReducedMotionContext.Provider value={reducedMotion}>
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
    </ReducedMotionContext.Provider>
  )
}

const queryClient = new QueryClient();

export default function AppWithQueryProvider() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}
