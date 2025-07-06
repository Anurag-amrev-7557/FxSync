// Track uploaded files per sessionId and clientId
const sessionFiles = {};

export function addSessionFile(sessionId, clientId, filename) {
  if (!sessionFiles[sessionId]) sessionFiles[sessionId] = {};
  if (!sessionFiles[sessionId][clientId]) sessionFiles[sessionId][clientId] = [];
  sessionFiles[sessionId][clientId].push(filename);
}

export function getSessionFiles(sessionId) {
  return sessionFiles[sessionId] || {};
}

export function removeSessionFiles(sessionId) {
  delete sessionFiles[sessionId];
} 