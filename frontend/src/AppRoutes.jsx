import React, { useState, useCallback } from 'react'
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom'
import SessionPage from './components/SessionPage'
import CreateRoomPage from './components/CreateRoomPage'
import LoadingSpinner from './components/LoadingSpinner'
import { Suspense, lazy } from 'react'

// Lazy load components for better performance
const LazySessionPage = lazy(() => import('./components/SessionPage'))
const LazyCreateRoomPage = lazy(() => import('./components/CreateRoomPage'))
const LazyDeviceCalibration = lazy(() => import('./components/DeviceCalibration'))

function AppRoutes() {
  const navigate = useNavigate()
  const location = useLocation();
  const [calibrationResults, setCalibrationResults] = useState(null);

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

  // Extract sessionId from URL for calibration logic
  const match = location.pathname.match(/^\/session\/(.+)$/);
  const sessionId = match ? match[1] : null;
  const needsCalibration = !!sessionId && !calibrationResults;

  // Handler for calibration completion
  const handleCalibrationComplete = useCallback((results) => {
    setCalibrationResults(results);
  }, []);

  // Reset calibration results when session changes
  React.useEffect(() => {
    setCalibrationResults(null);
  }, [sessionId]);

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
            needsCalibration ? (
              <LazyDeviceCalibration onComplete={handleCalibrationComplete} />
            ) : (
              <LazySessionPage onNavigate={handleSessionNavigation} calibrationResults={calibrationResults} />
            )
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