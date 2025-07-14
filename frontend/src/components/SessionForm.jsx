import React, { useState, useEffect, useRef } from 'react';
import QRCodeDisplay from './QRCodeDisplay';
import { throttle } from '../utils/throttle';

export default function SessionForm({ onJoin, currentSessionId }) {
  const [sessionId, setSessionId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  const [isGlowing, setIsGlowing] = useState(false);
  const [cursorLeft, setCursorLeft] = useState(16);
  const [clickAnimations, setClickAnimations] = useState([]);
  const [particleEffects, setParticleEffects] = useState([]);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [nameAnimation, setNameAnimation] = useState(false);
  
  // New state for create room transition
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [createRoomSessionId, setCreateRoomSessionId] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState('');
  const [copied, setCopied] = useState(false);
  const [recentRooms, setRecentRooms] = useState([]);
  const [formHeight, setFormHeight] = useState('auto');
  const [isHovering, setIsHovering] = useState(false);
  
  const formRef = useRef(null);
  const heroRef = useRef(null);
  const inputRef = useRef(null);
  const cursorRef = useRef(null);
  const measureRef = useRef(null);
  const joinFormRef = useRef(null);
  const createFormRef = useRef(null);

  const [reducedMotion, setReducedMotion] = useState(false);

  // Load recent rooms from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('fxsync_recent_rooms');
    if (saved) {
      try {
        setRecentRooms(JSON.parse(saved));
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
    
    setDisplayName(generateRandomName());
  }, []);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Animation effects
  useEffect(() => {
    setIsVisible(true);
    
    // Mouse tracking for parallax effect (less frequent for perf)
    const throttledMouseMove = throttle((e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }, 32); // 32ms for better perf

    // Click animation handler (cap to 10)
    const throttledClick = throttle((e) => {
      if (reducedMotion) return;
      const newAnimation = {
        x: e.clientX,
        y: e.clientY,
        id: Date.now()
      };
      setClickAnimations(prev => {
        const arr = [...prev, newAnimation];
        return arr.length > 10 ? arr.slice(arr.length - 10) : arr;
      });
      // Create particle effects on click (cap to 10)
      const particles = Array.from({ length: 8 }, (_, i) => ({
        id: Date.now() + i,
        x: e.clientX,
        y: e.clientY,
        angle: (i * 45) * (Math.PI / 180),
        speed: 2 + Math.random() * 3,
        size: 2 + Math.random() * 4,
        color: [
          'rgba(255, 255, 255, 0.8)',    // White
          'rgba(255, 255, 255, 0.6)',    // White with transparency
          'rgba(156, 163, 175, 0.8)',    // Gray
          'rgba(107, 114, 128, 0.8)',    // Slate gray
          'rgba(75, 85, 99, 0.8)',       // Darker gray
          'rgba(59, 130, 246, 0.6)',     // Blue accent
          'rgba(147, 197, 253, 0.7)',    // Light blue
          'rgba(191, 219, 254, 0.6)'     // Very light blue
        ][i % 8]
      }));
      setParticleEffects(prev => {
        const arr = [...prev, ...particles];
        return arr.length > 10 ? arr.slice(arr.length - 10) : arr;
      });
      // Cleanup handled by rAF below
    }, 32); // 32ms for perf

    // Cursor blink effect
    let cursorInterval;
    if (!reducedMotion) {
      cursorInterval = setInterval(() => {
        setShowCursor(prev => !prev);
      }, 500);
    } else {
      setShowCursor(true);
    }

    // Intersection Observer for scroll animations
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
          }
        });
      },
      { threshold: 0.1 }
    );
    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach(el => observer.observe(el));

    document.addEventListener('mousemove', throttledMouseMove);
    document.addEventListener('click', throttledClick);

    // rAF cleanup for click/particle effects
    let animFrame;
    const cleanupEffects = () => {
      setClickAnimations(prev => prev.filter(anim => Date.now() - anim.id < 800));
      setParticleEffects(prev => prev.filter(particle => Date.now() - particle.id < 800));
      animFrame = requestAnimationFrame(cleanupEffects);
    };
    animFrame = requestAnimationFrame(cleanupEffects);

    // Pause animations when tab is inactive
    const handleVisibility = () => {
      if (document.hidden) {
        setShowCursor(true); // show cursor, stop blinking
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('mousemove', throttledMouseMove);
      document.removeEventListener('click', throttledClick);
      if (cursorInterval) clearInterval(cursorInterval);
      observer.disconnect();
      if (animFrame) cancelAnimationFrame(animFrame);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [reducedMotion]);

  // Enhanced: Update cursor position when sessionId, cursorPosition, focus, or font size changes
  useEffect(() => {
    if (isFocused && inputRef.current) {
      // Recalculate on font size or window resize for better accuracy
      const recalc = () => {
        const newCursorLeft = calculateCursorPosition(sessionId, cursorPosition);
        setCursorLeft(newCursorLeft);
      };

      recalc();

      // Listen for font size or window resize changes for dynamic layouts
      window.addEventListener('resize', recalc);

      // Optionally, observe font size changes (if using rem/em units)
      let fontResizeObserver;
      if (window.ResizeObserver && inputRef.current) {
        fontResizeObserver = new window.ResizeObserver(recalc);
        fontResizeObserver.observe(inputRef.current);
      }

      return () => {
        window.removeEventListener('resize', recalc);
        if (fontResizeObserver && inputRef.current) {
          fontResizeObserver.unobserve(inputRef.current);
        }
      };
    }
  }, [sessionId, cursorPosition, isFocused]);

  // Parallax effect for background
  const parallaxStyle = {
    transform: `translate(${mousePosition.x * 0.01}px, ${mousePosition.y * 0.01}px)`,
  };

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
  const handleInputChange = (e) => {
    const value = e.target.value.toLowerCase();
    setSessionId(value);
    
    // Get cursor position from the input element
    const input = e.target;
    const newPosition = input.selectionStart || value.length;
    setCursorPosition(newPosition);
    
    // Calculate actual cursor position
    const newCursorLeft = calculateCursorPosition(value, newPosition);
    setCursorLeft(newCursorLeft);
    
    // Reset typing state after delay
    setTimeout(() => setIsTyping(false), 1000);
    
    // Trigger glow effect
    if (value.length > 0) {
      setIsGlowing(true);
      setTimeout(() => setIsGlowing(false), 2000);
    }
  };

  // Handle input click to update cursor position
  const handleInputClick = (e) => {
    const input = e.target;
    const newPosition = input.selectionStart || input.value.length;
    setCursorPosition(newPosition);
    
    const newCursorLeft = calculateCursorPosition(input.value, newPosition);
    setCursorLeft(newCursorLeft);
  };

  // Handle input key events to update cursor position
  const handleInputKeyUp = (e) => {
    const input = e.target;
    const newPosition = input.selectionStart || input.value.length;
    setCursorPosition(newPosition);
    
    const newCursorLeft = calculateCursorPosition(input.value, newPosition);
    setCursorLeft(newCursorLeft);
  };

  // Magnetic effect for buttons
  const handleMouseMove = (e, element) => {
    const rect = element.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    element.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px)`;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/session/generate-session-id`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }

      const data = await res.json();

      if (!data.sessionId) {
        setError('No session ID returned from server');
        setSessionId('');
      } else {
        setSessionId(data.sessionId);
        // Optionally: add a subtle animation or feedback here
        setIsGlowing(true);
        setTimeout(() => setIsGlowing(false), 1500);
      }
    } catch (e) {
      setError(
        e?.message
          ? `Failed to generate session ID: ${e.message}`
          : 'Failed to generate session ID'
      );
      setSessionId('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateRoom = async () => {
    setIsCreatingRoom(true);
    setCreateRoomError('');
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/session/generate-session-id`);
      const data = await res.json();
      setCreateRoomSessionId(data.sessionId || '');
      setShowCreateRoom(true);
    } catch (e) {
      setCreateRoomError('Failed to create new room');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleCreateRoomConfirm = () => {
    onJoin(createRoomSessionId, displayName);
  };

  const handleCreateRoomCancel = () => {
    setShowCreateRoom(false);
    setCreateRoomSessionId('');
    setCreateRoomError('');
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const addToRecentRooms = (roomId) => {
    const updated = [roomId, ...recentRooms.filter(id => id !== roomId)].slice(0, 5);
    setRecentRooms(updated);
    localStorage.setItem('fxsync_recent_rooms', JSON.stringify(updated));
  };

  const joinRecentRoom = (roomId) => {
    setSessionId(roomId);
    onJoin(roomId, displayName);
    addToRecentRooms(roomId);
  };

  // Enhanced: Calculate and set form height for smooth transitions, with animation and edge case handling
  const updateFormHeight = () => {
    // Helper to get the max height of the visible form
    const getTargetHeight = () => {
      if (showCreateRoom && createFormRef.current) {
        return createFormRef.current.scrollHeight;
      } else if (!showCreateRoom && joinFormRef.current) {
        return joinFormRef.current.scrollHeight;
      }
      return 0;
    };

    // Animate height change for extra smoothness
    if (formRef.current) {
      const prevHeight = formRef.current.offsetHeight;
      const targetHeight = getTargetHeight();
      // Only animate if height actually changes
      if (prevHeight !== targetHeight + 48) {
        // Set explicit height for animation
        formRef.current.style.height = `${prevHeight}px`;
        // Force reflow for transition
        void formRef.current.offsetWidth;
        // Animate to new height
        formRef.current.style.transition = 'height 0.4s cubic-bezier(0.4,0,0.2,1)';
        formRef.current.style.height = `${targetHeight + 48}px`;
        // After animation, remove explicit height so content can grow naturally
        setTimeout(() => {
          if (formRef.current) {
            formRef.current.style.height = '';
            formRef.current.style.transition = '';
          }
          setFormHeight(`${targetHeight + 48}px`);
        }, 400);
      } else {
        setFormHeight(`${targetHeight + 48}px`);
      }
    } else {
      // Fallback: just set height
      setFormHeight(`${getTargetHeight() + 48}px`);
    }
  };

  // Enhanced: Update form height responsively and smoothly when switching between forms or when relevant data changes
  useEffect(() => {
    // Use requestAnimationFrame for smoother UI updates
    let rafId;
    const scheduleUpdate = () => {
      rafId = requestAnimationFrame(() => {
        updateFormHeight();
      });
    };

    // Use a short timeout to allow DOM to settle, then schedule the update
    const timer = setTimeout(scheduleUpdate, 30);

    // Also listen for font size changes (for accessibility/zoom)
    let resizeObserver;
    if (formRef.current && window.ResizeObserver) {
      resizeObserver = new window.ResizeObserver(() => {
        updateFormHeight();
      });
      resizeObserver.observe(formRef.current);
    }

    return () => {
      clearTimeout(timer);
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeObserver && formRef.current) {
        resizeObserver.unobserve(formRef.current);
      }
    };
  }, [showCreateRoom, createRoomSessionId, recentRooms.length]);

  // Enhanced: Update form height on window resize and orientation change, with debouncing for performance
  useEffect(() => {
    let resizeTimeout;
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      // Debounce to avoid excessive updates during rapid resizes
      resizeTimeout = setTimeout(() => {
        updateFormHeight();
      }, 60);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, []);

  // Enhanced: Set initial form height and update if font size or content changes after mount
  useEffect(() => {
    let animationFrame;
    const setInitialHeight = () => {
      if (joinFormRef.current) {
        const height = joinFormRef.current.scrollHeight;
        setFormHeight(`${height + 48}px`);
      }
    };
    // Use requestAnimationFrame for smoother initial update
    animationFrame = requestAnimationFrame(setInitialHeight);

    // Also update after a short delay in case of late content rendering
    const timer = setTimeout(setInitialHeight, 120);

    // Optionally, observe font size/content changes for accessibility/zoom
    let resizeObserver;
    if (window.ResizeObserver && joinFormRef.current) {
      resizeObserver = new window.ResizeObserver(setInitialHeight);
      resizeObserver.observe(joinFormRef.current);
    }

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      clearTimeout(timer);
      if (resizeObserver && joinFormRef.current) {
        resizeObserver.unobserve(joinFormRef.current);
      }
    };
  }, []);

  const handleJoin = async (e) => {
    e.preventDefault();

    // Enhanced: Validate sessionId (alphanumeric, length, etc.)
    const trimmedSessionId = sessionId.trim();
    if (!trimmedSessionId) {
      setError('Please enter a room code');
      return;
    }
    if (!/^[a-zA-Z0-9\-]{4,32}$/.test(trimmedSessionId)) {
      setError('Room code must be 4-32 characters (letters, numbers, or dashes)');
      return;
    }
    if (!displayName.trim()) {
      setError('Please enter a display name');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Enhanced: Add a short delay for UX feedback (e.g., spinner visible)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Enhanced: Prevent duplicate recent rooms
      addToRecentRooms(trimmedSessionId);

      // Enhanced: Await onJoin if it returns a promise (for async support)
      const result = await onJoin(trimmedSessionId, displayName);

      // Optionally, handle result (e.g., error from onJoin)
      if (result && result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to join room. Please try again.');
      // Optionally, log error for debugging
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('Join error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const regenerateName = () => {
    setIsRegenerating(true);
    setNameAnimation(true);
    
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
    } while (newName === displayName && adjectives.length > 1 && nouns.length > 1);
    
    setDisplayName(newName);
    
    // Reset states after a short delay
    setTimeout(() => {
      setIsRegenerating(false);
      setTimeout(() => setNameAnimation(false), 300);
    }, 200);
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
                      {copied ? (
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
    <div className="min-h-screen bg-black relative overflow-hidden">
      <style>{`
        .form-container {
          transition: min-height 0.7s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .form-transition {
          transition: all 0.7s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
      {/* Dynamic & Moving Animated Background */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={parallaxStyle}
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
      

      {/* Interactive cursor trail with click animations */}
      <div 
        className="fixed w-4 h-4 bg-white/20 rounded-full pointer-events-none z-50 transition-transform duration-100 ease-out"
        style={{
          left: mousePosition.x - 8,
          top: mousePosition.y - 8,
          transform: `scale(${isHovering ? 2 : 1})`,
          willChange: 'transform, opacity',
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      />
      
      {/* Click animation circles */}
      {clickAnimations.map((animation, index) => (
        <div
          key={index}
          className="fixed w-4 h-4 border-2 border-white/40 rounded-full pointer-events-none z-50 animate-ping"
          style={{
            left: animation.x - 8,
            top: animation.y - 8,
            animationDelay: `${index * 50}ms`,
            animationDuration: '600ms',
            willChange: 'transform, opacity',
          }}
        />
      ))}

      {/* Particle effects */}
      {particleEffects.map((particle) => (
        <div
          key={particle.id}
          className="fixed w-1 h-1 rounded-full pointer-events-none z-40 animate-ping"
          style={{
            left: particle.x,
            top: particle.y,
            backgroundColor: particle.color,
            transform: `translate(${Math.cos(particle.angle) * particle.speed * 100}px, ${Math.sin(particle.angle) * particle.speed * 100}px)`,
            animationDuration: '800ms',
            width: particle.size,
            height: particle.size,
            willChange: 'transform, opacity',
          }}
        />
      ))}

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header
          className={`flex items-center justify-between p-4 sm:p-6 lg:p-8 transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
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
              disabled={isCreatingRoom}
              className="px-6 py-3 bg-gradient-to-r from-white via-neutral-50 to-white text-black rounded-xl text-sm font-semibold transition-all duration-500 hover:from-blue-100 hover:via-white hover:to-cyan-100 hover:scale-105 hover:shadow-2xl hover:shadow-blue-200/30 relative overflow-hidden group border border-white/20 hover:border-blue-200/60 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              <span className="relative z-10 flex items-center gap-2 transition-all duration-300 group-hover:translate-x-1">
                {isCreatingRoom ? (
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
              <div
                ref={heroRef}
                className="text-center lg:text-left space-y-8 sm:space-y-10 order-1 lg:order-1 mb-8 sm:mb-0 relative"
              >
                {/* Animated floating background shapes */}
                <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 opacity-40 blur-2xl z-0 animate-float-slow">
                  <svg viewBox="0 0 200 200" fill="none">
                    <ellipse cx="100" cy="100" rx="90" ry="60" fill="#60a5fa" fillOpacity="0.25" />
                  </svg>
                </div>
                <div className="pointer-events-none absolute -bottom-12 -right-12 w-32 h-32 opacity-30 blur-2xl z-0 animate-float-slower">
                  <svg viewBox="0 0 200 200" fill="none">
                    <ellipse cx="100" cy="100" rx="80" ry="50" fill="#f472b6" fillOpacity="0.18" />
                  </svg>
                </div>
                <div className="space-y-4 sm:space-y-6 relative z-10">
                  <h1
                    className={`text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-extrabold leading-tight text-white transition-all duration-1000 delay-300 drop-shadow-lg ${
                      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                  >
                    <span className="inline-block transition-all duration-700 delay-500 hover:scale-110 hover:text-blue-200 cursor-pointer group relative overflow-visible">
                      <span className="relative z-10 bg-gradient-to-r from-white via-blue-100 to-neutral-200 bg-clip-text text-transparent group-hover:from-blue-200 group-hover:to-white transition-all duration-500">
                        Sync Your
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/20 to-transparent transform -skew-x-12 transition-transform duration-700 group-hover:translate-x-full"></div>
                      {/* Animated music note */}
                      <svg
                        className="absolute -top-4 -right-8 w-8 h-8 text-blue-300 opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:animate-bounce"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                      </svg>
                      {/* Sparkle effect */}
                      <svg
                        className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-yellow-200 opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-twinkle"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <polygon points="10,2 12,8 18,8 13,12 15,18 10,14 5,18 7,12 2,8 8,8" />
                      </svg>
                    </span>
                    <br />
                    <span className="text-neutral-300 inline-block transition-all duration-700 delay-700 hover:scale-110 hover:text-pink-200 cursor-pointer group relative overflow-visible">
                      <span className="relative z-10 bg-gradient-to-r from-neutral-300 via-pink-200 to-white bg-clip-text text-transparent group-hover:from-white group-hover:to-pink-200 transition-all duration-500">
                        Music
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-pink-400/30 to-transparent transform -skew-x-12 transition-transform duration-700 group-hover:translate-x-full"></div>
                      <div className="absolute -inset-1 bg-gradient-to-r from-pink-400/20 via-neutral-500/30 to-blue-400/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      {/* Animated sound waves */}
                      <div className="absolute -bottom-2 left-0 flex items-end gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-500">
                        {[1, 2, 3, 2, 1].map((height, i) => (
                          <div
                            key={i}
                            className={`w-0.5 bg-gradient-to-t from-pink-300 to-white rounded-full animate-pulse`}
                            style={{
                              height: `${height * 6}px`,
                              animationDelay: `${i * 120}ms`,
                              animationDuration: '1.2s',
                            }}
                          ></div>
                        ))}
                      </div>
                      {/* Floating musical notes */}
                      <svg
                        className="absolute -top-4 -left-4 w-5 h-5 text-pink-300 opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                      </svg>
                      <svg
                        className="absolute -bottom-3 -right-3 w-4 h-4 text-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-700 delay-200 group-hover:animate-ping"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                      </svg>
                    </span>
                  </h1>
                  <p
                    className={`text-base sm:text-lg lg:text-xl text-neutral-300 max-w-lg mx-auto lg:mx-0 leading-relaxed transition-all duration-1000 delay-900 drop-shadow ${
                      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                  >
                    Create <span className="font-semibold text-white">synchronized listening rooms</span> where everyone experiences music together.
                    <span className="inline-block ml-2 transition-all duration-300 hover:rotate-12 animate-wiggle">🎧</span>
                  </p>
                </div>

                {/* Enhanced Feature highlights with white SVGs and subtle hover pop */}
                <div
                  className={`flex flex-wrap gap-4 sm:gap-6 max-w-md mx-auto lg:mx-0 justify-center lg:justify-start transition-all duration-1000 delay-1100 ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                  }`}
                >
                  {[
                    {
                      text: 'Real-time sync',
                      icon: (
                        <svg className="w-5 h-5 text-white group-hover:text-blue-200 transition-colors duration-300 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M21 12a9 9 0 1 1-3.5-7" />
                          <polyline points="21 3 21 8 16 8" />
                        </svg>
                      ),
                      delay: 0,
                      tooltip: "Everyone hears the same thing at the same time",
                      accent: "from-blue-400/30 to-blue-200/10"
                    },
                    {
                      text: 'Group chat',
                      icon: (
                        <svg className="w-5 h-5 text-white group-hover:text-green-200 transition-colors duration-300 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
                        </svg>
                      ),
                      delay: 100,
                      tooltip: "Chat live with everyone in the room",
                      accent: "from-green-400/30 to-green-200/10"
                    },
                    {
                      text: 'Playlist sharing',
                      icon: (
                        <svg className="w-5 h-5 text-white group-hover:text-pink-200 transition-colors duration-300 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M9 9h6v6H9z" />
                        </svg>
                      ),
                      delay: 200,
                      tooltip: "Collaborate on the perfect queue",
                      accent: "from-pink-400/30 to-pink-200/10"
                    },
                    {
                      text: 'No account needed',
                      icon: (
                        <svg className="w-5 h-5 text-white group-hover:text-yellow-200 transition-colors duration-300 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M15 9l-6 6M9 9l6 6" />
                        </svg>
                      ),
                      delay: 300,
                      tooltip: "Jump in instantly, no sign up",
                      accent: "from-yellow-400/30 to-yellow-200/10"
                    }
                  ].map((feature, index) => (
                    <div
                      key={feature.text}
                      className={`relative flex items-center gap-2 text-xs sm:text-sm text-neutral-400 group cursor-pointer transition-all duration-300 hover:text-white hover:scale-105`}
                      style={{ transitionDelay: `${feature.delay}ms` }}
                      tabIndex={0}
                      aria-label={feature.text}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br ${feature.accent} transition-all duration-300 shadow-md`}>
                        {feature.icon}
                      </div>
                      <span className="transition-all duration-300 group-hover:translate-x-1 font-semibold">{feature.text}</span>
                      {/* Tooltip on hover/focus */}
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 opacity-0 group-hover:opacity-100 group-focus:opacity-100 pointer-events-none transition-opacity duration-300">
                        <span className="px-2 py-1 rounded bg-neutral-900/90 text-xs text-neutral-200 shadow-lg border border-neutral-700 whitespace-nowrap">
                          {feature.tooltip}
                        </span>
                      </div>
                      {/* Accent sparkle */}
                      <svg
                        className="absolute -top-2 -right-2 w-3 h-3 text-white opacity-0 group-hover:opacity-80 transition-all duration-500 group-hover:animate-twinkle"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <polygon points="10,2 12,8 18,8 13,12 15,18 10,14 5,18 7,12 2,8 8,8" />
                      </svg>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right side - Form container with smooth height transitions */}
              <div ref={formRef} className="relative z-20 order-2 lg:order-2">
                <div 
                  className={`relative form-container overflow-hidden ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}`}
                  style={{ 
                    minHeight: formHeight,
                    transitionDelay: isVisible ? '0.5s' : '0s'
                  }}
                >
                  {/* Blended background for the form */}
                  <div className="absolute inset-0 pointer-events-none z-0">
                    {/* Subtle gradient overlay for blending */}
                    <div className="absolute inset-0 bg-gradient-to-br from-neutral-900/40 via-neutral-800/30 to-neutral-900/40" style={{mixBlendMode: 'lighten'}} />
                    {/* Extra noise overlay for texture */}
                    <div className="absolute inset-0" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'2\' cy=\'2\' r=\'1.5\' fill=\'%23fff\' fill-opacity=\'0.02\'/%3E%3C/svg%3E")', opacity: 0.3, zIndex: 1, pointerEvents: 'none'}} />
                  </div>
                  <div 
                    className="relative z-10 bg-neutral-900/30 backdrop-blur-2xl rounded-2xl border border-neutral-700/20 p-6 sm:p-8 shadow-xl"
                  >
                    {/* Join Form */}
                    <div 
                      ref={joinFormRef}
                      className={`form-transition ${showCreateRoom ? 'opacity-0 scale-95 absolute inset-0 pointer-events-none overflow-hidden' : 'opacity-100 scale-100'}`}
                    >
                      <div className="text-center mb-6 sm:mb-8">
                        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 transition-all duration-500 hover:scale-105">Join a Room</h2>
                        <p className="text-sm sm:text-base text-neutral-400 transition-all duration-500 delay-100">Enter a room code to start listening together</p>
                      </div>

                      <form onSubmit={handleJoin} className="space-y-4 sm:space-y-6">
                        {/* Display Name Field */}
                        <div className="flex items-center justify-between p-4 bg-neutral-800/40 rounded-xl border border-neutral-600/50 transition-all duration-300 hover:bg-neutral-800/60 hover:border-neutral-500/70 group hover:scale-[1.02] hover:shadow-lg">
                          <div className="text-xs sm:text-sm text-neutral-400 transition-all duration-300 group-hover:text-neutral-300 font-medium">You'll join as</div>
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <span className={`text-white font-semibold text-sm sm:text-base transition-all duration-300 group-hover:scale-105 ${nameAnimation ? 'animate-pulse' : ''} ${isRegenerating ? 'text-neutral-400' : 'bg-gradient-to-r from-white to-neutral-200 bg-clip-text text-transparent'}`}>
                                {displayName}
                              </span>
                              {/* Animated underline */}
                              <div className={`absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent transition-all duration-500 ${nameAnimation ? 'w-full opacity-100' : 'w-0 opacity-0 group-hover:w-full group-hover:opacity-100'}`}></div>
                            </div>
                            <button
                              type="button"
                              onClick={regenerateName}
                              disabled={isRegenerating}
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
                        </div>

                        {/* Room Code Input */}
                        <div className="space-y-2 sm:space-y-3">
                          <label className="block text-sm font-medium text-neutral-300 transition-all duration-300 hover:text-white">Room Code</label>
                          <div className="relative group">
                            <div className="relative">
                              <input
                                ref={inputRef}
                                type="text"
                                value={sessionId}
                                onChange={handleInputChange}
                                onClick={handleInputClick}
                                onKeyUp={handleInputKeyUp}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
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
                                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                                }}
                              />
                              {/* Animated cursor */}
                              {isFocused && (
                                <div 
                                  ref={cursorRef}
                                  className={`absolute top-1/2 transform -translate-y-1/2 w-0.5 h-6 bg-white transition-all duration-200 ${
                                    showCursor ? 'opacity-100' : 'opacity-0'
                                  }`}
                                  style={{
                                    left: `${cursorLeft}px`,
                                  }}
                                />
                              )}
                            </div>
                            <div className={`absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-500 pointer-events-none ${isFocused ? 'opacity-100' : 'group-hover:opacity-50'}`}></div>
                            {error && (
                              <p className="text-red-400 text-sm mt-2 text-center animate-shake">{error}</p>
                            )}
                          </div>
                          
                          {/* Generate Room Code Button */}
                          <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="w-full px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700/70 text-white text-sm rounded-lg border border-neutral-600/50 hover:border-neutral-500/70 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            {isGenerating ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Generating...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:rotate-180">
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

                        {/* Recent Rooms */}
                        {recentRooms.length > 0 && (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-neutral-400">Recent Rooms</label>
                            <div className="flex flex-wrap gap-2">
                              {recentRooms.map((roomId, index) => (
                                <button
                                  key={index}
                                  onClick={() => joinRecentRoom(roomId)}
                                  className="px-3 py-1.5 bg-neutral-800/50 hover:bg-neutral-700/70 text-white text-xs font-mono rounded-lg border border-neutral-600/50 hover:border-neutral-500/70 transition-all duration-300 hover:scale-105 hover:shadow-lg group"
                                >
                                  <span className="transition-all duration-300 group-hover:translate-x-0.5">{roomId}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Join button */}
                        <button
                          type="submit"
                          disabled={loading || !sessionId.trim()}
                          className="w-full px-4 py-3 bg-white text-black rounded-lg font-bold text-sm sm:text-base transition-all duration-500 flex items-center justify-center gap-3 hover:bg-neutral-100 hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:scale-100 disabled:hover:shadow-none relative overflow-hidden group"
                        >
                          <span className="relative z-10 flex items-center gap-3 transition-all duration-300 group-hover:translate-x-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1 sm:w-5 sm:h-5">
                              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                              <polyline points="10 17 15 12 10 7"></polyline>
                              <line x1="15" x2="3" y1="12" y2="12"></line>
                            </svg>
                            {loading ? (
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
                          disabled={isCreatingRoom}
                          className="w-full px-4 py-3 bg-white hover:bg-neutral-100 text-black rounded-lg font-bold text-sm sm:text-base transition-all duration-500 flex items-center justify-center gap-3 border border-white/20 hover:border-white/40 hover:scale-[1.02] hover:shadow-xl group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:scale-100 disabled:hover:shadow-none"
                        >
                          <span className="relative z-10 flex items-center gap-3 transition-all duration-300 group-hover:translate-x-1">
                            {isCreatingRoom ? (
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
                      className={`form-transition ${showCreateRoom ? 'opacity-100 scale-100' : 'opacity-0 scale-95 absolute inset-0 pointer-events-none overflow-hidden'}`}
                    >
                      <div className="text-center mb-6 sm:mb-8">
                        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 transition-all duration-500 hover:scale-105">Create a New Room</h2>
                        <p className="text-sm sm:text-base text-neutral-400 transition-all duration-500 delay-100">Share this code with friends to join your room</p>
                      </div>

                      {/* Room code display */}
                      <div className="w-full p-4 sm:p-6 bg-gradient-to-r from-neutral-800/80 via-neutral-700/60 to-neutral-800/80 rounded-xl border border-neutral-600/30 mb-6 shadow-inner">
                        <div className="text-center">
                          <div className="text-neutral-400 text-xs mb-2 font-medium uppercase tracking-wider">Room Code</div>
                          <div className="text-white font-mono text-xl sm:text-2xl font-bold tracking-wider mb-3 bg-gradient-to-r from-neutral-200 to-neutral-400 bg-clip-text text-transparent break-all">{createRoomSessionId}</div>
                          <div className="text-xs text-neutral-500 break-all bg-neutral-900/50 p-2 rounded-lg border border-neutral-700/30 mb-4">
                            Share: {window.location.origin}/?session={createRoomSessionId}
                          </div>
                          {/* QR Code and Copy section */}
                          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
                            <div className="flex flex-col items-center">
                              <QRCodeDisplay value={`${window.location.origin}/?session=${createRoomSessionId}`} size={100} />
                              <p className="text-xs text-neutral-500 mt-2 text-center">Scan to join on mobile</p>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-px h-16 bg-neutral-600/50 hidden sm:block"></div>
                              <span className="text-xs text-neutral-500 font-medium">OR</span>
                              <div className="w-px h-16 bg-neutral-600/50 hidden sm:block"></div>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                              <button
                                onClick={() => copyToClipboard(`${window.location.origin}/?session=${createRoomSessionId}`)}
                                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs rounded-lg border border-neutral-600 hover:border-neutral-500 transition-all duration-300 hover:scale-105 group/btn flex items-center gap-2 font-medium"
                              >
                                {copied ? (
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
                      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-neutral-800/40 via-neutral-700/30 to-neutral-800/40 rounded-xl border border-neutral-600/50 transition-all duration-300 hover:bg-neutral-800/60 hover:border-neutral-500/70 group hover:scale-[1.02] hover:shadow-lg mb-6">
                        <div className="text-xs sm:text-sm text-neutral-400 transition-all duration-300 group-hover:text-neutral-300 font-medium">You'll join as</div>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <span className={`text-white font-semibold text-sm sm:text-base transition-all duration-300 group-hover:scale-105 ${nameAnimation ? 'animate-pulse' : ''} ${isRegenerating ? 'text-neutral-400' : 'bg-gradient-to-r from-white to-neutral-200 bg-clip-text text-transparent'}`}>
                              {displayName}
                            </span>
                            {/* Animated underline */}
                            <div className={`absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent transition-all duration-500 ${nameAnimation ? 'w-full opacity-100' : 'w-0 opacity-0 group-hover:w-full group-hover:opacity-100'}`}></div>
                          </div>
                          <button
                            type="button"
                            onClick={regenerateName}
                            disabled={isRegenerating}
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
                          className="w-full px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-bold text-sm sm:text-base transition-all duration-500 flex items-center justify-center gap-3 border border-neutral-700 hover:border-neutral-600 hover:scale-[1.02] hover:shadow-xl group relative overflow-hidden"
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
                      {createRoomError && (
                        <div className="mt-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm text-center animate-shake">
                          {createRoomError}
                        </div>
                      )}
                    </div> {/* Close inner form container */}
                  </div> {/* Close blended background container */}
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Enhanced Footer */}
        <footer className={`relative p-4 sm:p-6 lg:p-8 text-center transition-all duration-1000 delay-1300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex flex-col items-center gap-2">
            <p className="text-neutral-400 text-xs sm:text-sm transition-all duration-300 hover:text-neutral-200 font-medium flex items-center justify-center gap-2">
              <span>
                <svg className="inline-block mr-1 mb-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"></path>
                  <circle cx="6" cy="18" r="3"></circle>
                  <circle cx="18" cy="16" r="3"></circle>
                </svg>
                Experience music together with <span className="font-bold text-white hover:text-blue-300 transition-colors">FxSync</span>
              </span>
            </p>
            <div className="flex items-center justify-center gap-4 mt-1">
              <a
                href="https://github.com/Anurag-amrev-7557"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-500 hover:text-white transition-colors"
                aria-label="GitHub"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.1-1.46-1.1-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85.004 1.71.12 2.51.35 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85 0 1.33-.01 2.4-.01 2.73 0 .27.16.58.67.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z"/>
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/in/anurag-verma-18645b280/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-500 hover:text-white transition-colors"
                aria-label="LinkedIn"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M16 8a6 6 0 0 1 6 6v5h-4v-5a2 2 0 0 0-4 0v5h-4v-5a6 6 0 0 1 6-6z"/>
                  <rect width="4" height="12" x="2" y="9" rx="2"/>
                  <circle cx="4" cy="4" r="2"/>
                </svg>
              </a>
              <a
                href="mailto:anuragverma08002@gmail.com"
                className="text-neutral-500 hover:text-white transition-colors"
                aria-label="Email"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <rect width="20" height="16" x="2" y="4" rx="2"/>
                  <path d="m22 6-8.97 6.48a2 2 0 0 1-2.06 0L2 6"/>
                </svg>
              </a>
            </div>
            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-500">
              <span>Made by <a href="https://github.com/Anurag-amrev-7557" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-300">Anurag Verma</a></span>
              <span className="mx-1">·</span>
              <span>
                <a href="https://github.com/Anurag-amrev-7557/fxsync" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-blue-300">Source</a>
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
} 