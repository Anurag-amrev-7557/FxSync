import React, { lazy, Suspense } from 'react';
import DisplayNameField from './DisplayNameField';
import RoomCodeInput from './RoomCodeInput';
// import RecentRoomsList from './RecentRoomsList';

const QRCodeDisplay = lazy(() => import('./QRCodeDisplay'));
const RecentRoomsList = lazy(() => import('./RecentRoomsList'));
const SessionHero = lazy(() => import('./SessionHero'));

const SessionFormContainer = React.memo(function SessionFormContainer({
  formState,
  formDispatch,
  formRef,
  inputRef,
  measureRef,
  cursorRef,
  joinFormRef,
  createFormRef,
  handleInputChange,
  handleInputClick,
  handleInputKeyUp,
  handleGenerate,
  handleCreateRoom,
  handleCreateRoomConfirm,
  handleCreateRoomCancel,
  copyToClipboard,
  joinRecentRoom,
  regenerateName,
  isGlowing,
  showCursor,
}) {
  return (
    <div ref={formRef} className="relative z-20 order-2 lg:order-2">
      <div 
        className={`relative form-container overflow-hidden ${formState.isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}`}
        style={{ 
          minHeight: formState.formHeight,
          transitionDelay: formState.isVisible ? '0.5s' : '0s'
        }}
      >
        {/* Blended background for the form */}
        <div className="absolute inset-0 pointer-events-none z-0">
          {/* Subtle gradient overlay for blending */}
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-900/40 via-neutral-800/30 to-neutral-900/40" style={{mixBlendMode: 'lighten'}} />
          {/* Extra noise overlay for texture */}
          <div className="absolute inset-0" style={{backgroundImage: 'url(\"data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'2\' cy=\'2\' r=\'1.5\' fill=\'%23fff\' fill-opacity=\'0.02\'/%3E%3C/svg%3E\")', opacity: 0.3, zIndex: 1, pointerEvents: 'none'}} />
        </div>
        <div 
          className="relative z-10 bg-neutral-900/30 backdrop-blur-2xl rounded-2xl border border-neutral-700/20 p-6 sm:p-8 shadow-xl"
        >
          {/* Join Form */}
          <div 
            ref={joinFormRef}
            className={`form-transition ${formState.showCreateRoom ? 'opacity-0 scale-95 absolute inset-0 pointer-events-none overflow-hidden' : 'opacity-100 scale-100'}`}
          >
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 transition-all duration-500 hover:scale-105">Join a Room</h2>
              <p className="text-sm sm:text-base text-neutral-400 transition-all duration-500 delay-100">Enter a room code to start listening together</p>
            </div>

            <form onSubmit={e => { e.preventDefault(); formDispatch({ type: 'JOIN' }); }} className="space-y-4 sm:space-y-6">
              {/* Display Name Field */}
              <div className="flex items-center justify-between p-4 bg-neutral-800/40 rounded-xl border border-neutral-600/50 transition-all duration-300 hover:bg-neutral-800/60 hover:border-neutral-500/70 group hover:scale-[1.02] hover:shadow-lg">
                <div className="text-xs sm:text-sm text-neutral-400 transition-all duration-300 group-hover:text-neutral-300 font-medium">You'll join as</div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <DisplayNameField
                      displayName={formState.displayName}
                      isRegenerating={formState.isRegenerating}
                      nameAnimation={formState.nameAnimation}
                      onRegenerate={regenerateName}
                    />
                  </div>
                </div>
              </div>

              {/* Room Code Input */}
              <div className="space-y-2 sm:space-y-3">
                <div className="relative group">
                  <div className="relative">
                    <RoomCodeInput
                      sessionId={formState.sessionId}
                      onChange={handleInputChange}
                      onClick={handleInputClick}
                      onKeyUp={handleInputKeyUp}
                      onFocus={() => formDispatch({ type: 'SET', payload: { isFocused: true } })}
                      onBlur={() => formDispatch({ type: 'SET', payload: { isFocused: false } })}
                      isFocused={formState.isFocused}
                      isGlowing={isGlowing}
                      cursorLeft={formState.cursorLeft}
                      showCursor={showCursor}
                      inputRef={inputRef}
                      measureRef={measureRef}
                      error={formState.error}
                      isGenerating={formState.isGenerating}
                      onGenerate={handleGenerate}
                    />
                    {/* Hidden element to measure text width */}
                    <div 
                      ref={measureRef}
                      className="absolute top-0 left-0 invisible font-mono text-sm sm:text-base text-white pointer-events-none"
                      style={{ 
                        whiteSpace: 'pre',
                        fontSize: '16px',
                        lineHeight: '1.5',
                        fontFamily: 'ui-monospace, SFMono-Regular, \"SF Mono\", Consolas, \"Liberation Mono\", Menlo, monospace'
                      }}
                    />
                    {/* Animated cursor */}
                    {formState.isFocused && (
                      <div 
                        ref={cursorRef}
                        className={`absolute top-1/2 transform -translate-y-1/2 w-0.5 h-6 bg-white transition-all duration-200 ${
                          formState.isFocused && !formState.reducedMotion ? 'cursor-blink' : ''
                        }`}
                        style={{
                          left: `${formState.cursorLeft}px`,
                        }}
                      />
                    )}
                  </div>
                  <div className={`absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-500 pointer-events-none ${formState.isFocused ? 'opacity-100' : 'group-hover:opacity-50'}`}></div>
                  {formState.error && (
                    <p className="text-red-400 text-sm mt-2 text-center animate-shake">{formState.error}</p>
                  )}
                </div>
              </div>

              {/* Recent Rooms */}
              <Suspense fallback={null}>
                <RecentRoomsList recentRooms={formState.recentRooms} onJoinRecent={joinRecentRoom} />
              </Suspense>

              {/* Join button */}
              <button
                type="submit"
                disabled={formState.loading || !formState.sessionId.trim()}
                className="w-full px-4 py-3 bg-white text-black rounded-lg font-bold text-sm sm:text-base transition-all duration-500 flex items-center justify-center gap-3 hover:bg-neutral-100 hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:scale-100 disabled:hover:shadow-none relative overflow-hidden group"
              >
                <span className="relative z-10 flex items-center gap-3 transition-all duration-300 group-hover:translate-x-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1 sm:w-5 sm:h-5">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                    <polyline points="10 17 15 12 10 7"></polyline>
                    <line x1="15" x2="3" y1="12" y2="12"></line>
                  </svg>
                  {formState.loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      Joining...
                    </span>
                  ) : (
                    'Join Room'
                  )}
                </span>
                <div className="absolute inset-0 bg-black/5 transform -translate-x-full transition-transform duration-500 group-hover:translate-x-0"></div>
              </button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-700"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-neutral-900/50 px-3 text-neutral-500 font-medium tracking-wider">or</span>
                </div>
              </div>

              {/* Create room button */}
              <button
                onClick={handleCreateRoom}
                disabled={formState.isCreatingRoom}
                className="w-full px-4 py-3 bg-white hover:bg-neutral-100 text-black rounded-lg font-bold text-sm sm:text-base transition-all duration-500 flex items-center justify-center gap-3 border border-white/20 hover:border-white/40 hover:scale-[1.02] hover:shadow-xl group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:scale-100 disabled:hover:shadow-none"
              >
                <span className="relative z-10 flex items-center gap-3 transition-all duration-300 group-hover:translate-x-1">
                  {formState.isCreatingRoom ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:scale-110 sm:w-5 sm:h-5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 12h8"></path>
                        <path d="M12 8v8"></path>
                      </svg>
                      Create New Room
                    </>
                  )}
                </span>
                <div className="absolute inset-0 bg-white/5 transform -translate-x-full transition-transform duration-500 group-hover:translate-x-0"></div>
              </button>
            </form>
          </div>

          {/* Create Room Form */}
          <div 
            ref={createFormRef}
            className={`form-transition ${formState.showCreateRoom ? 'opacity-100 scale-100' : 'opacity-0 scale-95 absolute inset-0 pointer-events-none overflow-hidden'}`}
          >
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 transition-all duration-500 hover:scale-105">Create a New Room</h2>
              <p className="text-sm sm:text-base text-neutral-400 transition-all duration-500 delay-100">Share this code with friends to join your room</p>
            </div>

            {/* Room code display */}
            <div className="w-full p-4 sm:p-6 rounded-xl border border-neutral-600/30 mb-6 shadow-inner">
              <div className="text-center">
                <div className="text-neutral-400 text-xs mb-2 font-medium uppercase tracking-wider">Room Code</div>
                <div className="text-white font-mono text-xl sm:text-2xl font-bold tracking-wider mb-3 bg-gradient-to-r from-neutral-200 to-neutral-400 bg-clip-text text-transparent break-all">{formState.createRoomSessionId}</div>
                <div className="text-xs text-neutral-500 break-all bg-neutral-900/50 p-2 rounded-lg border border-neutral-700/30 mb-4">
                  Share: {window.location.origin}/?session={formState.createRoomSessionId}
                </div>
                {/* QR Code and Copy section */}
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="flex flex-col items-center">
                    <Suspense fallback={null}>
                      <QRCodeDisplay value={`${window.location.origin}/?session=${formState.createRoomSessionId}`} size={100} />
                    </Suspense>
                    <p className="text-xs text-neutral-500 mt-2 text-center">Scan to join on mobile</p>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-px h-16 bg-neutral-600/50 hidden sm:block"></div>
                    <span className="text-xs text-neutral-500 font-medium">OR</span>
                    <div className="w-px h-16 bg-neutral-600/50 hidden sm:block"></div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(`${window.location.origin}/?session=${formState.createRoomSessionId}`)}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs rounded-lg border border-neutral-600 hover:border-neutral-500 transition-all duration-300 hover:scale-105 group/btn flex items-center gap-2 font-medium"
                    >
                      {formState.copied ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
                            <polyline points="20,6 9,17 4,12"></polyline>
                          </svg>
                          <span className="text-green-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover/btn:scale-110">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          Copy Link
                        </>
                      )}
                    </button>
                    <p className="text-xs text-neutral-500 text-center">Share link manually</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Display name (same as join form) */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-neutral-600/50 transition-all duration-300 hover:border-neutral-500/70 group hover:scale-[1.02] hover:shadow-lg mb-6">
              <div className="text-xs sm:text-sm text-neutral-400 transition-all duration-300 group-hover:text-neutral-300 font-medium">You'll join as</div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <DisplayNameField
                    displayName={formState.displayName}
                    isRegenerating={formState.isRegenerating}
                    nameAnimation={formState.nameAnimation}
                    onRegenerate={regenerateName}
                  />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <button
                onClick={handleCreateRoomConfirm}
                className="w-full px-4 py-3 bg-white text-black rounded-lg font-bold text-sm sm:text-base transition-all duration-500 flex items-center justify-center gap-3 hover:bg-neutral-100 hover:scale-[1.02] hover:shadow-xl relative overflow-hidden group"
              >
                <span className="relative z-10 flex items-center gap-3 transition-all duration-300 group-hover:translate-x-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1 sm:w-5 sm:h-5">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                    <polyline points="10 17 15 12 10 7"></polyline>
                    <line x1="15" x2="3" y1="12" y2="12"></line>
                  </svg>
                  Enter Room
                </span>
                <div className="absolute inset-0 bg-black/5 transform -translate-x-full transition-transform duration-500 group-hover:translate-x-0"></div>
              </button>
              
              <button
                onClick={handleCreateRoomCancel}
                className="w-full px-4 py-3 text-white rounded-lg font-bold text-sm sm:text-base transition-all duration-500 flex items-center justify-center gap-3 border border-neutral-700 hover:border-neutral-600 hover:scale-[1.02] hover:shadow-xl group relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-3 transition-all duration-300 group-hover:translate-x-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:scale-110 sm:w-5 sm:h-5">
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path>
                  </svg>
                  Back to Join
                </span>
                <div className="absolute inset-0 bg-white/5 transform -translate-x-full transition-transform duration-500 group-hover:translate-x-0"></div>
              </button>
            </div>

            {/* Error display */}
            {formState.createRoomError && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm text-center animate-shake">
                {formState.createRoomError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default SessionFormContainer; 