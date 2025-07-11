import { getSession } from './sessionManager.js';

export function addToQueue(sessionId, url, title) {
  const session = getSession(sessionId);
  if (!session) return false;
  session.queue.push({ url, title: title || url });
  return true;
}

export function removeFromQueue(sessionId, index) {
  const session = getSession(sessionId);
  if (!session || index < 0 || index >= session.queue.length) return false;
  session.queue.splice(index, 1);
  return true;
}

export function getQueue(sessionId) {
  const session = getSession(sessionId);
  return session ? session.queue : [];
} 