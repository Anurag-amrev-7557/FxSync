import React, { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import QRCodeDisplay from './QRCodeDisplay';
import CreateRoom from './CreateRoom';
import { throttle } from '../utils/throttle';
import DisplayNameField from './DisplayNameField';
import RoomCodeInput from './RoomCodeInput';
import RecentRoomsList from './RecentRoomsList';
import SessionHero from './SessionHero';
import SessionFormContainer from './SessionFormContainer';
import SessionFooter from './SessionFooter';
import SessionPage from './SessionPage';

// --- State management with useReducer ---
// Refactored: Use useState for form state, refs for animation state
const initialFormState = {
  sessionId: '',
  displayName: '',
  error: '',
  loading: false,
  isGenerating: false,
  isFocused: false,
  isVisible: false,
  cursorPosition: 0,
  cursorLeft: 16,
  isRegenerating: false,
  nameAnimation: false,
  showCreateRoom: false,
  createRoomSessionId: '',
  isCreatingRoom: false,
  createRoomError: '',
  copied: false,
  recentRooms: [],
  formHeight: 'auto',
  reducedMotion: false,
};

function formReducer(state, action) {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

// Utility function to detect mobile or tablet devices
function isMobileOrTablet() {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|BlackBerry|webOS|Windows Phone|Tablet|Mobile/i.test(navigator.userAgent);
}

export default function SessionForm({ onJoin, currentSessionId }) {
  // Form state
  const [formState, formDispatch] = useReducer(formReducer, initialFormState);
  // Animation-only state as refs
  const isGlowingRef = useRef(false);
  const showCursorRef = useRef(true);
  const particlesRef = useRef([]);
  const formRef = useRef(null);
  const inputRef = useRef(null);
  const cursorRef = useRef(null);
  const measureRef = useRef(null);
  const joinFormRef = useRef(null);
  const createFormRef = useRef(null);
  const parallaxRef = useRef(null);
  const effectsCanvasRef = useRef(null);
  // Add a ref to store the debounce timeout for localStorage writes
  const recentRoomsWriteTimeout = useRef(null);
  // Add a ref to store the current AbortController
  const fetchControllerRef = useRef(null);

  // Load recent rooms from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('fxsync_recent_rooms');
    if (saved) {
      try {
        formDispatch({ type: 'SET', payload: { recentRooms: JSON.parse(saved) } });
      } catch (e) {
        console.error('Failed to parse recent rooms:', e);
      }
    }
  }, []);

  // Generate a random display name
  useEffect(() => {
    const generateRandomName = () => {
      const adjectives = [
        'Cool', 'Epic', 'Amazing', 'Awesome', 'Radical', 'Smooth', 'Groovy', 'Fresh',
        'Electric', 'Cosmic', 'Neon', 'Vintage', 'Digital', 'Analog', 'Chill', 'Vibey',
        'Sonic', 'Harmonic', 'Rhythmic', 'Melodic', 'Dynamic', 'Energetic', 'Mystic',
        'Zen', 'Flow', 'Pulse', 'Wave', 'Beat', 'Tempo', 'Sync', 'Fusion', 'Nova'
      ];
      const nouns = [
        'Listener', 'Groover', 'Vibes', 'Beats', 'Rhythm', 'Melody', 'Harmony', 'Sound',
        'Head', 'Soul', 'Spirit', 'Dreamer', 'Explorer', 'Creator', 'Mixer', 'Producer',
        'DJ', 'Artist', 'Musician', 'Conductor', 'Composer', 'Performer', 'Enthusiast',
        'Collector', 'Curator', 'Connoisseur', 'Aficionado', 'Fan', 'Lover', 'Seeker',
        'Traveler', 'Adventurer', 'Pioneer', 'Innovator', 'Visionary'
      ];
      const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
      return `${randomAdj} ${randomNoun}`;
    };
    
    formDispatch({ type: 'SET', payload: { displayName: generateRandomName() } });
  }, []);

  useEffect(() => {
    formDispatch({ type: 'SET', payload: { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches } });
  }, []);

  // Memoize throttled handlers
  const throttledMouseMove = useCallback(throttle((e) => {
      if (parallaxRef.current) {
        parallaxRef.current.style.transform = `translate(${e.clientX * 0.01}px, ${e.clientY * 0.01}px)`;
      }
  }, 32), []);

  const throttledClick = useCallback(
    throttle((e) => {
      if (formState.reducedMotion) return;
      if (isMobileOrTablet()) return; // Disable particles on mobile/tablet
      const now = Date.now();
      const particles = Array.from({ length: 8 }, (_, i) => ({
        created: now,
        x: e.clientX,
        y: e.clientY,
        angle: (i * 45) * (Math.PI / 180),
        speed: 2 + Math.random() * 3,
        size: 2 + Math.random() * 4,
        color: [
          'rgba(255, 255, 255, 0.8)',
          'rgba(255, 255, 255, 0.6)',
          'rgba(156, 163, 175, 0.8)',
          'rgba(107, 114, 128, 0.8)',
          'rgba(75, 85, 99, 0.8)',
          'rgba(59, 130, 246, 0.6)',
          'rgba(147, 197, 253, 0.7)',
          'rgba(191, 219, 254, 0.6)'
        ][i % 8]
      }));
      particlesRef.current.push(...particles);
    }, 32),
    [formState.reducedMotion]
  );

  // Animation effects
  useEffect(() => {
    formDispatch({ type: 'SET', payload: { isVisible: true } });

    document.addEventListener('mousemove', throttledMouseMove);
    document.addEventListener('click', throttledClick);

    // rAF cleanup for click/particle effects
    let animFrame;
    const cleanupEffects = () => {
      formDispatch({ type: 'CLEANUP_EFFECTS' });
      animFrame = requestAnimationFrame(cleanupEffects);
    };
    animFrame = requestAnimationFrame(cleanupEffects);

    // Pause animations when tab is inactive
    const handleVisibility = () => {
      if (document.hidden) {
        showCursorRef.current = true; // show cursor, stop blinking
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('mousemove', throttledMouseMove);
      document.removeEventListener('click', throttledClick);
      if (animFrame) cancelAnimationFrame(animFrame);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [formState.reducedMotion, throttledMouseMove, throttledClick]);

  // Enhanced: Update cursor position when sessionId, cursorPosition, focus, or font size changes
  useEffect(() => {
    if (formState.isFocused && inputRef.current) {
      let rafId;
      // Recalculate on font size or window resize for better accuracy
      const recalc = () => {
        rafId = requestAnimationFrame(() => {
          const newCursorLeft = calculateCursorPosition(formState.sessionId, formState.cursorPosition);
          formDispatch({ type: 'SET', payload: { cursorLeft: newCursorLeft } });
        });
      };

      recalc();

      window.addEventListener('resize', recalc);

      let fontResizeObserver;
      if (window.ResizeObserver && inputRef.current) {
        fontResizeObserver = new window.ResizeObserver(recalc);
        fontResizeObserver.observe(inputRef.current);
      }

      return () => {
        window.removeEventListener('resize', recalc);
        if (rafId) cancelAnimationFrame(rafId);
        if (fontResizeObserver && inputRef.current) {
          fontResizeObserver.unobserve(inputRef.current);
        }
      };
    }
  }, [formState.sessionId, formState.cursorPosition, formState.isFocused]);

  // Calculate cursor position based on text width
  const calculateCursorPosition = (text, position) => {
    if (!measureRef.current || !inputRef.current) return 16;
    
    const measureText = text.substring(0, position);
    measureRef.current.textContent = measureText;
    const textWidth = measureRef.current.offsetWidth;
    
    // Get actual input dimensions
    const inputRect = inputRef.current.getBoundingClientRect();
    const inputWidth = inputRect.width;
    const padding = 16; // px-4 = 16px padding
    
    // Calculate center position for the text
    const fullTextWidth = measureRef.current.scrollWidth;
    const centerOffset = (inputWidth - fullTextWidth) / 2;
    
    // Position cursor relative to the text start
    const cursorPosition = centerOffset + textWidth;
    
    return Math.max(padding, Math.min(cursorPosition, inputWidth - padding));
  };

  // Enhanced input handling
  const handleInputChange = useCallback((e) => {
    const value = e.target.value.toLowerCase();
    formDispatch({ type: 'SET', payload: { sessionId: value } });
    const input = e.target;
    const newPosition = input.selectionStart || value.length;
    formDispatch({ type: 'SET', payload: { cursorPosition: newPosition } });
    const newCursorLeft = calculateCursorPosition(value, newPosition);
    formDispatch({ type: 'SET', payload: { cursorLeft: newCursorLeft } });
    setTimeout(() => formDispatch({ type: 'SET', payload: { isTyping: false } }), 1000);
    if (value.length > 0) {
      isGlowingRef.current = true;
      setTimeout(() => isGlowingRef.current = false, 2000);
    }
  }, [formDispatch]);

  // Handle input click to update cursor position
  const handleInputClick = useCallback((e) => {
    const input = e.target;
    const newPosition = input.selectionStart || input.value.length;
    formDispatch({ type: 'SET', payload: { cursorPosition: newPosition } });
    const newCursorLeft = calculateCursorPosition(input.value, newPosition);
    formDispatch({ type: 'SET', payload: { cursorLeft: newCursorLeft } });
  }, [formDispatch]);

  // Handle input key events to update cursor position
  const handleInputKeyUp = useCallback((e) => {
    const input = e.target;
    const newPosition = input.selectionStart || input.value.length;
    formDispatch({ type: 'SET', payload: { cursorPosition: newPosition } });
    const newCursorLeft = calculateCursorPosition(input.value, newPosition);
    formDispatch({ type: 'SET', payload: { cursorLeft: newCursorLeft } });
  }, [formDispatch]);

  // Magnetic effect for buttons
  const handleGenerate = async () => {
    // Abort any in-flight request
    if (fetchControllerRef.current) fetchControllerRef.current.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    formDispatch({ type: 'SET', payload: { isGenerating: true, error: '' } });
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/session/generate-session-id`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }

      const data = await res.json();

      if (!data.sessionId) {
        formDispatch({ type: 'SET', payload: { error: 'No session ID returned from server', sessionId: '' } });
      } else {
        formDispatch({ type: 'SET', payload: { sessionId: data.sessionId, isGlowing: true } });
        setTimeout(() => isGlowingRef.current = false, 1500);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        formDispatch({ type: 'SET', payload: { error: e?.message ? `Failed to generate session ID: ${e.message}` : 'Failed to generate session ID', sessionId: '' } });
      }
    } finally {
      formDispatch({ type: 'SET', payload: { isGenerating: false } });
      fetchControllerRef.current = null;
    }
  };

  const handleCreateRoom = async () => {
    if (fetchControllerRef.current) fetchControllerRef.current.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    formDispatch({ type: 'SET', payload: { isCreatingRoom: true, createRoomError: '' } });
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/session/generate-session-id`, { signal: controller.signal });
      const data = await res.json();
      formDispatch({ type: 'SET', payload: { createRoomSessionId: data.sessionId || '' } });
      formDispatch({ type: 'SET', payload: { showCreateRoom: true } });
    } catch (e) {
      if (e.name !== 'AbortError') {
        formDispatch({ type: 'SET', payload: { createRoomError: 'Failed to create new room' } });
      }
    } finally {
      formDispatch({ type: 'SET', payload: { isCreatingRoom: false } });
      fetchControllerRef.current = null;
    }
  };

  // Replace handleCreateRoomConfirm to trigger calibration modal
  const handleCreateRoomConfirm = () => {
    onJoin(formState.createRoomSessionId, formState.displayName);
  };

  const handleCreateRoomCancel = () => {
    formDispatch({ type: 'SET', payload: { showCreateRoom: false, createRoomSessionId: '', createRoomError: '' } });
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      formDispatch({ type: 'SET', payload: { copied: true } });
      setTimeout(() => formDispatch({ type: 'SET', payload: { copied: false } }), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const addToRecentRooms = (roomId) => {
    const updated = [roomId, ...formState.recentRooms.filter(id => id !== roomId)].slice(0, 5);
    formDispatch({ type: 'SET', payload: { recentRooms: updated } });
    // Debounce localStorage write
    if (recentRoomsWriteTimeout.current) clearTimeout(recentRoomsWriteTimeout.current);
    recentRoomsWriteTimeout.current = setTimeout(() => {
    localStorage.setItem('fxsync_recent_rooms', JSON.stringify(updated));
    }, 500);
  };

  const joinRecentRoom = (roomId) => {
    formDispatch({ type: 'SET', payload: { sessionId: roomId } });
    onJoin(roomId, formState.displayName);
    addToRecentRooms(roomId);
  };

  // Enhanced: Calculate and set form height for smooth transitions, with animation and edge case handling
  // --- Remove old updateFormHeight and related useEffects ---
  // --- Add new height management logic below ---

  // Enhanced: Use a single ResizeObserver for the form container and only animate height on form switch
  useEffect(() => {
    if (!formRef.current) return;
    let observer;
    let lastHeight = null;

    const updateHeight = () => {
      // Only update minHeight, not height, for smoother transitions
      let target = formState.showCreateRoom ? createFormRef.current : joinFormRef.current;
      if (target) {
        const newHeight = target.scrollHeight + 48; // 48px for padding/margin
        if (lastHeight !== newHeight) {
          formRef.current.style.minHeight = `${newHeight}px`;
          lastHeight = newHeight;
          formDispatch({ type: 'SET', payload: { formHeight: `${newHeight}px` } });
        }
      }
    };

    // Observe the visible form for size changes
    const target = formState.showCreateRoom ? createFormRef.current : joinFormRef.current;
    if (window.ResizeObserver && target) {
      observer = new window.ResizeObserver(updateHeight);
      observer.observe(target);
    }
    // Initial set
    updateHeight();

    // Also update on window resize
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);

    return () => {
      if (observer && target) observer.unobserve(target);
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
    };
  }, [formState.showCreateRoom, formState.createRoomSessionId, formState.recentRooms.length]);

  const regenerateName = () => {
    formDispatch({ type: 'SET', payload: { isRegenerating: true, nameAnimation: true } });
    
    const adjectives = [
      'Cool', 'Epic', 'Amazing', 'Awesome', 'Radical', 'Smooth', 'Groovy', 'Fresh',
      'Electric', 'Cosmic', 'Neon', 'Vintage', 'Digital', 'Analog', 'Chill', 'Vibey',
      'Sonic', 'Harmonic', 'Rhythmic', 'Melodic', 'Dynamic', 'Energetic', 'Mystic',
      'Zen', 'Flow', 'Pulse', 'Wave', 'Beat', 'Tempo', 'Sync', 'Fusion', 'Nova'
    ];
    const nouns = [
      'Listener', 'Groover', 'Vibes', 'Beats', 'Rhythm', 'Melody', 'Harmony', 'Sound',
      'Head', 'Soul', 'Spirit', 'Dreamer', 'Explorer', 'Creator', 'Mixer', 'Producer',
      'DJ', 'Artist', 'Musician', 'Conductor', 'Composer', 'Performer', 'Enthusiast',
      'Collector', 'Curator', 'Connoisseur', 'Aficionado', 'Fan', 'Lover', 'Seeker',
      'Traveler', 'Adventurer', 'Pioneer', 'Innovator', 'Visionary'
    ];
    
    // Avoid generating the same name
    let newName;
    do {
      const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
      newName = `${randomAdj} ${randomNoun}`;
    } while (newName === formState.displayName && adjectives.length > 1 && nouns.length > 1);
    
    formDispatch({ type: 'SET', payload: { displayName: newName } });
    
    // Reset states after a short delay
    setTimeout(() => {
      formDispatch({ type: 'SET', payload: { isRegenerating: false } });
      setTimeout(() => formDispatch({ type: 'SET', payload: { nameAnimation: false } }), 300);
    }, 200);
  };

  useEffect(() => {
    const canvas = effectsCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let running = true;

    // Check for reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    function drawParticles() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();
      particlesRef.current = particlesRef.current.filter(p => now - p.created < 800);
      for (const p of particlesRef.current) {
        const progress = (now - p.created) / 800;
        const x = p.x + Math.cos(p.angle) * p.speed * 100 * progress;
        const y = p.y + Math.sin(p.angle) * p.speed * 100 * progress;
        ctx.globalAlpha = 1 - progress;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, 2 * Math.PI);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      animationFrameId = requestAnimationFrame(drawParticles);
    }

    function handleVisibility() {
      running = !document.hidden;
      if (running) {
        drawParticles();
      } else {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);

    drawParticles();

    return () => {
      running = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Abort any in-flight fetch on unmount
  useEffect(() => {
    return () => {
      if (fetchControllerRef.current) fetchControllerRef.current.abort();
    };
  }, []);

  // Add handleJoin function
  const handleJoin = () => {
    if (formState.sessionId && formState.displayName) {
      onJoin(formState.sessionId, formState.displayName);
    }
  };

  if (currentSessionId) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-50 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 backdrop-blur-sm animate-fade-in">
        <div className="w-full px-4">
          <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-gradient-to-br from-neutral-900/95 via-neutral-800/90 to-neutral-900/95 rounded-2xl border border-neutral-700/50 shadow-2xl max-w-[32rem] mx-auto animate-scale-in backdrop-blur-xl">
            {/* Header with enhanced styling */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-neutral-800 to-neutral-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300 sm:w-7 sm:h-7">
                  <path d="M9 18V5l12-2v13"></path>
                  <circle cx="6" cy="18" r="3"></circle>
                  <circle cx="18" cy="16" r="3"></circle>
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-2 text-white">Current Session</h2>
              <p className="text-neutral-400 text-xs sm:text-sm">You're connected to a FxSync room</p>
            </div>
            
            {/* Room code display with minimalist styling */}
            <div className="w-full p-4 sm:p-6 bg-neutral-900/50 rounded-2xl border border-neutral-700/30 mb-6 shadow-lg relative overflow-hidden group">
              {/* Subtle hover effect */}
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <div className="text-center relative z-10">
                <div className="text-neutral-400 text-xs mb-3 font-medium uppercase tracking-wider">Room Code</div>
                <div className="text-white font-mono text-2xl sm:text-3xl font-bold tracking-wider mb-4 break-all">{currentSessionId}</div>
                <div className="text-xs text-neutral-500 break-all bg-neutral-800/40 p-3 rounded-lg border border-neutral-600/30 mb-4 font-mono">
                  Share: {window.location.origin}/?session={currentSessionId}
                </div>
                {/* QR Code and Copy section */}
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="flex flex-col items-center">
                    <QRCodeDisplay value={`${window.location.origin}/?session=${currentSessionId}`} size={100} />
                    <p className="text-xs text-neutral-500 mt-2 text-center">Scan to join on mobile</p>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-px h-16 bg-neutral-600/50 hidden sm:block"></div>
                    <span className="text-xs text-neutral-500 font-medium">OR</span>
                    <div className="w-px h-16 bg-neutral-600/50 hidden sm:block"></div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(`${window.location.origin}/?session=${currentSessionId}`)}
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

            {/* Leave button with enhanced styling */}
            <button
              onClick={() => onJoin(null)}
              className="w-full px-4 sm:px-6 py-3 bg-gradient-to-r from-neutral-800 via-neutral-700 to-neutral-800 hover:from-neutral-700 hover:via-neutral-600 hover:to-neutral-700 text-white rounded-xl font-semibold text-sm cursor-pointer transition-all duration-300 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl border border-neutral-600/30 hover:border-neutral-500/50 transform hover:scale-[1.02]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-[18px] sm:h-[18px]">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16,17 21,12 16,7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Leave Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden transition-background duration-1000" style={{ transition: 'background 1s cubic-bezier(0.4,0,0.2,1)' }}>
      <style>{`
        .form-container {
          transition: min-height 0.7s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .form-transition {
          transition: all 0.7s cubic-bezier(0.4, 0, 0.2, 1);
        }
        *:focus, *:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
      `}</style>
      {/* Dynamic & Moving Animated Background */}
      <div
        ref={parallaxRef}
        className="absolute inset-0 pointer-events-none z-0"
        aria-hidden="true"
      >
        {/* Moving animated grid */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 50%,rgba(255,255,255,0.04) 1.5px,transparent 1.5px)',
            backgroundSize: '80px 80px',
            mixBlendMode: 'lighten',
            opacity: 0.7,
            filter: 'blur(0.5px)',
            animation: 'bgMove 16s linear infinite',
          }}
        />
        {/* Dynamic animated gradient overlays */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 60% 40% at var(--ellipse1-x,60%) var(--ellipse1-y,30%), rgba(59,130,246,0.13) 0%, transparent 80%),
              radial-gradient(ellipse 40% 30% at var(--ellipse2-x,30%) var(--ellipse2-y,70%), rgba(236,72,153,0.10) 0%, transparent 80%),
              radial-gradient(ellipse 30% 20% at var(--ellipse3-x,80%) var(--ellipse3-y,80%), rgba(34,197,94,0.08) 0%, transparent 80%)
            `,
            animation: 'gradientMove 18s ease-in-out infinite alternate',
            zIndex: 1,
          }}
        />
        {/* Faint animated noise overlay */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'2\' cy=\'2\' r=\'1.5\' fill=\'%23fff\' fill-opacity=\'0.03\'/%3E%3C/svg%3E")',
            opacity: 0.5,
            zIndex: 2,
            pointerEvents: 'none',
            animation: 'noiseMove 10s linear infinite',
            backgroundPosition: '0 0',
          }}
        />
        {/* Multiple animated floating shapes for depth and movement */}
        <svg
          className="absolute left-1/4 top-1/5 w-32 h-32 opacity-30"
          style={{
            zIndex: 3,
            filter: 'blur(1px)',
            animation: 'float-slow 12s ease-in-out infinite, shapeMove1 18s ease-in-out infinite alternate',
          }}
          viewBox="0 0 100 100"
        >
          <circle cx="50" cy="50" r="40" fill="#3b82f6" fillOpacity="0.12" />
        </svg>
        <svg
          className="absolute right-1/5 bottom-1/6 w-24 h-24 opacity-25"
          style={{
            zIndex: 3,
            filter: 'blur(0.5px)',
            animation: 'float-medium 8s ease-in-out infinite, shapeMove2 14s ease-in-out infinite alternate',
          }}
          viewBox="0 0 100 100"
        >
          <rect x="20" y="20" width="60" height="60" rx="20" fill="#ec4899" fillOpacity="0.10" />
        </svg>
        <svg
          className="absolute left-1/3 bottom-1/8 w-20 h-20 opacity-20"
          style={{
            zIndex: 3,
            filter: 'blur(0.5px)',
            animation: 'float-fast 5s ease-in-out infinite, shapeMove3 11s ease-in-out infinite alternate',
          }}
          viewBox="0 0 100 100"
        >
          <polygon points="50,10 90,90 10,90" fill="#22c55e" fillOpacity="0.10" />
        </svg>
        {/* Extra animated floating shape for more dynamic feel */}
        <svg
          className="absolute left-1/2 top-1/2 w-16 h-16 opacity-15"
          style={{
            zIndex: 3,
            filter: 'blur(0.7px)',
            animation: 'float-extra 9s ease-in-out infinite, shapeMove4 13s ease-in-out infinite alternate',
          }}
          viewBox="0 0 100 100"
        >
          <ellipse cx="50" cy="50" rx="35" ry="20" fill="#fbbf24" fillOpacity="0.08" />
        </svg>
        <style>{`
          @keyframes bgMove {
            0% { background-position: 0 0; }
            100% { background-position: 80px 80px; }
          }
          @keyframes noiseMove {
            0% { background-position: 0 0; }
            100% { background-position: 40px 40px; }
          }
          @keyframes gradientMove {
            0% {
              --ellipse1-x: 60%; --ellipse1-y: 30%;
              --ellipse2-x: 30%; --ellipse2-y: 70%;
              --ellipse3-x: 80%; --ellipse3-y: 80%;
            }
            25% {
              --ellipse1-x: 65%; --ellipse1-y: 35%;
              --ellipse2-x: 25%; --ellipse2-y: 65%;
              --ellipse3-x: 75%; --ellipse3-y: 85%;
            }
            50% {
              --ellipse1-x: 55%; --ellipse1-y: 35%;
              --ellipse2-x: 35%; --ellipse2-y: 75%;
              --ellipse3-x: 85%; --ellipse3-y: 75%;
            }
            75% {
              --ellipse1-x: 62%; --ellipse1-y: 28%;
              --ellipse2-x: 28%; --ellipse2-y: 72%;
              --ellipse3-x: 78%; --ellipse3-y: 82%;
            }
            100% {
              --ellipse1-x: 40%; --ellipse1-y: 70%;
              --ellipse2-x: 60%; --ellipse2-y: 30%;
              --ellipse3-x: 20%; --ellipse3-y: 60%;
            }
          }
          @keyframes float-slow {
            0% { transform: translateY(0px) scale(1) rotate(0deg);}
            50% { transform: translateY(-18px) scale(1.04) rotate(3deg);}
            100% { transform: translateY(0px) scale(1) rotate(0deg);}
          }
          @keyframes float-medium {
            0% { transform: translateY(0px) scale(1) rotate(0deg);}
            50% { transform: translateY(-12px) scale(1.03) rotate(-2deg);}
            100% { transform: translateY(0px) scale(1) rotate(0deg);}
          }
          @keyframes float-fast {
            0% { transform: translateY(0px) scale(1) rotate(0deg);}
            50% { transform: translateY(-8px) scale(1.02) rotate(2deg);}
            100% { transform: translateY(0px) scale(1) rotate(0deg);}
          }
          @keyframes float-extra {
            0% { transform: translateY(0px) scale(1) rotate(0deg);}
            50% { transform: translateY(-16px) scale(1.05) rotate(-4deg);}
            100% { transform: translateY(0px) scale(1) rotate(0deg);}
          }
          @keyframes shapeMove1 {
            0% { left: 25%; top: 20%; }
            50% { left: 28%; top: 18%; }
            100% { left: 25%; top: 20%; }
          }
          @keyframes shapeMove2 {
            0% { right: 20%; bottom: 16%; }
            50% { right: 18%; bottom: 13%; }
            100% { right: 20%; bottom: 16%; }
          }
          @keyframes shapeMove3 {
            0% { left: 33%; bottom: 12%; }
            50% { left: 36%; bottom: 10%; }
            100% { left: 33%; bottom: 12%; }
          }
          @keyframes shapeMove4 {
            0% { left: 50%; top: 50%; }
            50% { left: 53%; top: 48%; }
            100% { left: 50%; top: 50%; }
          }
        `}</style>
      </div>
    

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header
          className={`flex items-center justify-between p-4 sm:p-6 lg:p-8 transition-all duration-1000 ${
            formState.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
          } shadow-lg shadow-black/10 bg-gradient-to-b from-neutral-900/80 via-neutral-900/60 to-transparent backdrop-blur-md sticky top-0 z-30`}
        >
          <div className="flex items-center gap-2 sm:gap-3 group cursor-pointer relative">
            {/* Animated Logo */}
            <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-12 group-hover:shadow-lg shadow-black/20 relative overflow-visible">
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
                className="text-black transition-all duration-300 group-hover:scale-110 sm:w-5 sm:h-5"
              >
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
              {/* Subtle animated pulse */}
              <span className="absolute inset-0 rounded-lg bg-white/30 opacity-0 group-hover:opacity-100 animate-pulse pointer-events-none"></span>
              {/* Floating music note */}
              <svg
                className="absolute -top-3 -right-3 w-3 h-3 text-blue-300 opacity-0 group-hover:opacity-100 group-hover:animate-bounce transition-all duration-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            </div>
            <div className="overflow-hidden">
              <h1 className="text-base sm:text-lg font-bold text-white transition-all duration-700 group-hover:translate-x-1 group-hover:text-blue-200 drop-shadow-lg tracking-wide flex items-center gap-1">
                FxSync
              </h1>
              <p className="text-xs text-neutral-400 transition-all duration-700 delay-100 group-hover:translate-x-1 group-hover:text-neutral-200 flex items-center gap-1">
                Synchronized Music Experience
              </p>
            </div>
            {/* Sparkle effect on hover */}
            <span className="absolute -top-2 -left-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <g>
                  <circle cx="12" cy="12" r="2" fill="#fff" fillOpacity="0.7" />
                  <circle cx="18" cy="6" r="1" fill="#60a5fa" fillOpacity="0.7" />
                  <circle cx="6" cy="18" r="1" fill="#38bdf8" fillOpacity="0.7" />
                </g>
              </svg>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <button
              onClick={handleCreateRoom}
              disabled={formState.isCreatingRoom}
              className="px-6 py-3 bg-gradient-to-r from-white via-neutral-50 to-white text-black rounded-xl text-sm font-semibold transition-all duration-500 hover:from-blue-100 hover:via-white hover:to-cyan-100 hover:scale-105 hover:shadow-2xl hover:shadow-blue-200/30 relative overflow-hidden group border border-white/20 hover:border-blue-200/60 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              <span className="relative z-10 flex items-center gap-2 transition-all duration-300 group-hover:translate-x-1">
                {formState.isCreatingRoom ? (
                  <>
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-blue-500 font-semibold">Creating...</span>
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="black"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12 text-blue-500"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M8 12h8"></path>
                      <path d="M12 8v8"></path>
                    </svg>
                    <span className="font-semibold">Create Room</span>
                  </>
                )}
              </span>
              {/* Enhanced background overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-200/20 to-transparent transform -translate-x-full transition-transform duration-700 group-hover:translate-x-full pointer-events-none"></div>
              {/* Glow effect */}
              <div className="absolute inset-0 bg-blue-100/30 rounded-xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              {/* Border glow */}
              <div className="absolute inset-0 rounded-xl border border-blue-200/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              {/* Sparkle on click */}
              <span className="absolute right-3 top-2 opacity-0 group-active:opacity-100 transition-opacity duration-300 pointer-events-none">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <g>
                    <circle cx="12" cy="12" r="2" fill="#60a5fa" fillOpacity="0.7" />
                    <circle cx="18" cy="6" r="1" fill="#38bdf8" fillOpacity="0.7" />
                  </g>
                </svg>
              </span>
            </button>
          </nav>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="w-full max-w-5xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 sm:gap-16 lg:gap-16 items-center">
              
              {/* Left side - Hero content (Enhanced) */}
              <SessionHero isVisible={formState.isVisible} />

              {/* Right side - Form container with smooth height transitions */}
              <SessionFormContainer
                formState={formState}
                formDispatch={formDispatch}
                formRef={formRef}
                inputRef={inputRef}
                measureRef={measureRef}
                cursorRef={cursorRef}
                joinFormRef={joinFormRef}
                createFormRef={createFormRef}
                handleInputChange={handleInputChange}
                handleInputClick={handleInputClick}
                handleInputKeyUp={handleInputKeyUp}
                handleGenerate={handleGenerate}
                handleCreateRoom={handleCreateRoom}
                handleCreateRoomConfirm={handleCreateRoomConfirm}
                handleCreateRoomCancel={handleCreateRoomCancel}
                copyToClipboard={copyToClipboard}
                joinRecentRoom={joinRecentRoom}
                regenerateName={regenerateName}
                isGlowing={isGlowingRef.current}
                showCursor={showCursorRef.current}
                handleJoin={handleJoin} // <-- pass the new handler
              />
            </div>
          </div>
        </main>

        {/* Enhanced Footer */}
        <SessionFooter isVisible={formState.isVisible} />
      </div>
      <canvas
        ref={effectsCanvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 40 }}
        aria-hidden="true"
      />
      {/* Mount SessionPage in background if calibration is running */}
      {/* Removed calibration modal JSX */}
    </div>
  );
} 