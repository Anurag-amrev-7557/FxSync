import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateRoom from './CreateRoom';
import LoadingSpinner from './LoadingSpinner';
import DeviceCalibrationModal from './DeviceCalibrationModal';
import SessionPage from './SessionPage';

/**
 * Enhanced CreateRoomPage:
 * - Shows animated spinner and friendly messages
 * - Allows retry on error
 * - Handles edge cases (no sessionId returned)
 * - Shows subtle fade-in transitions
 * - Handles browser offline/online status
 */
function CreateRoomPage() {
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const navigate = useNavigate();

  const fetchSessionId = useCallback(async () => {
    setLoading(true);
    setError('');
    setSessionId('');
    try {
      const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${url}/generate-session-id`);
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      if (!data.sessionId) {
        throw new Error('No session ID returned from server');
      }
      setSessionId(data.sessionId);
    } catch (e) {
      setError(
        e.message === 'Failed to fetch'
          ? 'Could not connect to server. Please check your connection.'
          : e.message || 'Failed to create new room'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessionId();
    // Listen for online/offline events
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line
  }, [retryCount]);

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-white animate-fade-in-fast">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" text="Creating your room..." />
          <div className="text-neutral-400 text-sm mt-2 animate-pulse">
            Setting up a new session for you. Please wait...
          </div>
        </div>
      </div>
    );
  }

  if (isOffline) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-white animate-fade-in-fast">
        <div className="p-6 bg-yellow-900/20 border border-yellow-800 rounded-lg text-yellow-400 text-lg flex flex-col items-center gap-3">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            className="text-yellow-400 mb-2"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" />
            <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span>You are offline. Please check your internet connection.</span>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full mt-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-white animate-fade-in-fast">
        <div className="flex flex-col items-center gap-4">
          <div className="p-6 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-lg flex flex-col items-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              className="text-red-400 mb-2"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2" />
              <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>{error}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-full transition"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full transition"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionId) {
    // Defensive: should not happen, but just in case
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-white animate-fade-in-fast">
        <div className="p-6 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-lg">
          Unexpected error: No session ID received.
          <button
            onClick={handleRetry}
            className="ml-4 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-full"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-fast">
      <CreateRoom
        sessionId={sessionId}
        onConfirm={() => navigate(`/${sessionId}`)}
        onCancel={() => navigate('/')}
      />
    </div>
  );
}

export default CreateRoomPage;
