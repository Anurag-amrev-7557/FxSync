import express from 'express';
import { generateSessionId } from '../utils/utils.js';
import { getAllSessions } from '../managers/sessionManager.js';

const router = express.Router();

// Cache for session IDs to avoid repeated Object.keys/set creation
let cachedSessionIds = null;
let lastSessionCacheTime = 0;
const SESSION_CACHE_TTL = 1000; // 1 second

function getCachedSessionIds() {
  const now = Date.now();
  if (!cachedSessionIds || now - lastSessionCacheTime > SESSION_CACHE_TTL) {
    const sessions = getAllSessions();
    cachedSessionIds = new Set(Object.keys(sessions));
    lastSessionCacheTime = now;
  }
  return cachedSessionIds;
}

// Fast session ID generation with cached session IDs
router.get('/generate-session-id', (req, res) => {
  const id = generateSessionId(getCachedSessionIds());
  // Add to cache immediately to avoid race on next call
  cachedSessionIds.add(id);
  res.json({ sessionId: id });
});

// Fast session info retrieval, minimize object creation
router.get('/session-info/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sessions = getAllSessions();
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Avoid unnecessary array creation if no clients
  let clientsArr;
  if (session.clients && session.clients.size > 0) {
    // Preallocate array for performance
    clientsArr = new Array(session.clients.size);
    let i = 0;
    for (const [id, info] of session.clients.entries()) {
      clientsArr[i++] = { id, ...info };
    }
  } else {
    clientsArr = [];
  }

  // Send only necessary fields, avoid extra object spread
  res.json({
    sessionId,
    isPlaying: session.isPlaying,
    timestamp: session.timestamp,
    lastUpdated: session.lastUpdated,
    controllerId: session.controllerId,
    clients: clientsArr,
    queue: session.queue
  });
});

export default router;