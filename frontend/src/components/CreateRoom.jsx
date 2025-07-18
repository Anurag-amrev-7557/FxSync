import React, { useRef, useState } from 'react';
import useFocusTrap from './useFocusTrap';

export default function CreateRoom({ onConfirm, onCancel, sessionId }) {
  const codeRef = useRef(null);
  const modalRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useFocusTrap(true, modalRef, onCancel);

  const shareUrl = `${window.location.origin}/?session=${sessionId}`;

  const handleCopy = () => {
    if (codeRef.current) {
      navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied('link');
    setTimeout(() => setCopied(false), 1200);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Room!',
          text: `Join my room with code: ${sessionId}`,
          url: shareUrl,
        });
      } catch (e) {
        // user cancelled or error
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 flex flex-col items-center justify-center z-50 bg-neutral-950/90 backdrop-blur animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-title"
      aria-describedby="create-room-desc"
    >
      <div className="w-full px-4">
        <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-neutral-800 shadow-xl max-w-[28rem] mx-auto animate-scale-in">
          <h2
            id="create-room-title"
            className="text-2xl font-bold tracking-tight mb-2 text-white text-center flex items-center gap-2"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-primary">
              <rect
                x="3"
                y="7"
                width="18"
                height="13"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M7 7V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            Create a New Room
          </h2>
          <p id="create-room-desc" className="text-neutral-400 mb-6 text-center text-sm">
            Share this code or link with friends to join your room instantly.
          </p>

          <div className="w-full p-4 rounded-lg border border-neutral-700 mb-6">
            <div className="text-center">
              <div className="text-neutral-400 text-xs mb-1 flex items-center justify-center gap-1">
                Room Code
                <button
                  onClick={handleCopy}
                  className="ml-1 px-1 py-0.5 rounded text-primary hover:bg-primary/10 transition"
                  title="Copy code"
                  tabIndex={0}
                  aria-label="Copy room code"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="inline">
                    <rect
                      x="9"
                      y="9"
                      width="13"
                      height="13"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <rect
                      x="3"
                      y="3"
                      width="13"
                      height="13"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
                {copied === true && (
                  <span className="ml-2 text-green-400 text-xs animate-fade-in-fast">Copied!</span>
                )}
              </div>
              <div
                ref={codeRef}
                className="text-primary font-mono text-2xl font-semibold tracking-widest select-all cursor-pointer"
                onClick={handleCopy}
                title="Click to copy code"
                tabIndex={0}
                style={{ outline: 'none' }}
              >
                {sessionId}
              </div>
              <div className="mt-2 text-xs text-neutral-500 break-all flex flex-col items-center gap-1">
                <span>
                  Share:&nbsp;
                  <span
                    className="underline decoration-dotted cursor-pointer hover:text-primary transition"
                    onClick={handleCopyLink}
                    title="Copy link"
                  >
                    {shareUrl}
                  </span>
                  {copied === 'link' && (
                    <span className="ml-2 text-green-400 text-xs animate-fade-in-fast">
                      Link Copied!
                    </span>
                  )}
                </span>
                <button
                  onClick={handleShare}
                  className="mt-2 px-3 py-1 hover:bg-primary text-white rounded-full text-xs font-medium flex items-center gap-1 transition-all duration-200"
                  title="Share room link"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-white"
                  >
                    <path
                      d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <polyline
                      points="16 6 12 2 8 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                    <line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  Share Link
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={onConfirm}
            className="w-full px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-full font-medium text-base cursor-pointer transition-all duration-300 flex items-center justify-center gap-2 mb-3 shadow-lg"
            autoFocus
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
              <path
                d="M12 19V6M5 12l7-7 7 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Enter Room
          </button>
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full font-medium text-base cursor-pointer transition-all duration-300 flex items-center justify-center gap-2"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className="text-neutral-400"
            >
              <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" />
              <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" />
            </svg>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
