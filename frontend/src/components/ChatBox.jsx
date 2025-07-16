import React, { useReducer, useRef, useEffect, useMemo, useCallback, useContext, useState } from 'react';
import useFocusTrap from './useFocusTrap';
import { useStaggeredAnimation } from '../hooks/useSmoothAppearance';
import '../App.css'; // Ensure global styles are loaded
import {
  FiSettings,
  FiX,
  FiTrash2,
  FiImage,
  FiPlus,
  FiCheck,
  FiMusic,
  FiPaperclip,
  FiSmile,
  FiEdit,
  FiFlag,
  FiCopy
} from 'react-icons/fi';
import { VariableSizeList as List } from 'react-window';
import { ReducedMotionContext } from '../App';
import MessageList from './MessageList';
import PropTypes from 'prop-types';

const EMOJIS = [
  '🎵', '👏', '🔥', '😂', '😍', '👍', '❤️', '🎉',
  '😎', '🤔', '🥳', '😅', '😭', '🙌', '🤩', '😡',
  '😇', '😱', '🤗', '😜', '😏', '😴', '🤓', '🥰',
  '😃', '😆', '😋', '😢', '😤', '😬', '😮', '😐',
  '😑', '😶', '😕', '😲', '😛', '😝', '😚', '😘',
  '😗', '😙', '😎', '😈', '👻', '💀', '🤖', '👽',
  '💩', '🤑', '🤠', '🥸', '🤡', '👾', '🫶', '💯'
];

const predefinedThemes = [
  {
    name: "Classic Dark",
    bg: "#0A0A0A",
    bubble: "#27272a",
    text: "#fff",
    bubbleText: "#fff",
    bgImage: "",
    font: "Inter, sans-serif"
  },
  {
    name: "Midnight Blue",
    bg: "#1e293b",
    bubble: "#334155",
    text: "#e0e7ef",
    bubbleText: "#fff",
    bgImage: "",
    font: "Inter, sans-serif"
  },
  {
    name: "Emerald",
    bg: "#052e16",
    bubble: "#059669",
    text: "#e0ffe0",
    bubbleText: "#fff",
    bgImage: "",
    font: "Inter, sans-serif"
  },
  {
    name: "Sunset",
    bg: "#f59e42",
    bubble: "#fbbf24",
    text: "#3b2f1e",
    bubbleText: "#3b2f1e", // Make bubble text dark for light bubble
    bgImage: "",
    font: "Inter, sans-serif"
  },
  {
    name: "Rose",
    bg: "#881337",
    bubble: "#f43f5e",
    text: "#fff0f5",
    bubbleText: "#881337", // Keep dark text for light bubble
    bgImage: "",
    font: "Inter, sans-serif"
  },
  {
    name: "Lavender",
    bg: "#6d28d9",
    bubble: "#a78bfa",
    text: "#f3e8ff",
    bubbleText: "#4b006e", // Keep dark text for light bubble
    bgImage: "",
    font: "Inter, sans-serif"
  },
  {
    name: "Light",
    bg: "#f3f4f6",
    bubble: "#e5e7eb",
    text: "#000",
    bubbleText: "#232526", // Keep dark text for light bubble
    bgImage: "",
    font: "Inter, sans-serif"
  },
  // Advanced themes
  {
    name: "Glassmorphism",
    bg: "rgba(24,24,27,0.7)",
    bubble: "rgba(39,39,42,0.6)",
    text: "#fff",
    bubbleText: "#fff",
    bgImage: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
    font: "Inter, sans-serif"
  },
  {
    name: "Neon Night",
    bg: "#18181b",
    bubble: "#00f2fe",
    text: "#fff",
    bubbleText: "#18181b", // Dark text for neon bubble
    bgImage: "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=800&q=80",
    font: "'Orbitron', sans-serif"
  },
  {
    name: "Pastel Mint",
    bg: "#e0f7fa",
    bubble: "#b2f5ea",
    text: "#1b5e20",
    bubbleText: "#1b5e20", // Dark text for light bubble
    bgImage: "",
    font: "'Quicksand', sans-serif"
  },
  {
    name: "High Contrast",
    bg: "#000",
    bubble: "#fff",
    text: "#fff",
    bubbleText: "#000", // Black text for white bubble
    bgImage: "",
    font: "Inter, sans-serif"
  },
  {
    name: "Solarized",
    bg: "#002b36",
    bubble: "#b58900",
    text: "#fdf6e3",
    bubbleText: "#002b36", // Dark text for yellow bubble
    bgImage: "",
    font: "'Fira Mono', monospace"
  },
  {
    name: "Oceanic",
    bg: "#0f2027",
    bubble: "#2c5364",
    text: "#e0f7fa",
    bubbleText: "#fff", // White text for dark bubble
    bgImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
    font: "'Montserrat', sans-serif"
  },
  {
    name: "Grape Soda",
    bg: "#2d0036",
    bubble: "#a259f7",
    text: "#fff",
    bubbleText: "#2d0036", // Dark text for light bubble
    bgImage: "",
    font: "'Baloo 2', cursive"
  },
  {
    name: "Peachy",
    bg: "#fff0e5",
    bubble: "#ffb385",
    text: "#7c4700",
    bubbleText: "#7c4700", // Dark text for light bubble
    bgImage: "",
    font: "'Quicksand', sans-serif"
  },
  {
    name: "Forest",
    bg: "#1b5e20",
    bubble: "#388e3c",
    text: "#e0ffe0",
    bubbleText: "#fff", // White text for dark bubble
    bgImage: "https://images.unsplash.com/photo-1465101178521-c1a9136a3b99?auto=format&fit=crop&w=800&q=80",
    font: "'Merriweather', serif"
  },
  {
    name: "Sky Gradient",
    bg: "linear-gradient(135deg,#89f7fe 0%,#66a6ff 100%)",
    bubble: "#66a6ff",
    text: "#003366",
    bubbleText: "#003366", // Dark text for light bubble
    bgImage: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=800&q=80",
    font: "'Poppins', sans-serif"
  },
  {
    name: "Pink Gradient",
    bg: "linear-gradient(135deg,#f857a6 0%,#ff5858 100%)",
    bubble: "#f857a6",
    text: "#fff",
    bubbleText: "#fff", // White text for dark bubble
    bgImage: "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=800&q=80",
    font: "'Baloo 2', cursive"
  },
  {
    name: "Cyberpunk",
    bg: "#0f0c29",
    bubble: "#ff0080",
    text: "#00ffe7",
    bubbleText: "#0f0c29", // Dark text for neon bubble
    bgImage: "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=800&q=80",
    font: "'Share Tech Mono', monospace"
  },
  {
    name: "Slate",
    bg: "#232526",
    bubble: "#414345",
    text: "#e0e0e0",
    bubbleText: "#fff", // White text for dark bubble
    bgImage: "",
    font: "Inter, sans-serif"
  }
];

// --- ChatBox State Management with useReducer ---
const initialState = {
  input: '',
  sending: false,
  shouldAnimate: false,
  showEmojiPicker: false,
  inputFocused: false,
  error: '',
  isAtBottom: true,
  showNewMsgIndicator: false,
  typingUsers: [],
  pendingMessages: [],
  editingId: null,
  editValue: '',
  reportingId: null,
  reportReason: '',
  reportFeedback: '',
  contextMenu: { visible: false, x: 0, y: 0, msg: null },
  menuExiting: false,
  deletingMsg: null,
  showChatSettings: false,
  chatBgColor: '#0A0A0A',
  bubbleColor: '#27272a',
  chatBgImage: '',
  bubbleRadius: 16,
  fontFamily: 'Inter, sans-serif',
  selectedTheme: predefinedThemes[0],
  showPlusMenu: false,
  copyFeedback: false,
  fileUploadError: '',
};
function reducer(state, action) {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.payload };
    case 'PUSH_PENDING_MESSAGE':
      return { ...state, pendingMessages: [...state.pendingMessages, action.payload] };
    case 'REMOVE_PENDING_MESSAGE':
      return { ...state, pendingMessages: state.pendingMessages.filter(id => id !== action.payload) };
    case 'ADD_TYPING_USER':
      if (state.typingUsers.some(u => u.clientId === action.payload.clientId)) return state;
      return { ...state, typingUsers: [...state.typingUsers, action.payload] };
    case 'REMOVE_TYPING_USER':
      return { ...state, typingUsers: state.typingUsers.filter(u => u.clientId !== action.payload) };
    default:
      return state;
  }
}

