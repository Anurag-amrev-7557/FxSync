// Utility functions for localStorage persistence

const STORAGE_KEYS = {
  MESSAGES: 'fxsync_messages',
  QUEUE: 'fxsync_queue',
  SESSION_DATA: 'fxsync_session_data',
  MOBILE_TAB: 'fxsync_mobile_tab',
};

// Get storage key for a specific session
const getSessionKey = (baseKey, sessionId) => `${baseKey}_${sessionId}`;

// Save messages for a session
export const saveMessages = (sessionId, messages) => {
  try {
    const key = getSessionKey(STORAGE_KEYS.MESSAGES, sessionId);
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.warn('Failed to save messages to localStorage:', error);
  }
};

// Load messages for a session
export const loadMessages = (sessionId) => {
  try {
    const key = getSessionKey(STORAGE_KEYS.MESSAGES, sessionId);
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Failed to load messages from localStorage:', error);
    return [];
  }
};

// Save queue for a session
export const saveQueue = (sessionId, queue) => {
  try {
    const key = getSessionKey(STORAGE_KEYS.QUEUE, sessionId);
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (error) {
    console.warn('Failed to save queue to localStorage:', error);
  }
};

// Load queue for a session
export const loadQueue = (sessionId) => {
  try {
    const key = getSessionKey(STORAGE_KEYS.QUEUE, sessionId);
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Failed to load queue from localStorage:', error);
    return [];
  }
};

// Save session data (display name, etc.)
export const saveSessionData = (sessionId, data) => {
  try {
    const key = getSessionKey(STORAGE_KEYS.SESSION_DATA, sessionId);
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save session data to localStorage:', error);
  }
};

// Load session data
export const loadSessionData = (sessionId) => {
  try {
    const key = getSessionKey(STORAGE_KEYS.SESSION_DATA, sessionId);
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Failed to load session data from localStorage:', error);
    return null;
  }
};

const GLOBAL_MOBILE_TAB_KEY = 'fxsync_mobile_tab_global';

// Save mobile tab for a session or globally
export const saveMobileTab = (sessionId, mobileTab) => {
  try {
    const key = sessionId
      ? getSessionKey(STORAGE_KEYS.MOBILE_TAB, sessionId)
      : GLOBAL_MOBILE_TAB_KEY;
    localStorage.setItem(key, JSON.stringify(mobileTab));
  } catch (error) {
    console.warn('Failed to save mobile tab to localStorage:', error);
  }
};

// Load mobile tab for a session or globally
export const loadMobileTab = (sessionId) => {
  try {
    const key = sessionId
      ? getSessionKey(STORAGE_KEYS.MOBILE_TAB, sessionId)
      : GLOBAL_MOBILE_TAB_KEY;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : 0; // Default to 0 (audio tab)
  } catch (error) {
    console.warn('Failed to load mobile tab from localStorage:', error);
    return 0;
  }
};

// Clear all data for a session
export const clearSessionData = (sessionId) => {
  try {
    const keys = [
      getSessionKey(STORAGE_KEYS.MESSAGES, sessionId),
      getSessionKey(STORAGE_KEYS.QUEUE, sessionId),
      getSessionKey(STORAGE_KEYS.SESSION_DATA, sessionId),
      getSessionKey(STORAGE_KEYS.MOBILE_TAB, sessionId),
    ];
    keys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn('Failed to clear session data from localStorage:', error);
  }
};

// Clean up old session data (keep only last 10 sessions)
export const cleanupOldSessions = () => {
  try {
    const allKeys = Object.keys(localStorage);
    const sessionKeys = allKeys.filter((key) => key.startsWith('fxsync_'));

    // Group by session ID
    const sessions = {};
    sessionKeys.forEach((key) => {
      const parts = key.split('_');
      if (parts.length >= 3) {
        const sessionId = parts.slice(2).join('_');
        if (!sessions[sessionId]) {
          sessions[sessionId] = [];
        }
        sessions[sessionId].push(key);
      }
    });

    // Keep only the 10 most recent sessions
    const sessionIds = Object.keys(sessions);
    if (sessionIds.length > 10) {
      const sessionsToRemove = sessionIds.slice(10);
      sessionsToRemove.forEach((sessionId) => {
        sessions[sessionId].forEach((key) => localStorage.removeItem(key));
      });
    }
  } catch (error) {
    console.warn('Failed to cleanup old sessions:', error);
  }
};
