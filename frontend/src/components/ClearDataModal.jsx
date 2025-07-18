import React, { useEffect, useRef, useState } from 'react';

function ClearDataModal({ isOpen, onClose, onConfirm, sessionId }) {
  const modalRef = useRef(null);
  const [visible, setVisible] = useState(isOpen);
  const [exiting, setExiting] = useState(false);

  // Handle open/close with animation
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setExiting(false);
    } else if (visible) {
      setExiting(true);
      // Wait for exit animation to finish before unmounting
      const timeout = setTimeout(() => {
        setVisible(false);
        setExiting(false);
      }, 400); // match exit animation duration
      return () => clearTimeout(timeout);
    }
  }, [isOpen, visible]);

  // Focus trap and ESC support
  useEffect(() => {
    if (!visible || exiting) return;
    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const modal = modalRef.current;
    if (!modal) return;
    const focusableEls = modal.querySelectorAll(focusableSelectors);
    const firstEl = focusableEls[0];
    const lastEl = focusableEls[focusableEls.length - 1];
    if (firstEl) firstEl.focus();

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'Tab') {
        // Focus trap
        if (focusableEls.length === 0) return;
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    }
    modal.addEventListener('keydown', handleKeyDown);
    return () => modal.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line
  }, [visible, exiting]);

  // Handle close with exit animation
  const handleClose = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      onClose && onClose();
    }, 400); // match exit animation duration
  };

  // Handle confirm with exit animation
  const handleConfirm = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      onConfirm && onConfirm();
    }, 400); // match exit animation duration
  };

  if (!visible) return null;

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      className={`fixed inset-0 bg-black/80 flex items-center justify-center z-50 transition-all duration-300
        ${exiting ? 'animate-fade-out-fast' : 'animate-fade-in-fast'}`}
      aria-modal="true"
      role="dialog"
      aria-labelledby="clear-data-title"
    >
      {/* Modal Card */}
      <div
        className={`
          relative
          bg-neutral-950
          border border-neutral-800
          rounded-xl
          p-4 sm:p-6 md:p-8
          w-full
          max-w-[95vw] sm:max-w-md md:max-w-lg
          mx-2 sm:mx-4
          shadow-none
          overflow-hidden
          ${
            exiting
              ? 'animate-[modal-pop-out_0.4s_cubic-bezier(0.22,1,0.36,1)_forwards]'
              : 'animate-[modal-pop_0.45s_cubic-bezier(0.22,1,0.36,1)]'
          }
        `}
        style={{
          animationName: exiting ? 'modal-pop-out' : 'modal-pop',
          animationDuration: exiting ? '0.4s' : '0.45s',
          animationTimingFunction: 'cubic-bezier(0.22,1,0.36,1)',
          animationFillMode: exiting ? 'forwards' : undefined,
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5 sm:mb-7">
          <div className="w-10 h-10 flex items-center justify-center bg-red-500/10 border border-red-500/30 rounded-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-400"
            >
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </div>
          <div className="flex-1">
            <h3
              id="clear-data-title"
              className="text-lg sm:text-xl font-bold text-white mb-0 tracking-tight"
            >
              Clear Data
            </h3>
            <p className="text-xs sm:text-sm text-neutral-400 font-normal mt-1">
              This action cannot be undone
            </p>
          </div>
        </div>

        {/* Warning Message */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 sm:p-4 mb-5 sm:mb-7">
          <div className="flex items-start gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-400 mt-0.5 flex-shrink-0"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div className="text-xs sm:text-sm text-red-300">
              <p className="font-medium mb-1">This will permanently delete:</p>
              <ul className="list-disc list-inside space-y-0.5 text-red-200">
                <li>All chat messages</li>
                <li>Playlist and queue data</li>
                <li>Session preferences</li>
                <li>All saved data for this session</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Session Info */}
        <div className="bg-neutral-900 rounded-lg p-3 sm:p-4 mb-5 sm:mb-7 border border-neutral-800 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-400"
          >
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          </svg>
          <span className="text-xs sm:text-sm text-neutral-300">
            <span className="text-neutral-500">Session:</span>{' '}
            <span className="text-white font-mono">{sessionId}</span>
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-row gap-2 mt-2">
          <button
            onClick={handleClose}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-all duration-150 border border-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 text-sm font-medium"
            autoFocus
            disabled={exiting}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all duration-150 border border-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 text-sm font-semibold"
            disabled={exiting}
          >
            Clear Data
          </button>
        </div>
      </div>
      <style>{`
        @keyframes modal-pop {
          0% { opacity: 0; transform: scale(0.92) translateY(30px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes modal-pop-out {
          0% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.92) translateY(30px); }
        }
      `}</style>
    </div>
  );
}

export default ClearDataModal;
