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
    queue: []
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
}

export function updateTimestamp(sessionId, timestamp, controllerId) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].timestamp = timestamp;
  sessions[sessionId].lastUpdated = Date.now();
  sessions[sessionId].controllerId = controllerId;
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