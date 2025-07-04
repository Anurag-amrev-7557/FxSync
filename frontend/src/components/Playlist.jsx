import React, { useState } from 'react';

export default function Playlist({ queue = [], isController, socket, sessionId }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    setLoading(true);
    socket.emit('add_to_queue', { sessionId, url: input }, (res) => {
      setLoading(false);
      setInput('');
    });
  };

  const handleRemove = (idx) => {
    if (!socket) return;
    setLoading(true);
    socket.emit('remove_from_queue', { sessionId, index: idx }, (res) => {
      setLoading(false);
    });
  };

  return (
    <div className="max-w-xl mx-auto mt-4 p-4 bg-white rounded shadow">
      <div className="font-semibold mb-2 flex items-center justify-between">
        <span>Playlist / Queue</span>
        {isController && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Add audio URL..."
              disabled={loading}
            />
            <button
              type="submit"
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
              disabled={loading || !input.trim()}
            >
              Add
            </button>
          </form>
        )}
      </div>
      <ul className="divide-y divide-gray-200 mt-2">
        {queue.length === 0 && <li className="text-gray-400 text-sm py-2">No tracks in queue.</li>}
        {queue.map((item, idx) => (
          <li key={idx} className="flex items-center py-2">
            <span className="flex-1 truncate text-sm">{item.title || item.url}</span>
            {isController && (
              <button
                className="ml-2 px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                onClick={() => handleRemove(idx)}
                disabled={loading}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
} 