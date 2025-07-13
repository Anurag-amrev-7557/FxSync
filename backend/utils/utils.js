const adjectives = ['blue', 'green', 'red', 'fast', 'cool', 'bright', 'lucky'];
const nouns = ['moon', 'star', 'cloud', 'river', 'tree', 'wolf', 'hawk'];

export function generateSessionId(existingIds = new Set()) {
  let id;
  do {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(10 + Math.random() * 90);
    id = `${adj}-${noun}-${num}`;
  } while (existingIds.has(id));
  return id;
}

export function isValidSessionId(id) {
  return typeof id === 'string' && id.length > 0;
}

export function log(...args) {
  // Production logging removed
} 