const ChatBox = React.memo(function ChatBox({
  socket,
  sessionId,
  clientId,
  displayName, // <-- add this prop
  messages = [],
  clients = [],
  mobile = false,
  isChatTabActive = false,
  markDelivered,
}) {
  const reducedMotion = useContext(ReducedMotionContext); // <-- Move this to the top
  // --- All hooks must be called at the top level, before any returns or conditionals ---

  // State hooks
  const [state, dispatch] = useReducer(reducer, initialState);

  // Ref hooks
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const chatContainerRef = useRef(null);
  const contextMenuRef = useRef(null);
  const chatInputRef = useRef(null);
  const plusButtonRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const notificationAudio = useRef(null);
  const lastMsgCount = useRef(messages.length);
  // Accessibility/focus trap refs
  const reportModalRef = useRef(null);
  const deleteModalRef = useRef(null);
  const contextMenuTrapRef = useRef(null);
  // Scroll position tracking (debounced)
  const scrollDebounceRef = useRef(null);
  const chatListRef = useRef();

  // Add MAX_LENGTH constant
  const MAX_LENGTH = 500;
  const LONG_PRESS_DURATION = 500; // ms
  const LONG_PRESS_MOVE_THRESHOLD = 10; // px

  // Handler functions
  const handleReportCancel = () => {
    dispatch({ type: 'SET', payload: { reportingId: null, reportReason: '', reportFeedback: '' } });
  };
  const cancelDelete = () => dispatch({ type: 'SET', payload: { deletingMsg: null } });

  // --- ACCESSIBILITY & FOCUS TRAP HELPERS ---
  useFocusTrap(!!state.reportingId, reportModalRef, handleReportCancel);
  useFocusTrap(!!state.deletingMsg, deleteModalRef, cancelDelete);
  useFocusTrap(state.contextMenu.visible, contextMenuTrapRef, () => dispatch({ type: 'SET', payload: { menuExiting: true } }));

  // --- DELETE PERIOD LOGIC ---
  const DELETE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes
  const isDeletable = (msg) => {
    if (!msg || !msg.timestamp) return false;
    return Date.now() - msg.timestamp < DELETE_PERIOD_MS;
  };

  // Close plus menu on outside click
  useEffect(() => {
    if (!state.showPlusMenu) return;
    const handleClick = (e) => {
      if (plusButtonRef.current && !plusButtonRef.current.contains(e.target)) {
        dispatch({ type: 'SET', payload: { showPlusMenu: false } });
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [state.showPlusMenu]);

  // Dropdown menu options
  const plusMenuOptions = [
    { label: 'Image', icon: <FiImage size={18} />, onClick: () => {/* TODO: handle image */ dispatch({ type: 'SET', payload: { showPlusMenu: false } }); } },
    { label: 'Audio', icon: <FiMusic size={18} />, onClick: () => {/* TODO: handle audio */ dispatch({ type: 'SET', payload: { showPlusMenu: false } }); } },
    { label: 'File', icon: <FiPaperclip size={18} />, onClick: () => {/* TODO: handle file */ dispatch({ type: 'SET', payload: { showPlusMenu: false } }); } },
    { label: 'GIF', icon: <FiSmile size={18} />, onClick: () => {/* TODO: handle gif */ dispatch({ type: 'SET', payload: { showPlusMenu: false } }); } },
  ];

  // When a theme is selected, update all relevant states
  const applyTheme = (theme) => {
    dispatch({ type: 'SET', payload: { selectedTheme: theme } });
    dispatch({ type: 'SET', payload: { chatBgColor: theme.bg || '#0A0A0A' } });
    dispatch({ type: 'SET', payload: { bubbleColor: theme.bubble || '#27272a' } });
    dispatch({ type: 'SET', payload: { bubbleRadius: 16 } }); // Optionally, allow theme to set this
    dispatch({ type: 'SET', payload: { fontFamily: theme.font || 'Inter, sans-serif' } });
    // Do not setChatBgImage here; always use selectedTheme.bgImage
  };

  // Add the missing clearChatSettings function
  const clearChatSettings = () => {
    dispatch({ type: 'SET', payload: { selectedTheme: predefinedThemes[0] } });
    dispatch({ type: 'SET', payload: { chatBgColor: predefinedThemes[0].bg || '#0A0A0A' } });
    dispatch({ type: 'SET', payload: { bubbleColor: predefinedThemes[0].bubble || '#27272a' } });
    dispatch({ type: 'SET', payload: { chatBgImage: '' } });
    dispatch({ type: 'SET', payload: { bubbleRadius: 16 } }); // default px
    dispatch({ type: 'SET', payload: { fontFamily: predefinedThemes[0].font || 'Inter, sans-serif' } });
  };

  // Use reducedMotion to skip or minimize animations
  useEffect(() => {
    if (reducedMotion) {
      dispatch({ type: 'SET', payload: { shouldAnimate: false } });
    }
  }, [reducedMotion]);

  // Smooth animation for new messages
  const messageAnimations = reducedMotion ? [] : useStaggeredAnimation(messages, 60, 'whatsapp-bubble-entry');

  // Trigger animation for mobile chat input
  useEffect(() => {
    if (mobile) {
      const timer = setTimeout(() => {
        dispatch({ type: 'SET', payload: { shouldAnimate: true } });
      }, 400); // was 100
      return () => clearTimeout(timer);
    }
  }, [mobile]);

  // Trigger animation when chat tab becomes active
  useEffect(() => {
    if (mobile && isChatTabActive) {
      dispatch({ type: 'SET', payload: { shouldAnimate: false } });
      const timer = setTimeout(() => {
        dispatch({ type: 'SET', payload: { shouldAnimate: true } });
      }, 400); // was 50
      return () => clearTimeout(timer);
    }
  }, [mobile, isChatTabActive]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Scroll position tracking (debounced)
  const handleScroll = () => {
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40; // 40px threshold
      dispatch({ type: 'SET', payload: { isAtBottom: atBottom } });
      if (atBottom) dispatch({ type: 'SET', payload: { showNewMsgIndicator: false } });
    }, 60); // was 50
  };

  // Restore scroll position on mount
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const savedScroll = sessionStorage.getItem('chatScrollTop');
    if (savedScroll) {
      el.scrollTop = parseInt(savedScroll, 10);
    }
    return () => {
      if (el) sessionStorage.setItem('chatScrollTop', el.scrollTop);
    };
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    if (!state.contextMenu.visible) return;
    const handleClick = () => {
      dispatch({ type: 'SET', payload: { menuExiting: true } });
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [state.contextMenu.visible]);

  // Remove menu from DOM after exit animation
  useEffect(() => {
    if (!state.menuExiting) return;
    const timeout = setTimeout(() => {
      dispatch({ type: 'SET', payload: { contextMenu: { ...state.contextMenu, visible: false, x: 0, y: 0, msg: null } } });
      dispatch({ type: 'SET', payload: { menuExiting: false } });
    }, 160); // match fade-scale-out duration
    return () => clearTimeout(timeout);
  }, [state.menuExiting]);

  // Further enhanced context menu handler: supports mouse, keyboard, touch, and accessibility
  const handleContextMenu = (e, msg) => {
    // Prevent default context menu and stop propagation for custom menu
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }

    let x = 0, y = 0;

    // Mouse right-click or keyboard context menu (Shift+F10 or ContextMenu key)
    if (e.type === 'contextmenu' || e.type === 'click') {
      x = e.clientX;
      y = e.clientY;
    } 
    // Touch long-press
    else if (e.touches && e.touches.length > 0) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } 
    // Keyboard context menu key
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      // Try to get bounding rect of the target
      const rect = e.target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    } 
    // Accessibility: focus/enter/space on message (simulate context menu)
    else if (e.type === 'keydown' && (e.key === 'Enter' || e.key === ' ')) {
      const rect = e.target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    // Fallback to mouse position or center of window
    else {
      x = e.clientX || window.innerWidth / 2;
      y = e.clientY || window.innerHeight / 2;
    }

    // Clamp position to viewport (prevents menu from being offscreen on initial open)
    const menuWidth = 160, menuHeight = 120; // Approximate, will be corrected after render
    const maxX = window.innerWidth - menuWidth - 8;
    const maxY = window.innerHeight - menuHeight - 8;
    x = Math.max(8, Math.min(x, maxX));
    y = Math.max(8, Math.min(y, maxY));

    // Set context menu state; will be further adjusted after render
    dispatch({ type: 'SET', payload: { contextMenu: { ...state.contextMenu, visible: true, x: x - 53, y: y - 45, msg } } });
    dispatch({ type: 'SET', payload: { menuExiting: false } });
    // console.log('setContextMenu called', { visible: true, x: x - 53, y: y - 45, msg });
  };

  // Adjust context menu position to stay within chat section
  useEffect(() => {
    if (!state.contextMenu.visible || !contextMenuRef.current || !chatContainerRef.current) return;
    const menu = contextMenuRef.current;
    const chat = chatContainerRef.current;
    const menuRect = menu.getBoundingClientRect();
    const chatRect = chat.getBoundingClientRect();
    let x = state.contextMenu.x;
    let y = state.contextMenu.y;

    // Calculate available space below and above the bubble
    const spaceBelow = chatRect.bottom - (y + menuRect.height);
    const spaceAbove = y - chatRect.top - menuRect.height;

    // If not enough space below, and enough space above, show above
    if (spaceBelow < 0 && spaceAbove > 0) {
      y = y - menuRect.height - 8; // 8px gap above
    }

    // Clamp to chat container
    if (x + menuRect.width > chatRect.right) {
      x = chatRect.right - menuRect.width - 4;
    }
    if (x < chatRect.left) {
      x = chatRect.left + 4;
    }
    if (y + menuRect.height > chatRect.bottom) {
      y = chatRect.bottom - menuRect.height - 4;
    }
    if (y < chatRect.top) {
      y = chatRect.top + 4;
    }
    if (x !== state.contextMenu.x || y !== state.contextMenu.y) {
      dispatch({ type: 'SET', payload: { contextMenu: { ...state.contextMenu, x, y } } });
    }
  }, [state.contextMenu.visible, state.contextMenu.x, state.contextMenu.y]);

  // Helper to get display name from clientId or message
  const getDisplayName = (id, msg = {}) => {
    if (msg.displayName) return msg.displayName;
    const found = clients.find((c) => c.clientId === id);
    return found ? found.displayName || found.clientId || id : id;
  };

  // Helper to determine if a message starts a group
  function isGroupStart(messages, i) {
    if (i === 0) return true;
    return messages[i].sender !== messages[i - 1].sender;
  }
  // Helper to determine if a message ends a group
  function isGroupEnd(messages, i) {
    if (i === messages.length - 1) return true;
    return messages[i].sender !== messages[i + 1].sender;
  }

  // Emit typing/stop_typing events
  const handleInputChange = (e) => {
    dispatch({ type: 'SET', payload: { input: e.target.value } });
    if (e.target.value.trim().length <= MAX_LENGTH) dispatch({ type: 'SET', payload: { error: '' } });
    if (!socket) return;
    socket.emit('typing', { sessionId, clientId, displayName });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { sessionId, clientId });
    }, 2000);
  };

  // Listen for typing events
  useEffect(() => {
    if (!socket) return;
    const handleUserTyping = ({ clientId: typingId, displayName }) => {
      if (typingId === clientId) return;
      dispatch({ type: 'ADD_TYPING_USER', payload: { clientId: typingId, displayName } });
    };
    const handleUserStopTyping = ({ clientId: typingId }) => {
      dispatch({ type: 'REMOVE_TYPING_USER', payload: { clientId: typingId } });
    };
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stop_typing', handleUserStopTyping);
    return () => {
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stop_typing', handleUserStopTyping);
    };
  }, [socket, clientId]);

  // Replace the tick/clock rendering logic with WhatsApp-like SVGs:
