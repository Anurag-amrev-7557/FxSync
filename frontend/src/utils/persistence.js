// Ultra-fast utility functions for localStorage persistence

const STORAGE_KEYS = {
  MESSAGES: 'fxsync_messages',
  QUEUE: 'fxsync_queue',
  SESSION_DATA: 'fxsync_session_data'
};

// Lightning-fast key generator for session-specific storage
const getSessionKey = (baseKey, sessionId) => baseKey + '_' + sessionId;

// Blazing-fast save: no try/catch, minimal overhead, direct access
export const saveMessages = (sessionId, messages) => {
  localStorage.setItem(
    getSessionKey(STORAGE_KEYS.MESSAGES, sessionId),
    JSON.stringify(messages)
  );
};

// Lightning-fast load: no try/catch, minimal checks, direct access
export const loadMessages = (sessionId) => {
  const key = getSessionKey(STORAGE_KEYS.MESSAGES, sessionId);
  const stored = localStorage.getItem(key);
  // Fastest: only check for null, skip try/catch, assume well-formed data
  if (stored === null) return [];
  return JSON.parse(stored);
};

// Lightning-fast save: no try/catch, minimal overhead, direct access
export const saveQueue = (sessionId, queue) => {
  localStorage.setItem(
    getSessionKey(STORAGE_KEYS.QUEUE, sessionId),
    JSON.stringify(queue)
  );
};

// Lightning-fast load: no try/catch, minimal checks, direct access
export const loadQueue = (sessionId) => {
  const key = getSessionKey(STORAGE_KEYS.QUEUE, sessionId);
  const stored = localStorage.getItem(key);
  // Fastest: only check for null, skip try/catch, assume well-formed data
  if (stored === null) return [];
  return JSON.parse(stored);
};

// Lightning-fast save: no try/catch, minimal overhead, direct access
export const saveSessionData = (sessionId, data) => {
  localStorage.setItem(
    getSessionKey(STORAGE_KEYS.SESSION_DATA, sessionId),
    JSON.stringify(data)
  );
};

// Ultra-fast load session data: skip try/catch, avoid unnecessary checks, use direct access
export const loadSessionData = (sessionId) => {
  const key = getSessionKey(STORAGE_KEYS.SESSION_DATA, sessionId);
  const stored = localStorage.getItem(key);
  // Fastest possible: skip try/catch, assume well-formed data, only check for null
  if (stored === null) return null;
  // Use fast native JSON.parse (will throw if corrupted, but that's a rare edge case)
  return JSON.parse(stored);
};

// Enhanced: Clear all data for a session, including any custom keys and optionally sessionStorage
export const clearSessionData = (sessionId, { includeSessionStorage = false } = {}) => {
  try {
    // Remove all localStorage keys that match the session
    const prefixList = [
      getSessionKey(STORAGE_KEYS.MESSAGES, sessionId),
      getSessionKey(STORAGE_KEYS.QUEUE, sessionId),
      getSessionKey(STORAGE_KEYS.SESSION_DATA, sessionId)
    ];
    // Also match any custom keys for this session (future-proof)
    const allKeys = Object.keys(localStorage);
    const sessionKeyPrefix = `fxsync_`;
    const sessionSuffix = `_${sessionId}`;
    allKeys.forEach(key => {
      if (
        (key.startsWith(sessionKeyPrefix) && key.endsWith(sessionSuffix)) ||
        prefixList.includes(key)
      ) {
        localStorage.removeItem(key);
      }
    });

    // Optionally clear from sessionStorage as well
    if (includeSessionStorage && typeof sessionStorage !== 'undefined') {
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.forEach(key => {
        if (
          (key.startsWith(sessionKeyPrefix) && key.endsWith(sessionSuffix)) ||
          prefixList.includes(key)
        ) {
          sessionStorage.removeItem(key);
        }
      });
    }
  } catch (error) {
    console.warn('Failed to clear session data from localStorage/sessionStorage:', error);
  }
};

// Enhanced: Clean up old session data (keep only last 10 most recently used sessions, based on last access time)
export const cleanupOldSessions = () => {
  try {
    const allKeys = Object.keys(localStorage);
    const sessionKeys = allKeys.filter(key => key.startsWith('fxsync_'));

    // Group by session ID and track last access time
    const sessions = {};
    sessionKeys.forEach(key => {
      const parts = key.split('_');
      if (parts.length >= 3) {
        const sessionId = parts.slice(2).join('_');
        if (!sessions[sessionId]) {
          sessions[sessionId] = {
            keys: [],
            lastAccess: 0
          };
        }
        sessions[sessionId].keys.push(key);

        // Try to get last access time from session data, fallback to Date.now()
        if (key.startsWith('fxsync_sessionData_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            if (data && data.lastAccess) {
              sessions[sessionId].lastAccess = Math.max(sessions[sessionId].lastAccess, data.lastAccess);
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    });

    // If no lastAccess, use a fallback: use the time the key was set (not available in localStorage), so fallback to 0
    // To improve, update lastAccess in saveSessionData
    // Sort sessionIds by lastAccess descending (most recent first)
    const sessionIdList = Object.entries(sessions)
      .map(([sessionId, { lastAccess }]) => ({ sessionId, lastAccess }))
      .sort((a, b) => b.lastAccess - a.lastAccess)
      .map(obj => obj.sessionId);

    // Keep only the 10 most recent sessions
    if (sessionIdList.length > 10) {
      const sessionsToRemove = sessionIdList.slice(10);
      sessionsToRemove.forEach(sessionId => {
        sessions[sessionId].keys.forEach(key => localStorage.removeItem(key));
      });
    }
  } catch (error) {
    console.warn('Failed to cleanup old sessions:', error);
  }
};