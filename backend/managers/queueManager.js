import { getSession } from './sessionManager.js';

export function addToQueue(sessionId, url, title, meta = {}) {
  const session = getSession(sessionId);
  if (!session) return false;
  if (typeof url !== 'string' || !url) return false;
  session.queue.push({ url, title: typeof title === 'string' ? title : url, meta });
  return true;
}

export function removeFromQueue(sessionId, index) {
  const session = getSession(sessionId);
  if (!session || typeof index !== 'number' || index < 0 || index >= session.queue.length) return false;
  session.queue.splice(index, 1);
  if (session.queue.length === 0) {
    session.selectedTrackIdx = null;
  }
  return true;
}

export function getQueue(sessionId) {
  const session = getSession(sessionId);
  return session ? session.queue : [];
} 