// Add these helper components inside ChatBox:
const SingleCheck = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline align-bottom">
    <path d="M5 9.5L8 12.5L13 7.5" stroke="#6EAF7C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const DoubleCheckGray = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline align-bottom">
    <path d="M4.5 10.5L7.5 13.5L12.5 8.5" stroke="#A0A0A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 10.5L10 13.5L15 8.5" stroke="#A0A0A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const DoubleCheckBlue = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline align-bottom">
    <path d="M4.5 10.5L7.5 13.5L12.5 8.5" stroke="#53BDEB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 10.5L10 13.5L15 8.5" stroke="#53BDEB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// --- COLOR CONTRAST CHECKER ---
function hexToRgb(hex) {
  // Expand shorthand form (e.g. "#03F") to full form ("#0033FF")
  let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function(m, r, g, b) {
    return r + r + g + g + b + b;
  });
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}
function luminance(r, g, b) {
  let a = [r, g, b].map(function(v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;
  const lum1 = luminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = luminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}
function isHexColor(str) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(str);
}

  // Send message and track pending
  const sendMessage = (msg) => {
    const trimmed = msg.trim();
    if (!trimmed || !socket) {
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      dispatch({ type: 'SET', payload: { error: `Message too long (max ${MAX_LENGTH} characters).` } });
      return;
    }
    dispatch({ type: 'SET', payload: { error: '' } });
    // Create a local pending messageId
    const localId = `${Date.now()}-local-${Math.random().toString(36).slice(2, 10)}`;
    dispatch({ type: 'PUSH_PENDING_MESSAGE', payload: localId });
    let didRespond = false;
    const fallbackTimeout = setTimeout(() => {
      if (!didRespond) {
        dispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: localId });
      }
    }, 3000);
    console.log('[ChatBox] Sending message:', { sessionId, message: trimmed, sender: clientId, displayName });
    socket.emit('chat_message', { sessionId, message: trimmed, sender: clientId, displayName }, (response) => {
      didRespond = true;
      clearTimeout(fallbackTimeout);
      console.log('[ChatBox] Received chat_message response:', response);
      if (response && response.error) {
        dispatch({ type: 'SET', payload: { error: response.error } });
        dispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: localId });
      } else if (response && response.message && response.message.messageId) {
        socket.emit('stop_typing', { sessionId, clientId });
        // Mark delivered in chat state
        if (markDelivered) markDelivered(response.message.messageId);
        dispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: localId });
        // Refocus the input after sending a message (use setTimeout to ensure DOM is ready)
        setTimeout(() => {
          chatInputRef.current?.focus();
        }, 0);
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (state.editingId) {
      handleEditSave(messages.find(m => m.messageId === state.editingId));
    } else {
      sendMessage(state.input);
      dispatch({ type: 'SET', payload: { input: '' } }); // Clear input immediately for responsiveness
      dispatch({ type: 'SET', payload: { showEmojiPicker: false } });
    }
  };

  // At the top level of the component, after other hooks:
  useEffect(() => {
    const savedOffset = sessionStorage.getItem('chatScrollOffset');
    if (chatListRef.current && savedOffset) {
      chatListRef.current.scrollTo(Number(savedOffset));
    }
    return () => {
      if (chatListRef.current) {
        sessionStorage.setItem('chatScrollOffset', chatListRef.current.state.scrollOffset);
      }
    };
  }, [messages.length]);
  // Add error handling and logging for debugging
  useEffect(() => {
    if (!socket) {
      return;
    }
    const handleChatResponse = (data) => {};
    const handleError = (error) => {};
    const handleConnect = () => {};
    const handleDisconnect = () => {};
    socket.on('chat_response', handleChatResponse);
    socket.on('error', handleError);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('chat_response', handleChatResponse);
      socket.off('error', handleError);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, sessionId, clientId]);

  // --- ENHANCED: Emoji Picker ---
  const handleEmojiClick = (emoji) => {
    dispatch({ type: 'SET', payload: { input: state.input + emoji } });
    dispatch({ type: 'SET', payload: { showEmojiPicker: false } });
  };

  // --- ENHANCED: Highlight own messages, subtle hover, avatars, and message grouping ---
  const getAvatar = (id) => {
    // Minimalist: white/gray circle with initial
    const name = getDisplayName(id);
    const initial = name && name !== 'You' ? name[0].toUpperCase() : 'Y';
    return (
      <span className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-black font-bold text-lg border border-gray-700">
        {initial}
      </span>
    );
  };

  // --- SANITIZE MESSAGE ---
  function sanitize(text) {
    if (!text) return '';
    return text.replace(/[&<>"]|'/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
    });
  }

  // Helper to parse and highlight @mentions in message text
  const highlightMentions = (text, clients, currentDisplayName) => {
    if (!text) return text;
    // Build regex for all displayNames
    const names = clients.map(c => c.displayName).filter(Boolean);
    if (names.length === 0) return sanitize(text);
    // Escape regex special chars in names
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionRegex = new RegExp(`@(${names.map(esc).join('|')})`, 'gi');
    let lastIndex = 0;
    const parts = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(sanitize(text.slice(lastIndex, match.index)));
      }
      const isYou = match[1].toLowerCase() === (currentDisplayName || '').toLowerCase();
      parts.push(
        <span key={match.index} className={isYou ? 'bg-gray-400 text-black font-bold px-1 rounded' : 'bg-gray-400/30 text-gray-200 font-semibold px-1 rounded'}>
          @{sanitize(match[1])}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(sanitize(text.slice(lastIndex)));
    }
    return parts.length > 0 ? parts : sanitize(text);
  };

  // Edit message handler
  const handleEdit = (msg) => {
    dispatch({ type: 'SET', payload: { editingId: msg.messageId } });
    dispatch({ type: 'SET', payload: { input: msg.message } });
    dispatch({ type: 'SET', payload: { editValue: msg.message } });
  };
  const handleEditChange = (e) => dispatch({ type: 'SET', payload: { editValue: e.target.value } });
  const handleEditCancel = () => {
    dispatch({ type: 'SET', payload: { editingId: null, editValue: '', input: '' } });
  };
  const handleEditSave = (msg) => {
    if (!msg) {
      dispatch({ type: 'SET', payload: { editingId: null, editValue: '', input: '', error: 'This message was deleted while you were editing.' } });
      return;
    }
    if (!state.input.trim() || !socket) return;
    socket.emit('edit_message', {
      sessionId,
      messageId: msg.messageId,
      newMessage: state.input,
      clientId,
    }, (response) => {
      if (!response || response.error) {
        dispatch({ type: 'SET', payload: { error: response?.error || 'Edit failed' } });
      } else {
        dispatch({ type: 'SET', payload: { editingId: null, editValue: '', input: '' } });
      }
    });
  };
  // Update handleDelete to show the dialog instead of window.confirm
  const handleDelete = (msg) => {
    dispatch({ type: 'SET', payload: { deletingMsg: msg } });
  };

  // Add a function to confirm deletion
  const confirmDelete = () => {
    if (!state.deletingMsg) return;
    socket.emit('delete_message', {
      sessionId,
      messageId: state.deletingMsg.messageId,
      clientId,
    }, (response) => {
      if (!response || response.error) {
        dispatch({ type: 'SET', payload: { error: response?.error || 'Delete failed' } });
      }
      dispatch({ type: 'SET', payload: { deletingMsg: null } });
    });
  };

  // Report message handler
  const handleReport = (msg) => {
    dispatch({ type: 'SET', payload: { reportingId: msg.messageId, reportReason: '', reportFeedback: '' } });
  };
  const handleReportSubmit = (msg) => {
    if (!socket) return;
    socket.emit('report_message', {
      sessionId,
      messageId: msg.messageId,
      reporterId: clientId,
      reason: state.reportReason,
    }, (response) => {
      if (!response || response.error) {
        dispatch({ type: 'SET', payload: { reportFeedback: response?.error || 'Failed to report message' } });
      } else {
        dispatch({ type: 'SET', payload: { reportFeedback: 'Message reported. Thank you!' } });
        setTimeout(() => dispatch({ type: 'SET', payload: { reportingId: null } }), 1200);
      }
    });
  };

  // Notification sound
  useEffect(() => {
    if (!notificationAudio.current) {
      try {
        notificationAudio.current = new window.Audio('/notification.mp3');
      } catch (e) {
        notificationAudio.current = null;
      }
    }
  }, []);

  // Add copy handler
  const handleCopy = (msg) => {
    if (msg && msg.message) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg.message).then(() => {
          dispatch({ type: 'SET', payload: { copyFeedback: true } });
          setTimeout(() => dispatch({ type: 'SET', payload: { copyFeedback: false } }), 1000);
        });
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = msg.message;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          dispatch({ type: 'SET', payload: { copyFeedback: true } });
          setTimeout(() => dispatch({ type: 'SET', payload: { copyFeedback: false } }), 1000);
        } catch (err) {}
        document.body.removeChild(textarea);
      }
    }
    dispatch({ type: 'SET', payload: { menuExiting: true } });
  };

  // Browser notification helper
  const showBrowserNotification = (msg) => {
    if (window.Notification && Notification.permission === 'granted') {
      new Notification('New chat message', {
        body: msg.message,
        icon: '/vite.svg',
      });
    }
  };
  // Request permission on mount
  useEffect(() => {
    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!state.editingId) return;
    const editingMsg = messages.find(m => m.messageId === state.editingId);
    if (editingMsg && (editingMsg.deleted || !editingMsg.message)) {
      dispatch({ type: 'SET', payload: { editingId: null, editValue: '', input: '', error: 'This message was deleted while you were editing.' } });
    }
  }, [messages, state.editingId])

  // Play sound and show notification for new messages (not sent by self)
  useEffect(() => {
    if (messages.length > lastMsgCount.current) {
      const newMsg = messages[messages.length - 1];
      if (newMsg && newMsg.sender !== clientId) {
        // Only notify if window not focused or chat not active
        if (!document.hasFocus() || !isChatTabActive) {
          notificationAudio.current && notificationAudio.current.play().catch(() => {});
          showBrowserNotification(newMsg);
        }
        // Vibration (mobile)
        if (window.navigator.vibrate) {
          window.navigator.vibrate(100);
        }
      }
    }
    lastMsgCount.current = messages.length;
  }, [messages, clientId, isChatTabActive]);

  // Emit 'message_read' for visible messages from others
  useEffect(() => {
    if (!socket || !sessionId || !clientId) return;
    // Find the last message from another user that is not read
    const unread = messages.filter(
      (msg) => msg.sender !== clientId && !msg.read && msg.messageId
    );
    if (unread.length === 0) return;
    // Only mark as read if at bottom (user has seen the message)
    if (state.isAtBottom) {
      unread.forEach((msg) => {
        socket.emit('message_read', {
          sessionId,
          messageId: msg.messageId,
          clientId,
        });
      });
    }
  }, [messages, state.isAtBottom, socket, sessionId, clientId]);

  // Memoize expensive color contrast calculations
  const bgBubbleContrast = useMemo(
    () => contrastRatio(state.chatBgColor, state.bubbleColor),
    [state.chatBgColor, state.bubbleColor]
  );
  const bubbleTextContrast = useMemo(
    () => contrastRatio(state.bubbleColor, state.selectedTheme.bubbleText || '#fff'),
    [state.bubbleColor, state.selectedTheme.bubbleText]
  );
  // Memoize highlightMentions
  const memoizedHighlightMentions = useCallback(
    (text, clients, currentDisplayName) => highlightMentions(text, clients, currentDisplayName),
    [clients, displayName]
  );
  // Memoize handlers
  const memoizedHandleContextMenu = useCallback((e, msg) => handleContextMenu(e, msg), [handleContextMenu]);
  const memoizedHandleEdit = useCallback((msg) => handleEdit(msg), [handleEdit]);
  const memoizedHandleDelete = useCallback((msg) => handleDelete(msg), [handleDelete]);
  const memoizedHandleReport = useCallback((msg) => handleReport(msg), [handleReport]);
  const memoizedHandleCopy = useCallback((msg) => handleCopy(msg), [handleCopy]);

  // --- MOBILE LAYOUT ---
  if (mobile) {
    return (
      <div className="h-full flex flex-col relative bg-neutral-950" ref={chatContainerRef}>
        {/* Header */}
        <div className="h-20 flex items-center px-6 border-b border-neutral-800 bg-neutral-950/95">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Chat</h3>
              <p className="text-neutral-400 text-xs">{clients.length} participant{clients.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {/* Add a settings button to the header */}
          <div className="flex-1 flex justify-end items-center">
            <button
              className="p-2 rounded-full hover:bg-neutral-800 focus:bg-neutral-800 transition-colors"
              title="Chat Settings"
              onClick={() => dispatch({ type: 'SET', payload: { showChatSettings: true } })}
            >
              <FiSettings size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        {messages.length > 30 ? (
          <MessageList
            messages={messages}
            clientId={clientId}
            displayName={displayName}
            clients={clients}
            mobile={mobile}
            messageAnimations={messageAnimations}
            handleContextMenu={memoizedHandleContextMenu}
            ListComponent={List}
            scrollContainerRef={scrollContainerRef}
            chatListRef={chatListRef}
            messagesEndRef={messagesEndRef}
            isGroupStart={isGroupStart}
            isGroupEnd={isGroupEnd}
            selectedTheme={state.selectedTheme}
            bubbleColor={state.bubbleColor}
            bubbleRadius={state.bubbleRadius}
            fontFamily={state.fontFamily}
            getAvatar={getAvatar}
            highlightMentions={memoizedHighlightMentions}
          />
        ) : (
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2 pb-36 scrollable-container" tabIndex="0">
            {messages.map((msg, i) => {
              const isOwn = msg.sender === clientId;
              const groupStart = isGroupStart(messages, i);
              const groupEnd = isGroupEnd(messages, i);
              return (
                <div
                  key={msg.messageId || `${msg.sender}-${msg.timestamp}-${i}`}
                  className={`flex items-end transition-all duration-300 group ${isOwn ? 'justify-end' : 'justify-start'} enhanced-bubble-appear ${mobile ? '' : messageAnimations[i]?.animationClass || ''} ${groupStart ? 'mt-3' : ''} ${groupEnd ? 'mb-2' : ''} ${mobile ? 'no-select-mobile' : ''}`}
                  onContextMenu={(e) => memoizedHandleContextMenu(e, msg)}
                >
                  {!isOwn && groupStart && (
                    <div className="mr-2 flex-shrink-0">
                      <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center border border-neutral-700">
                        {getAvatar(msg.sender)}
                      </div>
                    </div>
                  )}
                  <div className={`max-w-xs lg:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
                    {msg.reaction ? (
                      <div className={`flex items-center gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className="bg-neutral-800 rounded-lg px-3 py-2 text-lg">
                          {msg.reaction}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`inline-block max-w-[80vw] md:max-w-md rounded-xl p-1 px-2 pt-0 shadow-sm transition-all duration-200 group-hover:scale-[1.02] relative`}
                        style={{
                          background: state.bubbleColor,
                          color: state.selectedTheme.bubbleText || '#fff',
                          borderRadius: state.bubbleRadius,
                          fontFamily: state.fontFamily,
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                        </div>
                        <div className="flex flex-row items-end w-full">
                          {msg.deleted || !msg.message ? (
                            <span className="flex-1 text-sm italic text-neutral-500 bg-neutral-800/80 rounded-lg px-3 py-2 select-none cursor-default">
                              <svg className="inline-block mr-1 mb-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                              This message was deleted
                            </span>
                          ) : (
                            <span className={`flex-1 text-base break-words ${msg.message && msg.message.includes('@' + displayName) ? 'bg-yellow-400/20' : ''}`} style={{ color: state.selectedTheme.bubbleText || '#fff' }}>
                              {memoizedHighlightMentions(msg.message, clients, displayName)}
                              {msg.edited && <span className="text-xs text-neutral-400 ml-1">(edited)</span>}
                            </span>
                          )}
                          <span className="flex items-end gap-1 text-[11px] opacity-70 ml-4 relative top-[4px]">
                            <span>
                              {msg.timestamp
                                ? new Date(msg.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  })
                                : 'now'}
                            </span>
                            {/* Delivery status for own messages */}
                            {msg.sender === clientId && (
                              msg.read ? (
                                <span title="Read" className=""><DoubleCheckBlue /></span>
                              ) : msg.delivered ? (
                                <span title="Delivered" className=""><DoubleCheckGray /></span>
                              ) : (
                                <span title="Sent" className=""><SingleCheck /></span>
                              )
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
        {/* New messages indicator */}
        {state.showNewMsgIndicator && (
          <button
            className="fixed left-1/2 -translate-x-1/2 bottom-32 z-40 bg-neutral-800 text-white px-4 py-2 rounded-full shadow-lg animate-bounce"
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              dispatch({ type: 'SET', payload: { showNewMsgIndicator: false } });
              dispatch({ type: 'SET', payload: { isAtBottom: true } });
            }}
          >
            New messages ↓
          </button>
        )}
        {/* Floating Chat Input */}
        <div className="fixed left-0 right-0 bottom-20 z-30 flex justify-center pointer-events-none">
          <div className="w-full pointer-events-auto px-2">
            <div
              className={`bg-neutral-900/90 backdrop-blur-lg rounded-full shadow-2xl p-1 border border-neutral-800 transition-all duration-300 ${
                state.shouldAnimate ? 'animate-slide-up-from-bottom' : 'opacity-0 translate-y-full'
              }`}
            >
              <form onSubmit={handleSubmit} className="space-y-2 w-full">
                <div className="relative w-full">
                  {/* Dropdown menu for plus icon, moved even further above the input area */}
                  {state.showPlusMenu && !state.editingId && (
                    <div
                      className="absolute left-0 bottom-full mb-2 z-50 min-w-[180px] bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl py-2 px-0 text-sm text-white backdrop-blur-md animate-fade-scale-in flex flex-col items-stretch"
                      style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.18), 0 1.5px 6px 0 rgba(0,0,0,0.10)' }}
                    >
                      {plusMenuOptions.map((opt) => (
                        <button
                          key={opt.label}
                          className="flex items-center gap-2 w-full text-left px-4 py-2 hover:bg-neutral-800/80 focus:bg-neutral-800/90 focus:outline-none transition-colors duration-150 rounded-md"
                          onClick={opt.onClick}
                        >
                          {opt.icon}
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 items-center w-full">
                    <div className="relative flex items-center">
                      {/* Plus icon for file handling, cross icon for cancel editing */}
                      <button
                        type="button"
                        className="flex items-center justify-center w-9 h-9 bg-neutral-800 rounded-full transition-all duration-200 focus:outline-none relative"
                        style={{ minWidth: 36, minHeight: 36 }}
                        ref={plusButtonRef}
                        onClick={state.editingId ? handleEditCancel : () => dispatch({ type: 'SET', payload: { showPlusMenu: !state.showPlusMenu } })}
                        tabIndex={0}
                        aria-label={state.editingId ? 'Cancel editing' : 'Add file'}
                      >
                        <span
                          className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${state.editingId ? 'rotate-45 text-red-400' : ''}`}
                          style={{ transitionProperty: 'opacity, transform' }}
                        >
                          <FiPlus size={20} />
                        </span>
                      </button>
                    </div>
                    <input
                      ref={chatInputRef}
                      className="flex-1 bg-neutral-900 text-white px-4 py-2 border border-neutral-800 rounded-full focus:outline-none"
                      type="text"
                      value={state.input}
                      onChange={handleInputChange}
                      placeholder={!socket ? 'Connecting...' : 'Type a message...'}
                      disabled={!socket}
                      onFocus={() => dispatch({ type: 'SET', payload: { inputFocused: true } })}
                      onBlur={() => dispatch({ type: 'SET', payload: { inputFocused: false } })}
                      maxLength={MAX_LENGTH + 10} // allow a little over, but block on send
                    />
                    <button
                      type="submit"
                      className="w-9 h-9 flex items-center justify-center bg-white text-black rounded-full text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      disabled={!state.input.trim() || !socket}
                    >
                      {state.editingId ? (
                        <>
                          <FiCheck size={18} />
                          {!mobile && 'Done'}
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
                          </svg>
                          {!mobile && 'Send'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {/* Error message */}
                {state.error && (
                  <div className="text-red-500 text-xs mt-1">{state.error}</div>
                )}
                {/* Emoji Picker Dropdown */}
                {state.showEmojiPicker && (
                  <div className="absolute bottom-16 left-0 right-0 mx-auto w-[90vw] max-w-xs bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl p-3 flex flex-wrap gap-2 z-40 animate-fade-in pointer-events-auto">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="text-2xl p-2 rounded-full hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-white transition"
                        onClick={() => handleEmojiClick(emoji)}
                        tabIndex={0}
                        aria-label={`Insert ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
        {/* Typing indicator */}
        {state.typingUsers.length > 0 && (
          <div className="text-xs text-neutral-400 mt-1" aria-live="polite">
            {state.typingUsers.map((u) => u.displayName || u.clientId).join(', ')} {state.typingUsers.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}
      {/* Floating copy feedback popup (desktop: absolute in chat section, mobile: fixed) */}
      {state.copyFeedback && (
        mobile ? (
          <div className="fixed left-1/2 -translate-x-1/2 z-50 mb-28 sm:mb-24" style={{ bottom: 32 }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full shadow-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur-md animate-bottom-up-scale-in font-semibold text-xs text-white min-w-[120px] justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="inline align-bottom text-green-400 animate-draw-tick"
                style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: 'draw-tick 0.5s cubic-bezier(0.4,0,0.2,1) forwards' }}
              >
                <path
                  d="M5 9.5L8 12.5L13 7.5"
                  stroke="#4ade80"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeDasharray: 24, strokeDashoffset: 24 }}
                />
              </svg>
              <span className="tracking-tight font-medium">Copied</span>
            </div>
          </div>
        ) : (
          <div className="absolute left-1/2 -translate-x-1/2 z-30" style={{ bottom: 80 }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full shadow-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur-md animate-bottom-up-scale-in font-semibold text-xs text-white min-w-[120px] justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="inline align-bottom text-green-400 animate-draw-tick"
                style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: 'draw-tick 0.5s cubic-bezier(0.4,0,0.2,1) forwards' }}
              >
                <path
                  d="M5 9.5L8 12.5L13 7.5"
                  stroke="#4ade80"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeDasharray: 24, strokeDashoffset: 24 }}
                />
              </svg>
              <span className="tracking-tight font-medium">Copied</span>
            </div>
          </div>
        )
      )}
      <style>
        {`
          @keyframes draw-tick {
            to {
              stroke-dashoffset: 0;
            }
          }
          .animate-draw-tick path {
            stroke-dasharray: 24;
            stroke-dashoffset: 24;
            animation: draw-tick 0.5s cubic-bezier(0.4,0,0.2,1) forwards;
          }
        `}
      </style>
              {/* Delete Confirmation Modal (MOBILE) */}
      {mobile && state.deletingMsg && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Delete Message Confirmation"
          tabIndex={-1}
          ref={deleteModalRef}
          onClick={e => { if (e.target === e.currentTarget) cancelDelete(); }}
        >
          <div className="bg-neutral-900/95 border border-neutral-800 rounded-xl px-6 py-5 w-full max-w-xs shadow-xl flex flex-col items-center gap-4 backdrop-blur-md transition-all duration-200 animate-scale-in" tabIndex={0}>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </div>
            <div className="text-base text-white font-semibold text-center mb-1">Delete this message?</div>
            <div className="flex gap-2 w-full mt-1">
              <button className="flex-1 py-2 text-sm font-medium rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none transition-all" onClick={cancelDelete}>Cancel</button>
              <button className="flex-1 py-2 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-400 focus:bg-red-600 focus:outline-none transition-all" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
        {/* Context Menu for mobile */}
        {state.contextMenu.visible && state.contextMenu.msg && (
          <>
            <div
              ref={contextMenuRef}
              className={`fixed z-50 min-w-[140px] max-w-[220px] bg-neutral-900/95 border border-neutral-800 rounded-xl shadow-2xl py-2 px-0 text-sm text-white backdrop-blur-md transition-all duration-200 ease-out ${state.menuExiting ? 'animate-fade-scale-out' : 'animate-fade-scale-in'}`}
              style={{ top: state.contextMenu.y + 60, left: state.contextMenu.x + 50, boxShadow: '0 8px 32px 0 rgba(0,0,0,0.18), 0 1.5px 6px 0 rgba(0,0,0,0.10)' }}
              onClick={e => e.stopPropagation()}
              role="menu"
              aria-label="Message options"
              tabIndex={-1}
              onKeyDown={e => { if (e.key === 'Escape') dispatch({ type: 'SET', payload: { menuExiting: true } }); }}
            >
              {state.contextMenu.msg.sender === clientId && !state.contextMenu.msg.reaction && isDeletable(state.contextMenu.msg) && (
                <button
                  className="block w-full text-left px-4 py-2 font-medium hover:bg-neutral-800/80 focus:bg-neutral-800/90 focus:outline-none transition-colors duration-150 rounded-md flex items-center justify-between gap-2"
                  onClick={() => { dispatch({ type: 'SET', payload: { menuExiting: true } }); setTimeout(() => memoizedHandleEdit(state.contextMenu.msg), 160); }}
                >
                  <span>Edit</span>
                  <FiEdit size={16} />
                </button>
              )}

              {!state.contextMenu.msg.reaction && (
                <button
                  className="block w-full text-left px-4 py-2 hover:bg-neutral-800 flex items-center justify-between gap-2"
                  onClick={() => { dispatch({ type: 'SET', payload: { menuExiting: true } }); setTimeout(() => memoizedHandleReport(state.contextMenu.msg), 160); }}
                >
                  <span>Report</span>
                  <FiFlag size={16} />
                </button>
              )}
              {/* Copy option (always available if not a reaction and not deleted) */}
              {!state.contextMenu.msg.reaction && !state.contextMenu.msg.deleted && state.contextMenu.msg.message && (
                <button
                  className="block w-full text-left px-4 py-2 hover:bg-neutral-800 flex items-center justify-between gap-2"
                  onClick={() => memoizedHandleCopy(state.contextMenu.msg)}
                >
                  <span>Copy</span>
                  <FiCopy size={16} />
                </button>
              )}
              {state.contextMenu.msg.sender === clientId && !state.contextMenu.msg.reaction && isDeletable(state.contextMenu.msg) && (
                <button
                  className="block w-full text-left px-4 py-2 hover:bg-neutral-800 flex items-center justify-between gap-2 text-red-100"
                  onClick={() => { dispatch({ type: 'SET', payload: { menuExiting: true } }); setTimeout(() => memoizedHandleDelete(state.contextMenu.msg), 160); }}
                >
                  <span className="text-red-300">Delete</span>
                  <FiTrash2 size={16} className="text-red-300" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // --- DESKTOP LAYOUT (default) ---
  return (
    <div
      className="h-full flex flex-col bg-neutral-950 relative" // Add relative positioning
      ref={chatContainerRef}
      style={{
        background: state.chatBgImage
          ? `${state.chatBgColor}${state.chatBgColor ? ',' : ''} url(${state.chatBgImage})`
          : state.selectedTheme.bgImage
            ? `${state.chatBgColor}${state.chatBgColor ? ',' : ''} url(${state.selectedTheme.bgImage})`
            : state.chatBgColor,
        backgroundSize: state.chatBgImage || state.selectedTheme.bgImage ? 'cover' : undefined,
        backgroundPosition: state.chatBgImage || state.selectedTheme.bgImage ? 'center' : undefined,
        backgroundRepeat: state.chatBgImage || state.selectedTheme.bgImage ? 'no-repeat' : undefined,
        color: state.selectedTheme.text || '#fff',
        fontFamily: state.fontFamily,
      }}
    >
      {/* Header */}
      <div className="flex items-center px-6 py-3 border-b border-neutral-800 bg-neutral-950/95">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div className='flex items-center gap-4'>
            <h3 className="text-xl font-bold text-white">Chat</h3>
            <p className="text-neutral-400 text-xs">{clients.length} participant{clients.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {/* Add a settings button to the header */}
        <div className="flex-1 flex justify-end items-center">
          <button
            className="p-2 rounded-full hover:bg-neutral-800 focus:bg-neutral-800 transition-colors"
            title="Chat Settings"
            aria-label="Chat Settings"
            onClick={() => dispatch({ type: 'SET', payload: { showChatSettings: true } })}
          >
            <FiSettings size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      {messages.length > 30 ? (
        <MessageList
          messages={messages}
          clientId={clientId}
          displayName={displayName}
          clients={clients}
          mobile={mobile}
          messageAnimations={messageAnimations}
          handleContextMenu={memoizedHandleContextMenu}
          ListComponent={List}
          scrollContainerRef={scrollContainerRef}
          chatListRef={chatListRef}
          messagesEndRef={messagesEndRef}
          isGroupStart={isGroupStart}
          isGroupEnd={isGroupEnd}
          selectedTheme={state.selectedTheme}
          bubbleColor={state.bubbleColor}
          bubbleRadius={state.bubbleRadius}
          fontFamily={state.fontFamily}
          getAvatar={getAvatar}
          highlightMentions={memoizedHighlightMentions}
        />
      ) : (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2 pb-36 scrollable-container" tabIndex="0">
          {messages.map((msg, i) => {
            const isOwn = msg.sender === clientId;
            const groupStart = isGroupStart(messages, i);
            const groupEnd = isGroupEnd(messages, i);
            return (
              <div
                key={msg.messageId || `${msg.sender}-${msg.timestamp}-${i}`}
                className={`flex items-end transition-all duration-300 group ${isOwn ? 'justify-end' : 'justify-start'} enhanced-bubble-appear ${mobile ? '' : messageAnimations[i]?.animationClass || ''} ${groupStart ? 'mt-3' : ''} ${groupEnd ? 'mb-2' : ''} ${mobile ? 'no-select-mobile' : ''}`}
                onContextMenu={(e) => memoizedHandleContextMenu(e, msg)}
              >
                {!isOwn && groupStart && (
                  <div className="mr-2 flex-shrink-0">
                    <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center border border-neutral-700">
                      {getAvatar(msg.sender)}
                    </div>
                  </div>
                )}
                <div className={`max-w-xs lg:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
                  {msg.reaction ? (
                    <div className={`flex items-center gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className="bg-neutral-800 rounded-lg px-3 py-2 text-lg">
                        {msg.reaction}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`inline-block max-w-[80vw] md:max-w-md rounded-xl p-1 px-2 pt-0 shadow-sm transition-all duration-200 group-hover:scale-[1.02] relative`}
                      style={{
                        background: state.bubbleColor,
                        color: state.selectedTheme.bubbleText || '#fff',
                        borderRadius: state.bubbleRadius,
                        fontFamily: state.fontFamily,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                      </div>
                      <div className="flex flex-row items-end w-full">
                        {msg.deleted || !msg.message ? (
                          <span className="flex-1 text-sm italic text-neutral-500 bg-neutral-800/80 rounded-lg px-3 py-2 select-none cursor-default">
                            <svg className="inline-block mr-1 mb-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                            This message was deleted
                          </span>
                        ) : (
                          <span className={`flex-1 text-base break-words ${msg.message && msg.message.includes('@' + displayName) ? 'bg-yellow-400/20' : ''}`} style={{ color: state.selectedTheme.bubbleText || '#fff' }}>
                            {memoizedHighlightMentions(msg.message, clients, displayName)}
                            {msg.edited && <span className="text-xs text-neutral-400 ml-1">(edited)</span>}
                          </span>
                        )}
                        <span className="flex items-end gap-1 text-[11px] opacity-70 ml-4 relative top-[4px]">
                          <span>
                            {msg.timestamp
                              ? new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true
                                })
                              : 'now'}
                          </span>
                          {/* Delivery status for own messages */}
                          {msg.sender === clientId && (
                            msg.read ? (
                              <span title="Read" className=""><DoubleCheckBlue /></span>
                            ) : msg.delivered ? (
                              <span title="Delivered" className=""><DoubleCheckGray /></span>
                            ) : (
                              <span title="Sent" className=""><SingleCheck /></span>
                            )
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
      {/* New messages indicator */}
      {state.showNewMsgIndicator && (
        <button
          className="absolute left-1/2 -translate-x-1/2 bottom-28 z-40 bg-neutral-800 text-white px-4 py-2 rounded-full shadow-lg animate-bounce"
          onClick={() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            dispatch({ type: 'SET', payload: { showNewMsgIndicator: false } });
            dispatch({ type: 'SET', payload: { isAtBottom: true } });
          }}
          aria-live="polite"
        >
          New messages ↓
        </button>
      )}
      {/* Input Area */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 bg-neutral-950 border-t border-neutral-800 sticky bottom-0 z-10 w-full">
        <div className="relative w-full">
          {/* Dropdown menu for plus icon, above the input area */}
          {state.showPlusMenu && !state.editingId && (
            <div
              className="absolute left-0 bottom-full mb-2 z-50 min-w-[180px] w-auto bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl py-2 px-0 text-sm text-white backdrop-blur-md animate-fade-scale-in flex flex-col items-stretch"
              style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.18), 0 1.5px 6px 0 rgba(0,0,0,0.10)' }}
            >
              {plusMenuOptions.map((opt) => (
                <button
                  key={opt.label}
                  className="flex items-center gap-2 w-full text-left px-4 py-2 hover:bg-neutral-800/80 focus:bg-neutral-800/90 focus:outline-none transition-colors duration-150 rounded-md"
                  onClick={opt.onClick}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-center w-full">
            <div className="relative flex items-center">
              {/* Plus icon for file handling, cross icon for cancel editing */}
              <button
                type="button"
                className="flex items-center justify-center w-9 h-9 bg-neutral-800 rounded-full transition-all duration-200 focus:outline-none relative"
                style={{ minWidth: 36, minHeight: 36 }}
                ref={plusButtonRef}
                onClick={state.editingId ? handleEditCancel : () => dispatch({ type: 'SET', payload: { showPlusMenu: !state.showPlusMenu } })}
                tabIndex={0}
                aria-label={state.editingId ? 'Cancel editing' : 'Add file'}
              >
                <span
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${state.editingId ? 'rotate-45 text-red-400' : ''}`}
                  style={{ transitionProperty: 'opacity, transform' }}
                >
                  <FiPlus size={20} />
                </span>
              </button>
            </div>
            <input
              ref={chatInputRef}
              className="flex-1 bg-neutral-900 text-white px-4 py-2 border border-neutral-800 rounded-full focus:outline-none"
              type="text"
              value={state.input}
              onChange={handleInputChange}
              placeholder={!socket ? 'Connecting...' : 'Type a message...'}
              disabled={!socket}
              onFocus={() => dispatch({ type: 'SET', payload: { inputFocused: true } })}
              onBlur={() => dispatch({ type: 'SET', payload: { inputFocused: false } })}
              maxLength={MAX_LENGTH + 10} // allow a little over, but block on send
            />
            <button
              type="submit"
              className="px-4 py-2 bg-white text-black rounded-full text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={!state.input.trim() || !socket}
            >
              {state.editingId ? (
                <>
                  <FiCheck size={18} />
                  {!mobile && 'Done'}
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
                  </svg>
                  {!mobile && 'Send'}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
      {/* Typing indicator */}
      {state.typingUsers.length > 0 && (
        <div className="text-xs text-neutral-400 mt-1" aria-live="polite">
          {state.typingUsers.map((u) => u.displayName || u.clientId).join(', ')} {state.typingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}
      {/* Floating copy feedback popup (desktop: absolute in chat section, mobile: fixed) */}
      {state.copyFeedback && (
        mobile ? (
          <div className="fixed left-1/2 -translate-x-1/2 z-50 mb-28 sm:mb-24" style={{ bottom: 32 }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full shadow-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur-md animate-bottom-up-scale-in font-semibold text-xs text-white min-w-[120px] justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="inline align-bottom text-green-400 animate-draw-tick"
                style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: 'draw-tick 0.5s cubic-bezier(0.4,0,0.2,1) forwards' }}
              >
                <path
                  d="M5 9.5L8 12.5L13 7.5"
                  stroke="#4ade80"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeDasharray: 24, strokeDashoffset: 24 }}
                />
              </svg>
              <span className="tracking-tight font-medium">Copied</span>
            </div>
          </div>
        ) : (
          <div className="absolute left-1/2 -translate-x-1/2 z-30" style={{ bottom: 80 }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full shadow-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur-md animate-bottom-up-scale-in font-semibold text-xs text-white min-w-[120px] justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="inline align-bottom text-green-400 animate-draw-tick"
                style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: 'draw-tick 0.5s cubic-bezier(0.4,0,0.2,1) forwards' }}
              >
                <path
                  d="M5 9.5L8 12.5L13 7.5"
                  stroke="#4ade80"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeDasharray: 24, strokeDashoffset: 24 }}
                />
              </svg>
              <span className="tracking-tight font-medium">Copied</span>
            </div>
          </div>
        )
      )}
      <style>
        {`
          @keyframes draw-tick {
            to {
              stroke-dashoffset: 0;
            }
          }
          .animate-draw-tick path {
            stroke-dasharray: 24;
            stroke-dashoffset: 24;
            animation: draw-tick 0.5s cubic-bezier(0.4,0,0.2,1) forwards;
          }
        `}
      </style>
      {/* Report Modal */}
      {state.reportingId && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 animate-fade-scale-in"
          role="dialog"
          aria-modal="true"
          aria-label="Report Message"
          tabIndex={-1}
          ref={reportModalRef}
          onClick={e => { if (e.target === e.currentTarget) handleReportCancel(); }}
        >
          <div className="bg-black/95 border border-white/10 rounded-2xl p-7 w-full max-w-sm shadow-2xl flex flex-col gap-5 backdrop-blur-md transition-all duration-200" tabIndex={0}>
            <h4 className="text-xl font-bold text-white mb-1 tracking-tight">Report Message</h4>
            <p className="text-sm text-neutral-400 mb-2">Let us know why you think this message is inappropriate. Your report is anonymous.</p>
            <textarea
              className="w-full bg-neutral-900 border border-white/10 rounded-lg p-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all min-h-[80px] resize-none"
              rows={3}
              placeholder="Add a reason (e.g. spam, abuse, etc) — optional"
              value={state.reportReason}
              onChange={e => dispatch({ type: 'SET', payload: { reportReason: e.target.value } })}
              maxLength={200}
              autoFocus
            />
            {state.reportFeedback && <div className="text-xs text-green-400 font-medium text-center py-1">{state.reportFeedback}</div>}
            <div className="flex gap-2 justify-end mt-2">
              <button className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none transition-all" onClick={handleReportCancel}>Cancel</button>
              <button className="px-4 py-2 text-xs font-semibold rounded-lg bg-white text-black hover:bg-neutral-200 focus:bg-neutral-300 focus:outline-none transition-all border border-white/10" onClick={() => memoizedHandleReport(messages.find(m => m.messageId === state.reportingId))} disabled={!!state.reportFeedback}>Back</button>
              <button className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-400 focus:bg-red-600 focus:outline-none transition-all" onClick={() => handleReportSubmit(messages.find(m => m.messageId === state.reportingId))} disabled={!!state.reportFeedback}>Report</button>
            </div>
          </div>
        </div>
      )}
      {state.contextMenu.visible && state.contextMenu.msg && (
          <>
          <div
            ref={el => { contextMenuRef.current = el; contextMenuTrapRef.current = el; }}
            className={`fixed z-50 min-w-[140px] max-w-[220px] bg-neutral-900/95 border border-neutral-800 rounded-xl shadow-2xl py-2 px-0 text-sm text-white backdrop-blur-md transition-all duration-200 ease-out ${state.menuExiting ? 'animate-fade-scale-out' : 'animate-fade-scale-in'}`}
            style={{ top: state.contextMenu.y, left: state.contextMenu.x + 50, boxShadow: '0 8px 32px 0 rgba(0,0,0,0.18), 0 1.5px 6px 0 rgba(0,0,0,0.10)' }}
            role="menu"
            aria-label="Message options"
            tabIndex={-1}
            onKeyDown={e => { if (e.key === 'Escape') dispatch({ type: 'SET', payload: { menuExiting: true } }); }}
            onClick={e => e.stopPropagation()}
          >
            {state.contextMenu.msg.sender === clientId && !state.contextMenu.msg.reaction && isDeletable(state.contextMenu.msg) && (
              <button
                className="block w-full text-left px-4 py-2 font-medium hover:bg-neutral-800/80 focus:bg-neutral-800/90 focus:outline-none transition-colors duration-150 rounded-md flex items-center justify-between gap-2"
                onClick={() => { dispatch({ type: 'SET', payload: { menuExiting: true } }); setTimeout(() => memoizedHandleEdit(state.contextMenu.msg), 160); }}
              >
                <span>Edit</span>
                <FiEdit size={16} />
              </button>
            )}

            {!state.contextMenu.msg.reaction && (
              <button
                className="block w-full text-left px-4 py-2 hover:bg-neutral-800 flex items-center justify-between gap-2"
                onClick={() => { dispatch({ type: 'SET', payload: { menuExiting: true } }); setTimeout(() => memoizedHandleReport(state.contextMenu.msg), 160); }}
              >
                <span>Report</span>
                <FiFlag size={16} />
              </button>
            )}
            {/* Copy option (always available if not a reaction and not deleted) */}
            {!state.contextMenu.msg.reaction && !state.contextMenu.msg.deleted && state.contextMenu.msg.message && (
              <button
                className="block w-full text-left px-4 py-2 hover:bg-neutral-800 flex items-center justify-between gap-2"
                onClick={() => {
                  memoizedHandleCopy(state.contextMenu.msg);
                  // Move focus away from button to allow feedback to show
                  setTimeout(() => {
                    if (contextMenuRef.current) {
                      contextMenuRef.current.focus?.();
                    }
                  }, 0);
                }}
              >
                <span>Copy</span>
                <FiCopy size={16} />
              </button>
            )}
            {state.contextMenu.msg.sender === clientId && !state.contextMenu.msg.reaction && isDeletable(state.contextMenu.msg) && (
              <button
                className="block w-full text-left px-4 py-2 hover:bg-neutral-800 flex items-center justify-between gap-2 text-red-500"
                onClick={() => { dispatch({ type: 'SET', payload: { menuExiting: true } }); setTimeout(() => memoizedHandleDelete(state.contextMenu.msg), 160); }}
              >
                <span className="text-red-300">Delete</span>
                <FiTrash2 size={16} className="text-red-300" />
              </button>
            )}
          </div>
        </>
      )}
      {state.deletingMsg && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Delete Message Confirmation"
          tabIndex={-1}
          ref={deleteModalRef}
          onClick={e => { if (e.target === e.currentTarget) cancelDelete(); }}
        >
          <div className="bg-neutral-900/95 border border-neutral-800 rounded-xl px-6 py-5 w-full max-w-xs shadow-xl flex flex-col items-center gap-4 backdrop-blur-md transition-all duration-200 animate-scale-in" tabIndex={0}>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </div>
            <div className="text-base text-white font-semibold text-center mb-1">Delete this message?</div>
            <div className="flex gap-2 w-full mt-1">
              <button className="flex-1 py-2 text-sm font-medium rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none transition-all" onClick={cancelDelete}>Cancel</button>
              <button className="flex-1 py-2 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-400 focus:bg-red-600 focus:outline-none transition-all" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {state.showChatSettings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 animate-fade-scale-in">
          <div className="bg-neutral-950 rounded-xl w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl shadow-none flex flex-col gap-0 backdrop-blur-md transition-all duration-200 overflow-hidden relative border border-neutral-800
            mx-2 sm:mx-4 md:mx-8" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-neutral-800 bg-neutral-950">
              <span className="text-base sm:text-lg font-semibold text-white">Chat Appearance Settings</span>
              <button className="p-2 rounded-full hover:bg-neutral-800 focus:bg-neutral-800 transition-colors" onClick={() => dispatch({ type: 'SET', payload: { showChatSettings: false } })} title="Close">
                <FiX size={20} />
              </button>
            </div>
            {/* Live Preview */}
            <div className="px-3 sm:px-5 pt-4 sm:pt-5 pb-2 border-b border-neutral-800">
              <div className="mb-1 text-xs text-neutral-400 font-medium">Live Preview</div>
              <div className="flex items-end gap-2 min-h-[40px] sm:min-h-[48px]" style={{ fontFamily: state.fontFamily }}>
                <div className="rounded-full w-6 h-6 sm:w-7 sm:h-7 bg-neutral-800 flex items-center justify-center text-white font-bold text-sm sm:text-base border border-neutral-700">A</div>
                <div
                  className="px-2 sm:px-3 py-1.5 sm:py-2 text-white flex items-center gap-2"
                  style={{
                    backgroundColor: state.bubbleColor,
                    borderRadius: state.bubbleRadius,
                    fontFamily: state.fontFamily,
                    maxWidth: 140,
                    minWidth: 0,
                  }}
                >
                  <span className="text-xs sm:text-sm truncate">Sample message</span>
                  <span className="text-[10px] sm:text-xs text-neutral-400 ml-2">12:34</span>
                </div>
              </div>
              {/* --- CONTRAST WARNINGS --- */}
              {(bgBubbleContrast < 4.5 || bubbleTextContrast < 4.5) && (
                <div className="mt-2 text-xs text-yellow-400 font-semibold flex items-center gap-2">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="inline align-bottom"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/></svg>
                  <span>
                    Warning: Your color choices may not be accessible. 
                    {bgBubbleContrast < 4.5 && 'Background and bubble contrast is too low. '}
                    {bubbleTextContrast < 4.5 && 'Bubble and text contrast is too low.'}
                  </span>
                </div>
              )}
            </div>
            {/* Settings Sections */}
            <div className="flex flex-col gap-5 sm:gap-6 px-3 sm:px-5 py-4 sm:py-5 bg-neutral-950 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
              {/* Themes */}
              <div>
                <div className="text-xs font-semibold text-white mb-1">Themes</div>
                <div className="text-xs text-neutral-400 mb-2">Quickly switch between preset color themes for chat background and bubbles.</div>
                <div className="w-full overflow-x-auto">
                  <div className="flex gap-2 sm:gap-3 mb-1 flex-nowrap min-w-fit pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {predefinedThemes.map((theme) => (
                      <div key={theme.name} className="flex flex-col items-center gap-1 mb-2 min-w-[48px]">
                        <button
                          className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg border-2 transition-all duration-150 focus:outline-none ${state.chatBgColor === theme.bg && state.bubbleColor === theme.bubble ? 'border-white' : 'border-neutral-800'}`}
                          style={{ background: theme.bubble }}
                          onClick={() => applyTheme(theme)}
                          title={theme.name}
                          aria-label={theme.name}
                        />
                        <span className="text-[9px] sm:text-[10px] text-neutral-400 text-center w-10 sm:w-12 truncate">{theme.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Background */}
              <div>
                <div className="text-xs font-semibold text-white mb-1">Background</div>
                <div className="text-xs text-neutral-400 mb-2">Customize the chat background color or add an image (JPG, PNG, GIF).</div>
                <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                  <div className="flex flex-col items-center gap-1">
                    <input type="color" value={state.chatBgColor} onChange={e => dispatch({ type: 'SET', payload: { chatBgColor: e.target.value } })} className="w-7 h-7 sm:w-8 sm:h-8 p-0 border-none rounded-full bg-transparent cursor-pointer" aria-label="Chat background color" />
                    <span className="text-[9px] sm:text-[10px] text-neutral-400">Color</span>
                  </div>
                  {/* Disable custom image upload if a theme with a bgImage is selected */}
                  {/* In the chat settings modal, always show the custom image upload input, regardless of selectedTheme.bgImage */}
                  <div className="flex flex-col items-center gap-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => {
                        dispatch({ type: 'SET', payload: { fileUploadError: '' } });
                        const file = e.target.files[0];
                        if (file) {
                          if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
                            dispatch({ type: 'SET', payload: { fileUploadError: 'Only JPG, PNG, or GIF images are allowed.' } });
                            return;
                          }
                          if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
                            dispatch({ type: 'SET', payload: { fileUploadError: 'Image is too large (max 3MB).' } });
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (ev) => dispatch({ type: 'SET', payload: { chatBgImage: ev.target.result } });
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="block text-[10px] sm:text-xs text-neutral-400 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-neutral-800 file:text-white hover:file:bg-neutral-700"
                      aria-label="Upload chat background image"
                    />
                    <span className="text-[9px] sm:text-[10px] text-neutral-400">Image</span>
                  </div>
                  {state.fileUploadError && <div className="text-xs text-red-500 mt-1">{state.fileUploadError}</div>}
                  {state.chatBgImage && (
                    <button className="ml-1 p-1 rounded-full bg-neutral-800 hover:bg-neutral-700 transition" onClick={() => dispatch({ type: 'SET', payload: { chatBgImage: '' } })} title="Remove image">
                      <FiX size={13} />
                    </button>
                  )}
                </div>
                {state.chatBgImage && (
                  <div className="relative mt-1">
                    <img src={state.chatBgImage} alt="Chat background preview" className="rounded-lg max-h-12 sm:max-h-16 w-full object-cover border border-neutral-800" />
                    <span className="absolute top-1 right-2 bg-black/70 text-[9px] sm:text-[10px] text-white px-2 py-0.5 rounded-full">Preview</span>
                  </div>
                )}
              </div>
              {/* Bubble Style */}
              <div>
                <div className="text-xs font-semibold text-white mb-1">Bubble Style</div>
                <div className="text-xs text-neutral-400 mb-2">Adjust the color and roundness of chat bubbles for better readability.</div>
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <div className="flex flex-col items-center gap-1">
                    <input type="color" value={state.bubbleColor} onChange={e => dispatch({ type: 'SET', payload: { bubbleColor: e.target.value } })} className="w-7 h-7 sm:w-8 sm:h-8 p-0 border-none rounded-full bg-transparent cursor-pointer" aria-label="Bubble color" />
                    <span className="text-[9px] sm:text-[10px] text-neutral-400">Color</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <input type="range" min={8} max={32} value={state.bubbleRadius} onChange={e => dispatch({ type: 'SET', payload: { bubbleRadius: Number(e.target.value) } })} className="w-20 sm:w-24 accent-neutral-700" aria-label="Bubble border radius" />
                    <span className="text-[9px] sm:text-[10px] text-neutral-400">{state.bubbleRadius}px</span>
                  </div>
                </div>
              </div>
              {/* Font */}
              <div>
                <div className="text-xs font-semibold text-white mb-1">Font</div>
                <div className="text-xs text-neutral-400 mb-2">Choose a font for chat messages. Affects readability and style.</div>
                <select
                  value={state.fontFamily}
                  onChange={e => dispatch({ type: 'SET', payload: { fontFamily: e.target.value } })}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                  aria-label="Chat font"
                >
                  <option value="Inter, sans-serif">Inter</option>
                  <option value="Roboto, sans-serif">Roboto</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="Courier New, monospace">Courier New</option>
                  <option value="system-ui, sans-serif">System UI</option>
                </select>
              </div>
            </div>
            {/* Footer */}
            <div className="flex gap-2 justify-end px-3 sm:px-5 py-3 sm:py-4 border-t border-neutral-800 bg-neutral-950">
              <button
                className="px-2.5 sm:px-3 py-1 text-xs font-medium rounded bg-neutral-800 text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none transition-all"
                onClick={clearChatSettings}
                title="Reset all chat appearance settings"
              >
                Reset
              </button>
              <button
                className="px-2.5 sm:px-3 py-1 text-xs font-medium rounded bg-white text-black hover:bg-neutral-200 focus:bg-neutral-300 focus:outline-none transition-all"
                onClick={() => dispatch({ type: 'SET', payload: { showChatSettings: false } })}
                title="Close settings"
              >
                Close
              </button>
            </div>
            <span tabIndex={-1} aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
});

ChatBox.propTypes = {
  socket: PropTypes.object,
  sessionId: PropTypes.string,
  clientId: PropTypes.string,
  displayName: PropTypes.string,
  messages: PropTypes.array,
  clients: PropTypes.array,
  mobile: PropTypes.bool,
  isChatTabActive: PropTypes.bool,
  markDelivered: PropTypes.func,
};

export default ChatBox;