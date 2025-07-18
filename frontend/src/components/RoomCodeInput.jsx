/**
 * RoomCodeInput - Room code input field with animated cursor, error display, and generate button.
 *
 * Props:
 *   sessionId (string): The current value of the room code input.
 *   onChange (function): Handler for input change.
 *   onClick (function): Handler for input click.
 *   onKeyUp (function): Handler for input key up.
 *   onFocus (function): Handler for input focus.
 *   onBlur (function): Handler for input blur.
 *   isFocused (boolean): Whether the input is focused.
 *   isGlowing (boolean): Whether to show the glowing animation.
 *   cursorLeft (number): The left position of the animated cursor.
 *   showCursor (boolean): Whether to show the animated cursor.
 *   inputRef (ref): Ref for the input element.
 *   measureRef (ref): Ref for the hidden measure element.
 *   error (string): Error message to display.
 *   isGenerating (boolean): Whether the generate button is loading.
 *   onGenerate (function): Handler for the generate button.
 */
import React from 'react';

export default function RoomCodeInput({
  sessionId,
  onChange,
  onClick,
  onKeyUp,
  onFocus,
  onBlur,
  isFocused,
  isGlowing,
  cursorLeft,
  showCursor,
  inputRef,
  measureRef,
  error,
  isGenerating,
  onGenerate,
}) {
  const inputId = 'room-code-input';
  const errorId = 'room-code-error';
  return (
    <div className="space-y-2 sm:space-y-3">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-neutral-300 transition-all duration-300 hover:text-white"
      >
        Room Code
      </label>
      <div className="relative group">
        <div className="relative">
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={sessionId}
            onChange={onChange}
            onClick={onClick}
            onKeyUp={onKeyUp}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={!!error}
            className={`w-full px-3 py-3 bg-neutral-800/50 border rounded-lg text-white font-mono text-center text-sm sm:text-base focus:outline-none transition-all duration-500 placeholder-neutral-500 group-hover:border-neutral-600 relative z-10 ${
              isFocused
                ? 'border-white/50 ring-2 ring-white/20 scale-[1.02] shadow-lg'
                : 'border-neutral-700'
            } ${isGlowing ? 'animate-pulse' : ''}`}
            style={{ caretColor: 'transparent' }}
            placeholder="Enter room code"
            maxLength={20}
            autoFocus
          />
          {/* Hidden element to measure text width */}
          <div
            ref={measureRef}
            className="absolute top-0 left-0 invisible font-mono text-sm sm:text-base text-white pointer-events-none"
            style={{
              whiteSpace: 'pre',
              fontSize: '16px',
              lineHeight: '1.5',
              fontFamily:
                'ui-monospace, SFMono-Regular, \"SF Mono\", Consolas, \"Liberation Mono\", Menlo, monospace',
            }}
          />
          {/* Animated cursor */}
          {isFocused && (
            <div
              className={`absolute top-1/2 transform -translate-y-1/2 w-0.5 h-6 bg-white transition-all duration-200 ${
                showCursor ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                left: `${cursorLeft}px`,
              }}
            />
          )}
        </div>
        <div
          className={`absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-500 pointer-events-none ${isFocused ? 'opacity-100' : 'group-hover:opacity-50'}`}
        ></div>
        {error && (
          <p
            id={errorId}
            className="text-red-400 text-sm mt-2 text-center animate-shake"
            role="alert"
            aria-live="polite"
          >
            {error}
          </p>
        )}
      </div>
      {/* Generate Room Code Button */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating}
        aria-label="Generate random room code"
        className="w-full px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700/70 text-white text-sm rounded-lg border border-neutral-600/50 hover:border-neutral-500/70 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {isGenerating ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Generating...
          </>
        ) : (
          <>
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
              className="transition-transform duration-300 group-hover:rotate-180"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
            Generate Random Room Code
          </>
        )}
      </button>
    </div>
  );
}
