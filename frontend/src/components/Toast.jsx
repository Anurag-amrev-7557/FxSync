import React from 'react';

function Toast({ message, onClose }) {
  React.useEffect(() => {
    if (!message) return;
    // Show longer messages for 5s, short for 3s
    const duration = message.length > 40 ? 5000 : 3000;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded shadow-lg animate-fade-in flex items-center gap-3"
      role="alert"
      aria-live="assertive"
    >
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        aria-label="Close notification"
        className="ml-2 px-2 py-1 bg-red-700 hover:bg-red-800 text-white rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        tabIndex={0}
      >
        ×
      </button>
    </div>
  );
}

export default Toast; 