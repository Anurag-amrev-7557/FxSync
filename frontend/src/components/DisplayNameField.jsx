/**
 * DisplayNameField - Shows the user's display name with a regenerate button and animation.
 *
 * Props:
 *   displayName (string): The current display name to show.
 *   isRegenerating (boolean): Whether the name is currently being regenerated (shows spinner).
 *   nameAnimation (boolean): Whether to animate the display name.
 *   onRegenerate (function): Callback to regenerate the display name.
 */
import React from 'react';

export default function DisplayNameField({ displayName, isRegenerating, nameAnimation, onRegenerate }) {
  const displayNameId = 'display-name-value';
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={displayNameId} className="sr-only">Display Name</label>
      <div className="relative">
        <span
          id={displayNameId}
          className={`text-white font-semibold text-sm sm:text-base transition-all duration-300 group-hover:scale-105 ${nameAnimation ? 'animate-pulse' : ''} ${isRegenerating ? 'text-neutral-400' : 'bg-gradient-to-r from-white to-neutral-200 bg-clip-text text-transparent'}`}
          aria-live="polite"
        >
          {displayName}
        </span>
        {/* Animated underline */}
        <div className={`absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent transition-all duration-500 ${nameAnimation ? 'w-full opacity-100' : 'w-0 opacity-0 group-hover:w-full group-hover:opacity-100'}`}></div>
      </div>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={isRegenerating}
        aria-label="Regenerate display name"
        className={`p-2 text-neutral-500 hover:text-white hover:bg-neutral-700/50 rounded-lg transition-all duration-300 hover:scale-110 hover:shadow-lg relative overflow-hidden group/btn ${isRegenerating ? 'animate-spin' : 'hover:rotate-180'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 sm:w-4 sm:h-4">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
          <path d="M21 3v5h-5"></path>
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
          <path d="M3 21v-5h5"></path>
        </svg>
        {/* Button glow effect */}
        <div className="absolute inset-0 bg-white/10 rounded-lg opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
      </button>
    </div>
  );
} 