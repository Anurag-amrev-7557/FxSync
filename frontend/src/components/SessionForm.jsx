import React, { useState } from 'react';

export default function SessionForm({ onJoin, currentSessionId }) {
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/generate-session-id`);
      const data = await res.json();
      setSessionId(data.sessionId || '');
    } catch (e) {
      setError('Failed to generate session ID');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!sessionId.trim()) {
      setError('Please enter a session ID');
      return;
    }
    setError('');
    onJoin(sessionId.trim());
  };

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded shadow">
      <form onSubmit={handleJoin} className="flex flex-col gap-4">
        <label className="font-semibold">Session ID</label>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring"
            type="text"
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
            placeholder="Enter or generate a session ID"
            disabled={!!currentSessionId}
          />
          <button
            type="button"
            className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            onClick={handleGenerate}
            disabled={loading || !!currentSessionId}
          >
            {loading ? '...' : 'Random'}
          </button>
        </div>
        <button
          type="submit"
          className="bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
          disabled={!!currentSessionId}
        >
          Join / Create Session
        </button>
        {error && <div className="text-red-500 text-sm">{error}</div>}
      </form>
      {currentSessionId && (
        <div className="mt-6 p-4 bg-gray-100 rounded text-center">
          <div className="font-semibold">Current Session:</div>
          <div className="text-blue-700 font-mono text-lg">{currentSessionId}</div>
          <div className="mt-2 text-xs text-gray-500 break-all">
            Share link: {window.location.origin}/?session={currentSessionId}
          </div>
        </div>
      )}
    </div>
  );
} 