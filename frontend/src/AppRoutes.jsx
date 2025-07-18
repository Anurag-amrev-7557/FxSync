import React from 'react'
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import SessionPage from './components/SessionPage'
import CreateRoomPage from './components/CreateRoomPage'
import LoadingSpinner from './components/LoadingSpinner'
import { Suspense, lazy } from 'react'

// Lazy load components for better performance
const LazySessionPage = lazy(() => import('./components/SessionPage'))
const LazyCreateRoomPage = lazy(() => import('./components/CreateRoomPage'))

function AppRoutes() {
  const navigate = useNavigate()
  
  // Enhanced handler for when CreateRoom is confirmed
  const handleCreateRoomConfirm = (sessionId, name) => {
    // Navigate to the session with the new session ID
    navigate(`/session/${sessionId}`, { 
      state: { 
        sessionName: name,
        isNewSession: true 
      }
    })
  }

  // Handler for session navigation
  const handleSessionNavigation = (sessionId) => {
    navigate(`/session/${sessionId}`)
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    }>
      <Routes>
        <Route
          path="/create-room"
          element={
            <LazyCreateRoomPage onConfirm={handleCreateRoomConfirm} />
          }
        />
        <Route
          path="/session/:sessionId"
          element={
            <LazySessionPage onNavigate={handleSessionNavigation} />
          }
        />
        <Route
          path="/"
          element={<Navigate to="/create-room" replace />}
        />
        <Route
          path="*"
          element={<Navigate to="/create-room" replace />}
        />
      </Routes>
    </Suspense>
  )
}

export default AppRoutes