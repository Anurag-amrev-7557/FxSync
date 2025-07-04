import React, { useEffect, useState } from 'react';

export default function DeviceList({ clients = [], controllerClientId, clientId, socket }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const isController = controllerClientId && clientId && controllerClientId === clientId;

  // Reset loading and show success when user becomes controller
  useEffect(() => {
    if (loading && isController) {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1200);
    }
  }, [controllerClientId, clientId, isController, loading]);

  const handleBecomeController = () => {
    if (!socket) return;
    setLoading(true);
    setSuccess(false);
    socket.emit('request_controller', { sessionId: socket.sessionId }, (res) => {
      // If backend responds with success, UI will update via controllerClientId change
      // If not, reset loading after a short delay
      setTimeout(() => setLoading(false), 1500);
    });
  };

  return (
    <div className="max-w-xl mx-auto mt-4 p-4 bg-white rounded shadow">
      <div className="font-semibold mb-2 flex items-center justify-between">
        <span>Connected Devices</span>
        {!isController && (
          <button
            className="ml-4 px-3 py-1 rounded bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-50"
            onClick={handleBecomeController}
            disabled={isController || loading}
          >
            {loading ? 'Requesting...' : 'Become Controller'}
          </button>
        )}
        {success && (
          <span className="ml-4 text-green-600 text-xs font-semibold">You are now the controller!</span>
        )}
      </div>
      <ul className="divide-y divide-gray-200">
        {clients.map((c) => (
          <li
            key={c.id}
            className={`flex items-center py-2 ${c.clientId === controllerClientId ? 'font-bold text-green-700' : ''}`}
          >
            <span className="flex-1">
              {c.displayName || c.clientId || c.id}
              {c.clientId === clientId && (
                <span className="ml-2 text-xs text-blue-500">(You)</span>
              )}
            </span>
            {c.clientId === controllerClientId && (
              <span className="ml-2 px-2 py-1 bg-green-200 text-green-800 rounded text-xs">Controller</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
} 