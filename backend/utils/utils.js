// Precompute lengths for faster access
const adjectives = ['blue', 'green', 'red', 'fast', 'cool', 'bright', 'lucky'];
const nouns = ['moon', 'star', 'cloud', 'river', 'tree', 'wolf', 'hawk'];
const ADJ_LEN = adjectives.length;
const NOUN_LEN = nouns.length;

// Use a fast random integer generator
function fastRandomInt(max) {
  // Math.random() * max is slightly faster than Math.floor(Math.random() * max)
  // but we need an integer, so use |0 for bitwise floor
  return (Math.random() * max) | 0;
}

export function generateSessionId(existingIds = new Set()) {
  let id, adj, noun, num;
  do {
    adj = adjectives[fastRandomInt(ADJ_LEN)];
    noun = nouns[fastRandomInt(NOUN_LEN)];
    // Avoid Math.floor for two randoms, just one
    num = 10 + fastRandomInt(90 - 10); // 10..89
    id = adj + '-' + noun + '-' + num;
  } while (existingIds.has(id));
  return id;
}

// Use regex for fast validation (pattern: adj-noun-num)
const sessionIdPattern = /^[a-z]+-[a-z]+-\d{2}$/;
export function isValidSessionId(id) {
  return typeof id === 'string' && sessionIdPattern.test(id);
}

// Cache NODE_ENV for faster log checks
const isDev = process.env.NODE_ENV !== 'production';
export function log(...args) {
  if (isDev) {
    // Use a single argument for better V8 optimization
    if (args.length === 1) {
      console.log('[Backend]', args[0]);
    } else {
      console.log('[Backend]', ...args);
    }
  }
}