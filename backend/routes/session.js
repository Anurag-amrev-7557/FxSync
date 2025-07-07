import express from 'express';
import { generateSessionId } from '../utils/utils.js';
import { getAllSessions } from '../managers/sessionManager.js';

const router = express.Router();

router.get('/generate-session-id', (req, res) => {
  const sessions = getAllSessions();
  const id = generateSessionId(new Set(Object.keys(sessions)));
  res.json({ sessionId: id });
});

router.get('/session-info/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sessions = getAllSessions();
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    sessionId,
    isPlaying: session.isPlaying,
    timestamp: session.timestamp,
    lastUpdated: session.lastUpdated,
    controllerId: session.controllerId,
    clients: Array.from(session.clients.entries()).map(([id, info]) => ({ id, ...info })),
    queue: session.queue
  });
});

export default router; 