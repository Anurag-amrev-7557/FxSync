// Use a null-prototype object for slightly faster property access and to avoid prototype pollution
const sessions = Object.create(null);

export function getSession(sessionId) {
  // Defensive: avoid prototype pollution
  return Object.prototype.hasOwnProperty.call(sessions, sessionId) ? sessions[sessionId] : undefined;
}

export function createSession(sessionId, controllerId, controllerClientId) {
  const session = Object.create(null);
  session.isPlaying = false;
  session.timestamp = 0;
  session.lastUpdated = Date.now();
  session.controllerId = controllerId || null;
  session.controllerClientId = controllerClientId || null;
  session.clients = new Map();
  session.queue = [];
  session.selectedTrackIdx = 0;
  session.pendingControllerRequests = new Map();
  sessions[sessionId] = session;
  return session;
}

export function deleteSession(sessionId) {
  if (Object.prototype.hasOwnProperty.call(sessions, sessionId)) {
    const s = sessions[sessionId];
    if (s) {
      if (s.clients) s.clients.clear();
      if (s.queue) s.queue.length = 0;
      if (s.pendingControllerRequests) s.pendingControllerRequests.clear();
    }
    delete sessions[sessionId];
  }
}

export function addClient(sessionId, socketId, displayName, deviceInfo, clientId) {
  const session = sessions[sessionId];
  if (!session) return;
  let name = displayName;
  if (!name) {
    const id = socketId || '';
    name = 'User-' + id.substring(id.length - 4);
  }
  session.clients.set(socketId, {
    displayName: name,
    deviceInfo: deviceInfo || '',
    clientId: clientId || null
  });
}

export function removeClient(sessionId, socketId) {
  const session = sessions[sessionId];
  if (!session) return;
  session.clients.delete(socketId);
}

export function setController(sessionId, clientId) {
  const session = sessions[sessionId];
  if (!session) return;
  session.controllerClientId = clientId;
  let socketId = null;
  for (const [sid, info] of session.clients) {
    if (info.clientId === clientId) {
      socketId = sid;
      break;
    }
  }
  session.controllerId = socketId;
  session.lastUpdated = Date.now();
}

export function getAllSessions() {
  return sessions;
}

export function getClients(sessionId) {
  const session = sessions[sessionId];
  if (!session) return [];
  const clients = session.clients;
  if (!clients || clients.size === 0) return [];
  const arr = new Array(clients.size);
  let i = 0;
  for (const [id, info] of clients) {
    arr[i++] = {
      id,
      displayName: info.displayName,
      deviceInfo: info.deviceInfo,
      clientId: info.clientId
    };
  }
  return arr;
}

export function updatePlayback(sessionId, { isPlaying, timestamp, controllerId }) {
  const s = sessions[sessionId];
  if (!s) return;
  const now = Date.now();
  s.isPlaying = isPlaying;
  s.timestamp = timestamp;
  s.lastUpdated = now;
  s.controllerId = controllerId;
}

export function updateTimestamp(sessionId, timestamp, controllerId) {
  const s = sessions[sessionId];
  if (!s) return;
  const now = Date.now();
  s.timestamp = timestamp;
  s.lastUpdated = now;
  s.controllerId = controllerId;
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
  for (const [socketId, info] of session.clients) {
    if (info.clientId === clientId) return socketId;
  }
  return null;
}

export function addControllerRequest(sessionId, requesterClientId, requesterName) {
  const s = sessions[sessionId];
  if (!s) return false;
  let name = requesterName;
  if (!name) {
    const idLen = requesterClientId ? requesterClientId.length : 0;
    name = 'User-' + (idLen > 4 ? requesterClientId.substring(idLen - 4) : requesterClientId);
  }
  s.pendingControllerRequests.set(requesterClientId, {
    requestTime: Date.now(),
    requesterName: name
  });
  return true;
}

export function removeControllerRequest(sessionId, requesterClientId) {
  const s = sessions[sessionId];
  if (!s) return false;
  return s.pendingControllerRequests.delete(requesterClientId);
}

export function getPendingControllerRequests(sessionId) {
  const s = sessions[sessionId];
  if (!s) return [];
  const reqs = s.pendingControllerRequests;
  if (!reqs || reqs.size === 0) return [];
  const arr = new Array(reqs.size);
  let i = 0;
  for (const [clientId, request] of reqs) {
    arr[i++] = {
      clientId,
      requestTime: request.requestTime,
      requesterName: request.requesterName
    };
  }
  return arr;
}

export function clearExpiredControllerRequests(sessionId) {
  const s = sessions[sessionId];
  if (!s) return;
  const reqs = s.pendingControllerRequests;
  if (!reqs || reqs.size === 0) return;
  const now = Date.now();
  const REQUEST_TIMEOUT = 5 * 60 * 1000;
  const expired = [];
  for (const [clientId, request] of reqs) {
    if (now - request.requestTime > REQUEST_TIMEOUT) {
      expired.push(clientId);
    }
  }
  for (let i = 0; i < expired.length; ++i) {
    reqs.delete(expired[i]);
  }
}

export function setSelectedTrackIdx(sessionId, idx) {
  const s = sessions[sessionId];
  if (!s) return;
  s.selectedTrackIdx = idx;
  s.lastUpdated = Date.now();
}