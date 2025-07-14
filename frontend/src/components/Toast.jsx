import React, { useEffect } from 'react';

export default function Toast({ message, type = 'info', onClose, duration = 4000, id }) {
  useEffect(() => {
    if (!duration) return;
    const timer = setTimeout(() => {
      onClose?.(id);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose, id]);

  return (
    <div
      className={`toast px-4 py-3 rounded-lg shadow-lg mb-3 flex items-center gap-3 text-white ${
        type === 'error'
          ? 'bg-red-600'
          : type === 'success'
          ? 'bg-green-600'
          : type === 'warning'
          ? 'bg-yellow-600 text-black'
          : 'bg-neutral-800'
      } animate-fade-in-fast`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      tabIndex={0}
      style={{ minWidth: 220, maxWidth: 400 }}
    >
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button
        onClick={() => onClose?.(id)}
        className="ml-2 px-2 py-1 rounded bg-black/20 hover:bg-black/40 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-white"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
} 