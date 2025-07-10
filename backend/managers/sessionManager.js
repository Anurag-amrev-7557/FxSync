const sessions = {};

export function getSession(sessionId) {
  return sessions[sessionId];
}

export function createSession(sessionId, controllerId, controllerClientId) {
  sessions[sessionId] = {
    isPlaying: false,
    timestamp: 0,
    lastUpdated: Date.now(),
    controllerId,
    controllerClientId,
    clients: new Map(), // Map<socketId, {displayName, deviceInfo, clientId}>
    queue: [],
    selectedTrackIdx: 0,
    pendingControllerRequests: new Map(), // Map<clientId, {requestTime, requesterName}>
    syncSeq: 0 // Add syncSeq property
  };
  return sessions[sessionId];
}

export function deleteSession(sessionId) {
  delete sessions[sessionId];
}

export function addClient(sessionId, socketId, displayName, deviceInfo, clientId) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].clients.set(socketId, {
    displayName: displayName || `User-${socketId.slice(-4)}`,
    deviceInfo: deviceInfo || '',
    clientId: clientId || null
  });
}

export function removeClient(sessionId, socketId) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].clients.delete(socketId);
}

export function setController(sessionId, clientId) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].controllerClientId = clientId;
  // Find the socketId for this clientId
  const socketId = getSocketIdByClientId(sessionId, clientId);
  sessions[sessionId].controllerId = socketId;
  sessions[sessionId].lastUpdated = Date.now();
}

export function getAllSessions() {
  return sessions;
}

export function getClients(sessionId) {
  if (!sessions[sessionId]) return [];
  return Array.from(sessions[sessionId].clients.entries()).map(([id, info]) => ({ id, ...info }));
}

export function updatePlayback(sessionId, { isPlaying, timestamp, controllerId }) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].isPlaying = isPlaying;
  sessions[sessionId].timestamp = timestamp;
  sessions[sessionId].lastUpdated = Date.now();
  sessions[sessionId].controllerId = controllerId;
  sessions[sessionId].syncSeq = (sessions[sessionId].syncSeq || 0) + 1; // Increment syncSeq
}

export function updateTimestamp(sessionId, timestamp, controllerId) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].timestamp = timestamp;
  sessions[sessionId].lastUpdated = Date.now();
  sessions[sessionId].controllerId = controllerId;
  sessions[sessionId].syncSeq = (sessions[sessionId].syncSeq || 0) + 1; // Increment syncSeq
}

export function getClientIdBySocket(sessionId, socketId) {
  const session = sessions[sessionId];
  if (!session) return null;
  const client = session.clients.get(socketId);
  return client ? client.clientId : null;
}

export function getSocketIdByClientId(sessionId, clientId) {
  const session = sessions[sessionId];
  if (!session) return null;
  for (const [socketId, info] of session.clients.entries()) {
    if (info.clientId === clientId) return socketId;
  }
  return null;
}

export function addControllerRequest(sessionId, requesterClientId, requesterName) {
  if (!sessions[sessionId]) return false;
  sessions[sessionId].pendingControllerRequests.set(requesterClientId, {
    requestTime: Date.now(),
    requesterName: requesterName || `User-${requesterClientId.slice(-4)}`
  });
  return true;
}

export function removeControllerRequest(sessionId, requesterClientId) {
  if (!sessions[sessionId]) return false;
  return sessions[sessionId].pendingControllerRequests.delete(requesterClientId);
}

export function getPendingControllerRequests(sessionId) {
  if (!sessions[sessionId]) return [];
  return Array.from(sessions[sessionId].pendingControllerRequests.entries()).map(([clientId, request]) => ({
    clientId,
    ...request
  }));
}

export function clearExpiredControllerRequests(sessionId) {
  if (!sessions[sessionId]) return;
  const now = Date.now();
  const REQUEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  for (const [clientId, request] of sessions[sessionId].pendingControllerRequests.entries()) {
    if (now - request.requestTime > REQUEST_TIMEOUT) {
      sessions[sessionId].pendingControllerRequests.delete(clientId);
    }
  }
}

export function setSelectedTrackIdx(sessionId, idx) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].selectedTrackIdx = idx;
  sessions[sessionId].lastUpdated = Date.now();
  sessions[sessionId].syncSeq = (sessions[sessionId].syncSeq || 0) + 1; // Increment syncSeq
} 