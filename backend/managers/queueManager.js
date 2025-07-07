import { getSession } from './sessionManager.js';

// Use a pool of queue item objects to minimize allocations
const queueItemPool = [];
let poolPtr = 0;

function getQueueItem(url, title) {
  let item;
  if (poolPtr > 0) {
    item = queueItemPool[--poolPtr];
  } else {
    item = { url: '', title: '' };
  }
  item.url = url;
  item.title = title || url;
  return item;
}

function releaseQueueItem(item) {
  // Optionally clear fields for GC, but not strictly necessary
  item.url = '';
  item.title = '';
  if (poolPtr < 128) { // Cap pool size to avoid unbounded growth
    queueItemPool[poolPtr++] = item;
  }
}

export function addToQueue(sessionId, url, title) {
  const session = getSession(sessionId);
  if (!session) return false;
  // Use pooled object to minimize allocations
  session.queue.push(getQueueItem(url, title));
  return true;
}

export function removeFromQueue(sessionId, index) {
  const session = getSession(sessionId);
  if (!session) return false;
  const q = session.queue;
  const len = q.length;
  if ((index | 0) !== index || index < 0 || index >= len) return false;
  // O(1) removal: swap with last, pop, release removed object to pool
  if (index !== len - 1) {
    // Release the item being overwritten
    releaseQueueItem(q[index]);
    q[index] = q[len - 1];
  }
  releaseQueueItem(q[len - 1]);
  q.length = len - 1;
  return true;
}

export function getQueue(sessionId) {
  const session = getSession(sessionId);
  // Return the actual array reference for performance (caller beware: do not mutate)
  return session ? session.queue : [];
}