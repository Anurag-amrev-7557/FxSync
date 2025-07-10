/**
 * Enhanced UUID v4 generator using crypto API if available for better randomness.
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Use crypto for secure random UUID
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);

    // Per RFC4122 v4
    buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
    buf[8] = (buf[8] & 0x3f) | 0x80; // variant 10

    const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20)
    );
  } else {
    // Fallback to Math.random (less secure)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

/**
 * Enhanced client ID getter:
 * - Uses localStorage for persistence.
 * - Falls back to sessionStorage if localStorage is unavailable.
 * - Optionally allows force regeneration.
 * - Validates UUID format.
 */
export function getClientId({ forceNew = false } = {}) {
  let clientId = null;

  // Helper to validate UUID v4 format
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  try {
    if (!forceNew) {
      clientId = localStorage.getItem('clientId');
      if (!clientId && typeof sessionStorage !== 'undefined') {
        clientId = sessionStorage.getItem('clientId');
      }
    }
  } catch (e) {
    // localStorage/sessionStorage may be unavailable (privacy mode, etc)
    clientId = null;
  }

  if (!clientId || !uuidV4Regex.test(clientId) || forceNew) {
    clientId = generateUUID();
    try {
      localStorage.setItem('clientId', clientId);
    } catch (e) {
      // Fallback to sessionStorage if localStorage fails
      try {
        sessionStorage.setItem('clientId', clientId);
      } catch (e2) {
        // If all fails, just return the generated UUID (not persistent)
      }
    }
  }

  return clientId;
}