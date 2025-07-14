import React, { useState, useEffect, useRef } from 'react';
import CreateRoom from './CreateRoom';
import { Link } from 'react-router-dom';

// Add QR code component
const QRCode = ({ value, size = 128 }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    if (value) {
      // Generate QR code using a free API
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
      setQrCodeUrl(qrUrl);
    }
  }, [value, size]);

  if (!qrCodeUrl) return null;

  return (
    <img 
      src={qrCodeUrl} 
      alt="QR Code" 
      className="rounded-lg border border-neutral-600/30 shadow-lg"
      style={{ width: size, height: size }}
    />
  );
};

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

  // Animation effects
  useEffect(() => {
    setIsVisible(true);
    
    // Mouse tracking for parallax effect
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    // Click animation handler
    const handleClick = (e) => {
      const newAnimation = {
        x: e.clientX,
        y: e.clientY,
        id: Date.now()
      };
      
      setClickAnimations(prev => [...prev, newAnimation]);
      
      // Create particle effects on click
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
      
      setParticleEffects(prev => [...prev, ...particles]);
      
      // Remove animations after completion
      setTimeout(() => {
        setClickAnimations(prev => prev.filter(anim => anim.id !== newAnimation.id));
        setParticleEffects(prev => prev.filter(particle => !particles.find(p => p.id === particle.id)));
      }, 800);
    };

    // Cursor blink effect
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);

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

    // Observe elements for animation
    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach(el => observer.observe(el));

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleClick);
      clearInterval(cursorInterval);
      observer.disconnect();
    };
  }, []);

  // Update cursor position when sessionId changes
  useEffect(() => {
    if (isFocused && inputRef.current) {
      const newCursorLeft = calculateCursorPosition(sessionId, cursorPosition);
      setCursorLeft(newCursorLeft);
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
      const res = await fetch(`${backendUrl}/session/generate-session-id`);
      const data = await res.json();
      setSessionId(data.sessionId || '');
    } catch (e) {
      setError('Failed to generate session ID');
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

  // Calculate and set form height for smooth transitions
  const updateFormHeight = () => {
    if (showCreateRoom && createFormRef.current) {
      const height = createFormRef.current.scrollHeight;
      setFormHeight(`${height + 48}px`); // Add extra padding for safety
    } else if (!showCreateRoom && joinFormRef.current) {
      const height = joinFormRef.current.scrollHeight;
      setFormHeight(`${height + 48}px`); // Add extra padding for safety
    }
  };

  // Update form height when switching between forms
  useEffect(() => {
    const timer = setTimeout(updateFormHeight, 50);
    return () => clearTimeout(timer);
  }, [showCreateRoom, createRoomSessionId, recentRooms.length]);

  // Update form height on window resize
  useEffect(() => {
    const handleResize = () => {
      updateFormHeight();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Set initial form height
  useEffect(() => {
    const timer = setTimeout(() => {
      if (joinFormRef.current) {
        const height = joinFormRef.current.scrollHeight;
        setFormHeight(`${height + 48}px`);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!sessionId.trim()) {
      setError('Please enter a room code');
      return;
    }
    setError('');
    setLoading(true);
    addToRecentRooms(sessionId.trim());
    onJoin(sessionId.trim(), displayName);
    setLoading(false);
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
                    <QRCode value={`${window.location.origin}/?session=${currentSessionId}`} size={100} />
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
      {/* Animated background pattern */}
      <div 
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100px_100px] transition-transform duration-1000 ease-out"
        style={parallaxStyle}
      ></div>
      

      {/* Interactive cursor trail with click animations */}
      <div 
        className="fixed w-4 h-4 bg-white/20 rounded-full pointer-events-none z-50 transition-transform duration-100 ease-out"
        style={{
          left: mousePosition.x - 8,
          top: mousePosition.y - 8,
          transform: `scale(${isHovering ? 2 : 1})`,
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
          }}
        />
      ))}

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className={`flex items-center justify-between p-4 sm:p-6 lg:p-8 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex items-center gap-2 sm:gap-3 group cursor-pointer">
            <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-12 group-hover:shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black transition-all duration-300 group-hover:scale-110 sm:w-5 sm:h-5">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            </div>
            <div className="overflow-hidden">
              <h1 className="text-base sm:text-lg font-bold text-white transition-all duration-700 group-hover:translate-x-1 group-hover:text-neutral-200">FxSync</h1>
              <p className="text-xs text-neutral-400 transition-all duration-700 delay-100 group-hover:translate-x-1 group-hover:text-neutral-300">Synchronized Music Experience</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-6">
            <button 
              onClick={handleCreateRoom}
              disabled={isCreatingRoom}
              className="px-6 py-3 bg-gradient-to-r from-white via-neutral-50 to-white text-black rounded-xl text-sm font-semibold transition-all duration-500 hover:from-neutral-100 hover:via-white hover:to-neutral-100 hover:scale-105 hover:shadow-2xl hover:shadow-white/20 relative overflow-hidden group border border-white/20 hover:border-white/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              <span className="relative z-10 flex items-center gap-2 transition-all duration-300 group-hover:translate-x-1">
                {isCreatingRoom ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M8 12h8"></path>
                      <path d="M12 8v8"></path>
                    </svg>
                    Create Room
                  </>
                )}
              </span>
              {/* Enhanced background overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent transform -translate-x-full transition-transform duration-700 group-hover:translate-x-full"></div>
              {/* Glow effect */}
              <div className="absolute inset-0 bg-white/5 rounded-xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              {/* Border glow */}
              <div className="absolute inset-0 rounded-xl border border-white/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </button>
          </nav>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="w-full max-w-5xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 sm:gap-16 lg:gap-16 items-center">
              
              {/* Left side - Hero content */}
              <div ref={heroRef} className="text-center lg:text-left space-y-6 sm:space-y-8 order-1 lg:order-1 mb-8 sm:mb-0">
                <div className="space-y-4 sm:space-y-6">
                  <h1 className={`text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold leading-tight text-white transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <span className="inline-block transition-all duration-700 delay-500 hover:scale-105 hover:text-neutral-200 cursor-pointer group relative overflow-hidden">
                      <span className="relative z-10 bg-gradient-to-r from-white to-neutral-200 bg-clip-text text-transparent group-hover:from-neutral-200 group-hover:to-white transition-all duration-500">Sync Your</span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neutral-600/30 to-transparent transform -skew-x-12 transition-transform duration-700 group-hover:translate-x-full"></div>
                      {/* Animated music note */}
                      <svg className="absolute -top-2 -right-4 w-6 h-6 text-neutral-400 opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                      </svg>
                    </span>
                    <br />
                    <span className="text-neutral-300 inline-block transition-all duration-700 delay-700 hover:scale-105 hover:text-white cursor-pointer group relative overflow-hidden">
                      <span className="relative z-10 bg-gradient-to-r from-neutral-300 to-white bg-clip-text text-transparent group-hover:from-white group-hover:to-neutral-200 transition-all duration-500">Music</span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neutral-500/40 to-transparent transform -skew-x-12 transition-transform duration-700 group-hover:translate-x-full"></div>
                      <div className="absolute -inset-1 bg-gradient-to-r from-neutral-600/30 via-neutral-500/30 to-neutral-700/30 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      {/* Animated sound waves */}
                      <div className="absolute -bottom-1 left-0 flex items-end gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-500">
                        {[1, 2, 3, 2, 1].map((height, i) => (
                          <div 
                            key={i}
                            className="w-0.5 bg-gradient-to-t from-neutral-400 to-white rounded-full animate-pulse"
                            style={{ 
                              height: `${height * 4}px`,
                              animationDelay: `${i * 100}ms`,
                              animationDuration: '1s'
                            }}
                          ></div>
                        ))}
                      </div>
                      {/* Floating musical notes */}
                      <svg className="absolute -top-3 -left-2 w-4 h-4 text-neutral-500 opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                      </svg>
                      <svg className="absolute -bottom-2 -right-2 w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100 transition-all duration-700 delay-200 group-hover:animate-ping" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                      </svg>
                    </span>
                  </h1>
                  <p className={`text-base sm:text-lg lg:text-xl text-neutral-400 max-w-lg mx-auto lg:mx-0 leading-relaxed transition-all duration-1000 delay-900 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    Create synchronized listening rooms where everyone experiences music together.
                    <span className="inline-block ml-2 transition-all duration-300 hover:rotate-12">🎧</span>
                  </p>
                </div>

                {/* Feature highlights */}
                <div className={`flex flex-wrap gap-4 sm:gap-6 max-w-md mx-auto lg:mx-0 justify-center lg:justify-start transition-all duration-1000 delay-1100 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  {[
                    { text: 'Real-time sync', delay: 0 },
                    { text: 'Group chat', delay: 100 },
                    { text: 'Playlist sharing', delay: 200 }
                  ].map((feature, index) => (
                    <div 
                      key={feature.text}
                      className="flex items-center gap-2 text-xs sm:text-sm text-neutral-400 group cursor-pointer transition-all duration-300 hover:text-white"
                      style={{ transitionDelay: `${feature.delay}ms` }}
                    >
                      <div className="w-1.5 h-1.5 bg-white rounded-full transition-all duration-300 group-hover:scale-150 group-hover:bg-white"></div>
                      <span className="transition-all duration-300 group-hover:translate-x-1">{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right side - Form container with smooth height transitions */}
              <div ref={formRef} className="relative z-20 order-2 lg:order-2">
                <div 
                  className={`bg-neutral-900/50 backdrop-blur-sm rounded-2xl border border-neutral-800 p-6 sm:p-8 form-container overflow-hidden ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}`}
                  style={{ 
                    minHeight: formHeight,
                    transitionDelay: isVisible ? '0.5s' : '0s'
                  }}
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
                      {/* Room code input */}
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

                      {/* Display name */}
                      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-neutral-800/40 via-neutral-700/30 to-neutral-800/40 rounded-xl border border-neutral-600/50 transition-all duration-300 hover:bg-neutral-800/60 hover:border-neutral-500/70 group hover:scale-[1.02] hover:shadow-lg">
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
                            <QRCode value={`${window.location.origin}/?session=${createRoomSessionId}`} size={100} />
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
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className={`p-4 sm:p-6 lg:p-8 text-center transition-all duration-1000 delay-1300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-neutral-500 text-xs sm:text-sm transition-all duration-300 hover:text-neutral-400">
            Experience music together with FxSync
          </p>
        </footer>
      </div>


    </div>
  );
} 