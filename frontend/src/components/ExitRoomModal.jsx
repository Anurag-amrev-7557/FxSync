import React, { useEffect, useRef, useState } from 'react'

function ExitRoomModal({ isOpen, onClose, onConfirm, roomName }) {
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
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
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

  if (!visible) return null

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      className={`fixed inset-0 bg-black/70 backdrop-blur-[3px] flex items-center justify-center z-50
        ${exiting ? 'animate-fade-out-fast' : 'animate-fade-in-fast'}`}
      aria-modal="true"
      role="dialog"
      aria-labelledby="exit-room-title"
    >
      {/* Modal Card */}
      <div
        className={`
          relative
          bg-gradient-to-br from-neutral-900/95 to-neutral-950/95
          border border-neutral-700/60
          rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl
          overflow-hidden
          ${exiting
            ? 'animate-[modal-pop-out_0.4s_cubic-bezier(0.22,1,0.36,1)_forwards]'
            : 'animate-[modal-pop_0.45s_cubic-bezier(0.22,1,0.36,1)]'}
        `}
        style={{
          animationName: exiting ? 'modal-pop-out' : 'modal-pop',
          animationDuration: exiting ? '0.4s' : '0.45s',
          animationTimingFunction: 'cubic-bezier(0.22,1,0.36,1)',
          animationFillMode: exiting ? 'forwards' : undefined,
        }}
      >
        {/* Decorative Glow */}
        <div className={`absolute -top-10 -right-10 w-40 h-40 bg-red-600/10 rounded-full blur-3xl pointer-events-none ${exiting ? 'animate-[fade-out-glow_0.4s_ease_forwards]' : 'animate-[fade-in-glow_0.7s_ease]'}`} />
        {/* Header */}
        <div className={`flex items-center gap-5 mb-7 ${exiting ? 'animate-[slide-up-fade-out_0.35s_0.05s_forwards]' : 'animate-[slide-down-fade_0.5s_0.08s_both]'}`}>
          <div className={`w-14 h-14 bg-gradient-to-br from-red-500/30 to-red-700/30 rounded-2xl flex items-center justify-center border-2 border-red-500/40 shadow-lg ${exiting ? 'animate-[pop-out_0.35s_0.13s_forwards]' : 'animate-[pop-in_0.5s_0.13s_both]'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 drop-shadow-glow">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16,17 21,12 16,7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </div>
          <div>
            <h3 id="exit-room-title" className="text-2xl font-extrabold text-white mb-1 tracking-tight flex items-center gap-2">
              Exit Room
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </h3>
            <p className="text-base text-neutral-400 font-medium">Are you sure you want to leave this session?</p>
          </div>
        </div>
        
        {/* Room Info */}
        <div className={`bg-gradient-to-r from-neutral-800/70 to-neutral-700/40 rounded-xl p-5 mb-7 border border-neutral-600/40 shadow-inner flex flex-col gap-2 ${exiting ? 'animate-[slide-down-fade-out_0.35s_0.18s_forwards]' : 'animate-[slide-up-fade_0.5s_0.18s_both]'}`}>
          <div className="flex items-center gap-3 mb-1">
            <div className={`w-9 h-9 bg-primary/30 rounded-lg flex items-center justify-center shadow ${exiting ? 'animate-[pop-out_0.35s_0.22s_forwards]' : 'animate-[pop-in_0.5s_0.22s_both]'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-neutral-200">
                <span className="text-neutral-400 font-normal">Room:</span> <span className="text-primary">{roomName}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500 mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12,6 12,12 16,14"></polyline>
            </svg>
            <span>You'll be taken back to the <span className="text-white font-semibold">home page</span></span>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className={`flex gap-4 mt-2 ${exiting ? 'animate-[fade-out_0.3s_0.32s_forwards]' : 'animate-[fade-in_0.5s_0.32s_both]'}`}>
          <button
            onClick={handleClose}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-neutral-800/90 hover:bg-neutral-700/90 text-white rounded-xl transition-all duration-200 hover:shadow-lg hover:scale-[1.03] font-semibold border border-neutral-700/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
            autoFocus
            disabled={exiting}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>Cancel</span>
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-red-600 via-red-700 to-red-800 hover:from-red-700 hover:to-red-900 text-white rounded-xl transition-all duration-200 hover:shadow-xl hover:scale-[1.04] font-semibold shadow-md border border-red-700/60 focus:outline-none focus:ring-2 focus:ring-red-500/40"
            disabled={exiting}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16,17 21,12 16,7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Exit Room</span>
          </button>
        </div>
        {/* Subtle bottom fade */}
        <div className={`absolute left-0 right-0 bottom-0 h-8 bg-gradient-to-t from-black/40 to-transparent pointer-events-none rounded-b-2xl ${exiting ? 'animate-[fade-out_0.3s_0.4s_forwards]' : 'animate-[fade-in_0.7s_0.4s_both]'}`} />
      </div>
      {/* Custom keyframes for entrance and exit animations */}
      <style>
        {`
        @keyframes modal-pop {
          0% {
            opacity: 0;
            transform: scale(0.85) translateY(40px);
            filter: blur(6px);
          }
          60% {
            opacity: 1;
            transform: scale(1.04) translateY(-6px);
            filter: blur(0.5px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
            filter: blur(0);
          }
        }
        @keyframes modal-pop-out {
          0% {
            opacity: 1;
            transform: scale(1) translateY(0);
            filter: blur(0);
          }
          60% {
            opacity: 1;
            transform: scale(1.04) translateY(-6px);
            filter: blur(0.5px);
          }
          100% {
            opacity: 0;
            transform: scale(0.85) translateY(40px);
            filter: blur(6px);
          }
        }
        @keyframes pop-in {
          0% {
            opacity: 0;
            transform: scale(0.7) rotate(-8deg);
            filter: blur(4px);
          }
          80% {
            opacity: 1;
            transform: scale(1.08) rotate(2deg);
            filter: blur(0.5px);
          }
          100% {
            opacity: 1;
            transform: scale(1) rotate(0deg);
            filter: blur(0);
          }
        }
        @keyframes pop-out {
          0% {
            opacity: 1;
            transform: scale(1) rotate(0deg);
            filter: blur(0);
          }
          80% {
            opacity: 1;
            transform: scale(1.08) rotate(2deg);
            filter: blur(0.5px);
          }
          100% {
            opacity: 0;
            transform: scale(0.7) rotate(-8deg);
            filter: blur(4px);
          }
        }
        @keyframes slide-down-fade {
          0% {
            opacity: 0;
            transform: translateY(-32px) scale(0.98);
            filter: blur(4px);
          }
          80% {
            opacity: 1;
            transform: translateY(4px) scale(1.01);
            filter: blur(0.5px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
        @keyframes slide-up-fade {
          0% {
            opacity: 0;
            transform: translateY(32px) scale(0.98);
            filter: blur(4px);
          }
          80% {
            opacity: 1;
            transform: translateY(-4px) scale(1.01);
            filter: blur(0.5px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
        @keyframes slide-down-fade-out {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
          80% {
            opacity: 1;
            transform: translateY(4px) scale(1.01);
            filter: blur(0.5px);
          }
          100% {
            opacity: 0;
            transform: translateY(-32px) scale(0.98);
            filter: blur(4px);
          }
        }
        @keyframes slide-up-fade-out {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
          80% {
            opacity: 1;
            transform: translateY(-4px) scale(1.01);
            filter: blur(0.5px);
          }
          100% {
            opacity: 0;
            transform: translateY(32px) scale(0.98);
            filter: blur(4px);
          }
        }
        @keyframes fade-in {
          0% {
            opacity: 0;
            filter: blur(4px);
          }
          100% {
            opacity: 1;
            filter: blur(0);
          }
        }
        @keyframes fade-out {
          0% {
            opacity: 1;
            filter: blur(0);
          }
          100% {
            opacity: 0;
            filter: blur(4px);
          }
        }
        @keyframes fade-in-glow {
          0% {
            opacity: 0;
            transform: scale(0.8);
            filter: blur(12px);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
        }
        @keyframes fade-out-glow {
          0% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: scale(0.8);
            filter: blur(12px);
          }
        }
        `}
      </style>
    </div>
  )
}

export default ExitRoomModal 