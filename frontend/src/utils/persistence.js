// Utility functions for localStorage persistence

const STORAGE_KEYS = {
  MESSAGES: 'fxsync_messages',
  QUEUE: 'fxsync_queue',
  SESSION_DATA: 'fxsync_session_data'
};

// Get storage key for a specific session
const getSessionKey = (baseKey, sessionId) => `${baseKey}_${sessionId}`;

// Save messages for a session
export function saveMessages(sessionId, messages) {
  try {
    const key = `messages_${sessionId}`;
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    // Production logging removed
  }
}

// Load messages for a session
export function loadMessages(sessionId) {
  try {
    const key = `messages_${sessionId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    // Production logging removed
    return [];
  }
}

// Save queue for a session
export function saveQueue(sessionId, queue) {
  try {
    const key = `queue_${sessionId}`;
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (error) {
    // Production logging removed
  }
}

// Load queue for a session
export function loadQueue(sessionId) {
  try {
    const key = `queue_${sessionId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    // Production logging removed
    return [];
  }
}

// Save session data (display name, etc.)
export function saveSessionData(sessionId, data) {
  try {
    const key = `session_${sessionId}`;
    localStorage.setItem(key, JSON.stringify({
      ...data,
      timestamp: Date.now()
    }));
  } catch (error) {
    // Production logging removed
  }
}

// Load session data
export function loadSessionData(sessionId) {
  try {
    const key = `session_${sessionId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    // Production logging removed
    return null;
  }
}

// Clear all data for a session
export function clearSessionData(sessionId) {
  try {
    const keys = [
      `messages_${sessionId}`,
      `queue_${sessionId}`,
      `session_${sessionId}`
    ];
    keys.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    // Production logging removed
  }
}

// Clean up old session data (keep only last 10 sessions)
export function cleanupOldSessions(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
  try {
    const now = Date.now();
    const keys = Object.keys(localStorage);
    const sessionKeys = keys.filter(key => key.startsWith('session_'));
    
    sessionKeys.forEach(key => {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          const sessionData = JSON.parse(data);
          if (sessionData.timestamp && (now - sessionData.timestamp) > maxAge) {
            const sessionId = key.replace('session_', '');
            clearSessionData(sessionId);
          }
        }
      } catch (error) {
        // Production logging removed
      }
    });
  } catch (error) {
    // Production logging removed
  }
} 