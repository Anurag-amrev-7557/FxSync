import React from 'react';

export default function CreateRoom({ onConfirm, onCancel, sessionId }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-50 bg-neutral-950/90 backdrop-blur animate-fade-in">
      <div className="w-full px-4">
        <div className="flex flex-col items-center justify-center p-8 bg-neutral-900 rounded-lg border border-neutral-800 shadow-xl max-w-[28rem] mx-auto animate-scale-in">
          <h2 className="text-xl font-bold tracking-tight mb-2 text-white text-center">Create a New Room</h2>
          <p className="text-neutral-400 mb-6 text-center text-sm">Share this code with friends to join your room</p>

          <div className="w-full p-4 bg-neutral-800/50 rounded-lg border border-neutral-700 mb-6">
            <div className="text-center">
              <div className="text-neutral-400 text-xs mb-1">Room Code</div>
              <div className="text-primary font-mono text-2xl font-semibold tracking-widest">{sessionId}</div>
              <div className="mt-2 text-xs text-neutral-500 break-all">
                Share: {window.location.origin}/?session={sessionId}
              </div>
            </div>
          </div>

          <button
            onClick={onConfirm}
            className="w-full px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-full font-medium text-base cursor-pointer transition-all duration-300 flex items-center justify-center gap-2 mb-3"
          >
            Enter Room
          </button>
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full font-medium text-base cursor-pointer transition-all duration-300 flex items-center justify-center gap-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
} 