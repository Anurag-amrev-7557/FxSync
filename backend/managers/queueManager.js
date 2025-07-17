import { getSession } from './sessionManager.js';

// Helper to sanitize track titles
function safeTitle(title) {
  if (typeof title !== 'string') return '';
  // Remove HTML tags and limit to 128 chars
  return title.replace(/<[^>]*>/g, '').slice(0, 128);
}

export function addToQueue(sessionId, url, title) {
  const session = getSession(sessionId);
  if (!session) return false;
  session.queue.push({ url, title: safeTitle(title || url) });
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

 