import express from 'express';
import { generateSessionId } from '../utils/utils.js';
import { getAllSessions } from '../managers/sessionManager.js';
import { param, validationResult } from 'express-validator';

const router = express.Router();

router.get('/generate-session-id', (req, res) => {
  const sessions = getAllSessions();
  const id = generateSessionId(new Set(Object.keys(sessions)));
  res.json({ sessionId: id });
});

router.get(
  '/session-info/:sessionId',
  [
    param('sessionId')
      .isString()
      .isLength({ min: 1, max: 64 })
      .withMessage('Session ID must be 1-64 characters long')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Session ID must be alphanumeric (plus _ and -)'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
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
      queue: session.queue,
    });
  }
);

export default router;
