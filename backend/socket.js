import {
  getSession,
  createSession,
  deleteSession,
  addClient,
  removeClient,
  setController,
  getAllSessions,
  getClients,
  updatePlayback,
  updateTimestamp,
  getClientIdBySocket,
  getSocketIdByClientId,
  addControllerRequest,
  removeControllerRequest,
  getPendingControllerRequests,
  clearExpiredControllerRequests,
} from './managers/sessionManager.js';
import { addToQueue, removeFromQueue, getQueue } from './managers/queueManager.js';
import { formatChatMessage, formatReaction } from './managers/chatManager.js';
import { log } from './utils/utils.js';
import { getSessionFiles, removeSessionFiles } from './managers/fileManager.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as mm from 'music-metadata';
dotenv.config();

// Helper to build full session sync state for advanced sync
function buildSessionSyncState(session) {
  const queue = Array.isArray(session.queue) ? session.queue : [];
  const selectedTrackIdx = Number.isInteger(session.selectedTrackIdx)
    ? session.selectedTrackIdx
    : 0;
  const currentTrack = queue.length > 0 && queue[selectedTrackIdx] ? queue[selectedTrackIdx] : null;
  return {
    isPlaying: !!session.isPlaying,
    timestamp: typeof session.timestamp === 'number' ? session.timestamp : 0,
    lastUpdated: typeof session.lastUpdated === 'number' ? session.lastUpdated : Date.now(),
    controllerId: session.controllerId || null,
    controllerClientId: session.controllerClientId || null,
    queue,
    selectedTrackIdx,
    currentTrack,
    sessionSettings: session.settings || {},
    drift: typeof session.drift === 'number' ? session.drift : null,
  };
}

// Simple HTML escape utility
function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, function (tag) {
    const charsToReplace = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return charsToReplace[tag] || tag;
  });
}

// --- In-memory chat message storage per session ---
function getSessionMessages(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  if (!session.messages) session.messages = [];
  return session.messages;
}

// Add message reaction storage per session
function getSessionReactions(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  if (!session.reactions) session.reactions = new Map(); // messageId -> { emoji: { count: number, users: Set } }
  return session.reactions;
}

// Helper to aggregate reactions for a message
function aggregateReactions(reactions) {
  if (!reactions) return [];
  const aggregated = [];
  for (const [emoji, data] of reactions.entries()) {
    aggregated.push({
      emoji,
      count: data.count,
      users: Array.from(data.users),
    });
  }
  return aggregated.sort((a, b) => b.count - a.count); // Sort by count descending
}

// --- Validation helpers ---
function isValidSessionId(id) {
  return typeof id === 'string' && id.length >= 1 && id.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(id);
}
function isValidDisplayName(name) {
  return typeof name === 'string' && name.length >= 1 && name.length <= 64;
}
function isValidClientId(id) {
  return typeof id === 'string' && id.length >= 1 && id.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(id);
}
function isValidTimestamp(ts) {
  return typeof ts === 'number' && isFinite(ts) && ts >= 0;
}
// Helper to sanitize displayName
function safeDisplayName(name) {
  if (typeof name !== 'string') return '';
  // Remove HTML tags and limit to 64 chars
  return name.replace(/<[^>]*>/g, '').slice(0, 64);
}

// --- Rate limiting state ---
// Use a fixed-size ring buffer for each socket to track timestamps efficiently
const chatRateLimit = {};
const CHAT_LIMIT = 5;
const CHAT_WINDOW_MS = 3000;
class TimestampRingBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = new Array(size).fill(0);
    this.index = 0;
    this.count = 0;
  }
  add(ts) {
    this.buffer[this.index] = ts;
    this.index = (this.index + 1) % this.size;
    if (this.count < this.size) this.count++;
  }
  countRecent(now, windowMs) {
    let c = 0;
    for (let i = 0; i < this.count; i++) {
      if (now - this.buffer[i] < windowMs) c++;
    }
    return c;
  }
}

// At the top, add a syncVersion map
const syncVersionMap = {};

function getSyncVersion(sessionId) {
  if (!syncVersionMap[sessionId]) syncVersionMap[sessionId] = 1;
  return syncVersionMap[sessionId];
}
function incrementSyncVersion(sessionId) {
  if (!syncVersionMap[sessionId]) syncVersionMap[sessionId] = 1;
  else syncVersionMap[sessionId]++;
  return syncVersionMap[sessionId];
}

// --- Add timestamp smoothing for each session ---
const sessionTimestampHistory = {};
function getSmoothedTimestamp(sessionId, newTimestamp) {
  if (!sessionTimestampHistory[sessionId]) sessionTimestampHistory[sessionId] = [];
  const history = sessionTimestampHistory[sessionId];
  history.push(newTimestamp);
  if (history.length > 5) history.shift();
  // Simple moving average
  return history.reduce((a, b) => a + b, 0) / history.length;
}

export function setupSocket(io) {
  // --- Rate limiting state ---
  // Use a fixed-size ring buffer for each socket to track timestamps efficiently
  const chatRateLimit = {};
  const CHAT_LIMIT = 5;
  const CHAT_WINDOW_MS = 3000;
  class TimestampRingBuffer {
    constructor(size) {
      this.size = size;
      this.buffer = new Array(size).fill(0);
      this.index = 0;
      this.count = 0;
    }
    add(ts) {
      this.buffer[this.index] = ts;
      this.index = (this.index + 1) % this.size;
      if (this.count < this.size) this.count++;
    }
    countRecent(now, windowMs) {
      let c = 0;
      for (let i = 0; i < this.count; i++) {
        if (now - this.buffer[i] < windowMs) c++;
      }
      return c;
    }
  }
  io.on('connection', (socket) => {
    // Change the join_session handler to async to allow await
    socket.on(
      'join_session',
      async ({ sessionId, displayName, deviceInfo, clientId } = {}, callback) => {
        // Input validation
        if (!isValidSessionId(sessionId)) {
          log('join_session: missing or invalid sessionId');
          return typeof callback === 'function' && callback({ error: 'Invalid sessionId' });
        }
        if (displayName && !isValidDisplayName(displayName)) {
          return typeof callback === 'function' && callback({ error: 'Invalid displayName' });
        }
        if (clientId && !isValidClientId(clientId)) {
          return typeof callback === 'function' && callback({ error: 'Invalid clientId' });
        }
        // Sanitize displayName before storing/broadcasting
        const safeName = displayName ? safeDisplayName(displayName) : undefined;
        if (!sessionId || typeof sessionId !== 'string') {
          log('join_session: missing or invalid sessionId');
          return typeof callback === 'function' && callback({ error: 'No sessionId provided' });
        }
        let session = getSession(sessionId);
        if (!session) {
          session = createSession(sessionId, socket.id, clientId);
          log('Session created:', sessionId);
        }
        // Auto-populate queue with all sample tracks if empty
        if ((session.queue?.length ?? 0) === 0) {
          const samplesDir = path.join(process.cwd(), 'uploads', 'samples');
          if (
            await fs.promises.access(samplesDir).then(
              () => true,
              () => false
            )
          ) {
            const files = await fs.promises.readdir(samplesDir);
            for (const file of files) {
              if (file.endsWith('.mp3')) {
                // Extract metadata using music-metadata
                let artist = '';
                let album = '';
                let duration = 0;
                try {
                  const metadata = await mm.parseFile(path.join(samplesDir, file));
                  artist = metadata.common.artist || '';
                  album = metadata.common.album || '';
                  duration = metadata.format.duration || 0;
                } catch (e) {
                  // Ignore errors, fallback to empty
                }
                addToQueue(
                  sessionId,
                  `/audio/uploads/samples/${encodeURIComponent(file)}`,
                  file.replace(/\.mp3$/i, ''),
                  { type: 'sample', artist, album, duration }
                );
              }
            }
          }
        }
        addClient(sessionId, socket.id, safeName, deviceInfo, clientId);
        socket.join(sessionId);
        log('Socket', socket.id, 'joined session', sessionId, 'as client', clientId);
        // Ensure controllerClientId is set (first joiner becomes controller)
        let becameController = false;
        if (!session.controllerClientId) {
          session.controllerClientId = clientId;
          session.controllerId = socket.id;
          becameController = true;
        }
        // If this clientId is the controller, update controllerId to this socket
        if (session.controllerClientId === clientId) {
          session.controllerId = socket.id;
          becameController = true;
        }

        // Always send the correct controllerClientId in the callback
        const syncState = buildSessionSyncState(session);
        typeof callback === 'function' &&
          callback({
            ...syncState,
            sessionId,
            audioUrl:
              process.env.AUDIO_URL ||
              'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          });

        // Send current queue to the joining client
        socket.emit('queue_update', getQueue(sessionId));

        // Send all reactions for the session to the joining client
        const sessionReactions = getSessionReactions(sessionId);
        if (sessionReactions && sessionReactions.size > 0) {
          for (const [messageId, messageReactions] of sessionReactions.entries()) {
            const aggregatedReactions = aggregateReactions(messageReactions);
            if (aggregatedReactions.length > 0) {
              socket.emit('message_reactions_updated', {
                messageId,
                reactions: aggregatedReactions,
                joinedBy: clientId,
              });
            }
          }
        }

        io.to(sessionId).emit('clients_update', getClients(sessionId));
        if (becameController) {
          io.to(sessionId).emit('controller_change', socket.id);
          io.to(sessionId).emit('controller_client_change', clientId);
        }
        log('Client joined session', sessionId, 'Current queue:', getQueue(sessionId));
        socket.clientId = clientId; // Set clientId on the socket for signaling relay
      }
    );

    socket.on('play', async ({ sessionId, timestamp } = {}) => {
      if (!isValidSessionId(sessionId) || !isValidTimestamp(timestamp)) return;
      const session = getSession(sessionId);
      if (!session) return;
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return;
      await updatePlayback(sessionId, { isPlaying: true, timestamp, controllerId: socket.id });
      log('Play in session', sessionId, 'at', timestamp);
      io.to(sessionId).emit('sync_state', {
        isPlaying: true,
        timestamp: getSmoothedTimestamp(sessionId, session.timestamp),
        lastUpdated: session.lastUpdated,
        controllerId: socket.id,
        serverTime: Date.now(),
        syncVersion: incrementSyncVersion(sessionId),
      });
    });

    socket.on('pause', async ({ sessionId, timestamp } = {}) => {
      if (!isValidSessionId(sessionId) || !isValidTimestamp(timestamp)) return;
      const session = getSession(sessionId);
      if (!session) return;
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return;
      await updatePlayback(sessionId, { isPlaying: false, timestamp, controllerId: socket.id });
      log('Pause in session', sessionId, 'at', timestamp);
      io.to(sessionId).emit('sync_state', {
        isPlaying: false,
        timestamp: getSmoothedTimestamp(sessionId, session.timestamp),
        lastUpdated: session.lastUpdated,
        controllerId: socket.id,
        serverTime: Date.now(),
        syncVersion: incrementSyncVersion(sessionId),
      });
    });

    socket.on('seek', async ({ sessionId, timestamp } = {}) => {
      if (!isValidSessionId(sessionId) || !isValidTimestamp(timestamp)) return;
      const session = getSession(sessionId);
      if (!session) return;
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return;
      await updateTimestamp(sessionId, timestamp, socket.id);
      log('Seek in session', sessionId, 'to', timestamp);
      io.to(sessionId).emit('sync_state', {
        isPlaying: session.isPlaying,
        timestamp: getSmoothedTimestamp(sessionId, session.timestamp),
        lastUpdated: session.lastUpdated,
        controllerId: socket.id,
        serverTime: Date.now(),
        syncVersion: incrementSyncVersion(sessionId),
      });
    });

    socket.on('sync_request', async ({ sessionId } = {}, callback) => {
      try {
        if (!isValidSessionId(sessionId)) {
          if (typeof callback === 'function') callback({ error: 'Invalid sessionId' });
          return;
        }
        if (!sessionId) {
          if (typeof callback === 'function') callback({ error: 'No sessionId provided' });
          return;
        }
        const session = getSession(sessionId);
        if (!session) {
          if (typeof callback === 'function') callback({ error: 'Session not found' });
          return;
        }
        const response = buildSessionSyncState(session);
        // Add syncVersion to the response
        response.syncVersion = getSyncVersion(sessionId);
        if (typeof callback === 'function') callback(response);
      } catch (err) {
        if (typeof callback === 'function') callback({ error: 'Internal server error' });
      }
    });

    socket.on('request_controller', async ({ sessionId } = {}, callback) => {
      if (!sessionId)
        return typeof callback === 'function' && callback({ error: 'No sessionId provided' });
      const session = getSession(sessionId);
      if (!session)
        return typeof callback === 'function' && callback({ error: 'Session not found' });

      const requesterClientId = getClientIdBySocket(sessionId, socket.id);
      if (!requesterClientId)
        return typeof callback === 'function' && callback({ error: 'Client not found in session' });

      // Check if requester is already the controller
      if (session.controllerClientId === requesterClientId) {
        return (
          typeof callback === 'function' && callback({ error: 'You are already the controller' })
        );
      }

      // Check if there's already a pending request from this client
      if (session.pendingControllerRequests.has(requesterClientId)) {
        return (
          typeof callback === 'function' &&
          callback({ error: 'You already have a pending request' })
        );
      }

      // Get requester's display name
      const requesterInfo = session.clients.get(socket.id);
      const requesterName = requesterInfo
        ? requesterInfo.displayName
        : `User-${requesterClientId.slice(-4)}`;

      // Add the request
      addControllerRequest(sessionId, requesterClientId, requesterName);

      // Notify the current controller
      const controllerSocketId = session.controllerId;
      if (controllerSocketId) {
        const controllerSocket = io.sockets.sockets.get(controllerSocketId);
        if (controllerSocket) {
          controllerSocket.emit('controller_request_received', {
            sessionId,
            requesterClientId,
            requesterName,
            requestTime: Date.now(),
          });
        }
      }

      // Notify all clients about the pending request
      io.to(sessionId).emit('controller_requests_update', getPendingControllerRequests(sessionId));

      log('Controller request from client', requesterClientId, 'in session', sessionId);
      typeof callback === 'function' &&
        callback({ success: true, message: 'Request sent to current controller' });
    });

    socket.on(
      'approve_controller_request',
      async ({ sessionId, requesterClientId } = {}, callback) => {
        if (!sessionId)
          return typeof callback === 'function' && callback({ error: 'No sessionId provided' });
        if (!requesterClientId)
          return (
            typeof callback === 'function' && callback({ error: 'No requesterClientId provided' })
          );

        const session = getSession(sessionId);
        if (!session)
          return typeof callback === 'function' && callback({ error: 'Session not found' });

        const approverClientId = getClientIdBySocket(sessionId, socket.id);
        if (session.controllerClientId !== approverClientId) {
          return (
            typeof callback === 'function' &&
            callback({ error: 'Only the current controller can approve requests' })
          );
        }

        // Check if the request still exists
        if (!session.pendingControllerRequests.has(requesterClientId)) {
          return (
            typeof callback === 'function' && callback({ error: 'Request not found or expired' })
          );
        }

        // Remove the request and transfer controller role
        removeControllerRequest(sessionId, requesterClientId);
        setController(sessionId, requesterClientId);

        log('Controller transferred to client', requesterClientId, 'in session', sessionId);

        // Notify all clients
        io.to(sessionId).emit(
          'controller_change',
          getSocketIdByClientId(sessionId, requesterClientId)
        );
        io.to(sessionId).emit('controller_client_change', requesterClientId);
        io.to(sessionId).emit(
          'controller_requests_update',
          getPendingControllerRequests(sessionId)
        );
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: getSmoothedTimestamp(sessionId, session.timestamp),
          lastUpdated: session.lastUpdated,
          controllerId: getSocketIdByClientId(sessionId, requesterClientId),
          serverTime: Date.now(),
          syncVersion: incrementSyncVersion(sessionId),
        });

        typeof callback === 'function' && callback({ success: true });
      }
    );

    socket.on(
      'deny_controller_request',
      async ({ sessionId, requesterClientId } = {}, callback) => {
        if (!sessionId)
          return typeof callback === 'function' && callback({ error: 'No sessionId provided' });
        if (!requesterClientId)
          return (
            typeof callback === 'function' && callback({ error: 'No requesterClientId provided' })
          );

        const session = getSession(sessionId);
        if (!session)
          return typeof callback === 'function' && callback({ error: 'Session not found' });

        const denierClientId = getClientIdBySocket(sessionId, socket.id);
        if (session.controllerClientId !== denierClientId) {
          return (
            typeof callback === 'function' &&
            callback({ error: 'Only the current controller can deny requests' })
          );
        }

        // Remove the request
        removeControllerRequest(sessionId, requesterClientId);

        log('Controller request denied for client', requesterClientId, 'in session', sessionId);

        // Notify all clients
        io.to(sessionId).emit(
          'controller_requests_update',
          getPendingControllerRequests(sessionId)
        );

        typeof callback === 'function' && callback({ success: true });
      }
    );

    socket.on('cancel_controller_request', async ({ sessionId } = {}, callback) => {
      if (!sessionId)
        return typeof callback === 'function' && callback({ error: 'No sessionId provided' });

      const session = getSession(sessionId);
      if (!session)
        return typeof callback === 'function' && callback({ error: 'Session not found' });

      const requesterClientId = getClientIdBySocket(sessionId, socket.id);
      if (!requesterClientId)
        return typeof callback === 'function' && callback({ error: 'Client not found in session' });

      // Remove the request
      removeControllerRequest(sessionId, requesterClientId);

      log('Controller request cancelled by client', requesterClientId, 'in session', sessionId);

      // Notify all clients
      io.to(sessionId).emit('controller_requests_update', getPendingControllerRequests(sessionId));

      typeof callback === 'function' && callback({ success: true });
    });

    socket.on('offer_controller', async ({ sessionId, targetClientId } = {}, callback) => {
      if (!sessionId)
        return typeof callback === 'function' && callback({ error: 'No sessionId provided' });
      if (!targetClientId)
        return typeof callback === 'function' && callback({ error: 'No targetClientId provided' });

      const session = getSession(sessionId);
      if (!session)
        return typeof callback === 'function' && callback({ error: 'Session not found' });

      const offererClientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== offererClientId) {
        return (
          typeof callback === 'function' &&
          callback({ error: 'Only the current controller can offer controller role' })
        );
      }

      // Check if target is already the controller
      if (session.controllerClientId === targetClientId) {
        return (
          typeof callback === 'function' && callback({ error: 'Target is already the controller' })
        );
      }

      // Get offerer's display name
      const offererInfo = session.clients.get(socket.id);
      const offererName = offererInfo
        ? offererInfo.displayName
        : `User-${offererClientId.slice(-4)}`;

      // Get target's display name
      const targetSocketId = getSocketIdByClientId(sessionId, targetClientId);
      const targetInfo = targetSocketId ? session.clients.get(targetSocketId) : null;
      const targetName = targetInfo ? targetInfo.displayName : `User-${targetClientId.slice(-4)}`;

      // Notify the target client
      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.emit('controller_offer_received', {
            sessionId,
            offererClientId,
            offererName,
            targetClientId,
            targetName,
            offerTime: Date.now(),
          });
        }
      }

      // Notify the offerer that the offer was sent successfully
      socket.emit('controller_offer_sent', {
        sessionId,
        targetClientId,
        targetName,
        offerTime: Date.now(),
      });

      log(
        'Controller offer sent from',
        offererClientId,
        'to',
        targetClientId,
        'in session',
        sessionId
      );
      typeof callback === 'function' &&
        callback({ success: true, message: `Controller offer sent to ${targetName}` });
    });

    socket.on('accept_controller_offer', async ({ sessionId, offererClientId } = {}, callback) => {
      if (!sessionId)
        return typeof callback === 'function' && callback({ error: 'No sessionId provided' });
      if (!offererClientId)
        return typeof callback === 'function' && callback({ error: 'No offererClientId provided' });

      const session = getSession(sessionId);
      if (!session)
        return typeof callback === 'function' && callback({ error: 'Session not found' });

      const accepterClientId = getClientIdBySocket(sessionId, socket.id);
      if (!accepterClientId)
        return typeof callback === 'function' && callback({ error: 'Client not found in session' });

      // Verify the offerer is still the controller
      if (session.controllerClientId !== offererClientId) {
        return typeof callback === 'function' && callback({ error: 'Offer is no longer valid' });
      }

      // Transfer controller role
      setController(sessionId, accepterClientId);

      log('Controller transferred to client', accepterClientId, 'in session', sessionId);

      // Get accepter's info
      const accepterInfo = session.clients.get(socket.id);
      const accepterName = accepterInfo
        ? accepterInfo.displayName
        : `User-${accepterClientId.slice(-4)}`;

      // Notify the offerer that their offer was accepted
      const offererSocketId = getSocketIdByClientId(sessionId, offererClientId);
      if (offererSocketId) {
        const offererSocket = io.sockets.sockets.get(offererSocketId);
        if (offererSocket) {
          offererSocket.emit('controller_offer_accepted', {
            sessionId,
            accepterClientId,
            accepterName,
            offerTime: Date.now(),
          });
        }
      }

      // Notify all clients
      io.to(sessionId).emit(
        'controller_change',
        getSocketIdByClientId(sessionId, accepterClientId)
      );
      io.to(sessionId).emit('controller_client_change', accepterClientId);
      io.to(sessionId).emit('sync_state', {
        isPlaying: session.isPlaying,
        timestamp: getSmoothedTimestamp(sessionId, session.timestamp),
        lastUpdated: session.lastUpdated,
        controllerId: getSocketIdByClientId(sessionId, accepterClientId),
        serverTime: Date.now(),
        syncVersion: incrementSyncVersion(sessionId),
      });

      typeof callback === 'function' && callback({ success: true });
    });

    socket.on('decline_controller_offer', async ({ sessionId, offererClientId } = {}, callback) => {
      if (!sessionId)
        return typeof callback === 'function' && callback({ error: 'No sessionId provided' });
      if (!offererClientId)
        return typeof callback === 'function' && callback({ error: 'No offererClientId provided' });

      const session = getSession(sessionId);
      if (!session)
        return typeof callback === 'function' && callback({ error: 'Session not found' });

      const declinerClientId = getClientIdBySocket(sessionId, socket.id);
      if (!declinerClientId)
        return typeof callback === 'function' && callback({ error: 'Client not found in session' });

      // Notify the offerer that their offer was declined
      const offererSocketId = getSocketIdByClientId(sessionId, offererClientId);
      if (offererSocketId) {
        const offererSocket = io.sockets.sockets.get(offererSocketId);
        if (offererSocket) {
          offererSocket.emit('controller_offer_declined', {
            sessionId,
            declinerClientId,
            declinerName: session.clients.get(socket.id)
              ? session.clients.get(socket.id).displayName
              : `User-${declinerClientId.slice(-4)}`,
            offerTime: Date.now(),
          });
        }
      }

      log('Controller offer declined by client', declinerClientId, 'in session', sessionId);

      typeof callback === 'function' && callback({ success: true });
    });

    socket.on(
      'chat_message',
      async ({ sessionId, message, sender, displayName } = {}, callback) => {
        // --- Rate limiting ---
        const now = Date.now();
        if (!chatRateLimit[socket.id])
          chatRateLimit[socket.id] = new TimestampRingBuffer(CHAT_LIMIT);
        const ring = chatRateLimit[socket.id];
        if (ring.countRecent(now, CHAT_WINDOW_MS) >= CHAT_LIMIT) {
          if (typeof callback === 'function')
            callback({ error: 'You are sending messages too quickly. Please slow down.' });
          return;
        }
        ring.add(now);
        if (!sessionId || !message || typeof message !== 'string') {
          if (typeof callback === 'function') callback({ error: 'Invalid chat message data' });
          return;
        }
        // Message length and content validation
        const MAX_LENGTH = 500;
        const trimmed = message.trim();
        if (!trimmed) {
          if (typeof callback === 'function')
            callback({ error: 'Message cannot be empty or whitespace.' });
          return;
        }
        if (trimmed.length > MAX_LENGTH) {
          if (typeof callback === 'function')
            callback({ error: `Message too long (max ${MAX_LENGTH} characters).` });
          return;
        }
        // Sanitize message to prevent XSS
        const safeMessage = escapeHtml(trimmed);
        const session = getSession(sessionId);
        if (!session) {
          if (typeof callback === 'function') callback({ error: 'Session not found' });
          return;
        }
        // Try to get displayName from payload, else from session.clients map
        let resolvedDisplayName = displayName ? safeDisplayName(displayName) : undefined;
        if (!resolvedDisplayName) {
          // Try to find by socketId or clientId
          let clientInfo = null;
          // Try by socketId
          clientInfo = session.clients.get(socket.id);
          // If not found, try by clientId
          if (!clientInfo && sender) {
            for (const info of session.clients.values()) {
              if (info.clientId === sender) {
                clientInfo = info;
                break;
              }
            }
          }
          resolvedDisplayName =
            clientInfo && clientInfo.displayName
              ? safeDisplayName(clientInfo.displayName)
              : undefined;
        }
        let formattedMessage = formatChatMessage(
          sender || socket.id,
          safeMessage,
          resolvedDisplayName
        );
        // Ensure messageId is present
        if (!formattedMessage.messageId) {
          formattedMessage = { ...formattedMessage, messageId: uuidv4() };
        }
        // Store message in session
        const sessionMessages = getSessionMessages(sessionId);
        if (sessionMessages) sessionMessages.push(formattedMessage);
        io.to(sessionId).emit('chat_message', formattedMessage);
        if (typeof callback === 'function') callback({ success: true, message: formattedMessage });
      }
    );

    // Edit message event
    socket.on('edit_message', async ({ sessionId, messageId, newMessage, clientId }, callback) => {
      const sessionMessages = getSessionMessages(sessionId);
      if (!sessionMessages) return callback && callback({ error: 'Session not found' });
      const msgIdx = sessionMessages.findIndex((m) => m.messageId === messageId);
      if (msgIdx === -1) return callback && callback({ error: 'Message not found' });
      const msg = sessionMessages[msgIdx];
      if (msg.sender !== clientId) return callback && callback({ error: 'Not allowed' });
      // Validate and sanitize new message
      const trimmed = (newMessage || '').trim();
      if (!trimmed) return callback && callback({ error: 'Message cannot be empty.' });
      if (trimmed.length > 500)
        return callback && callback({ error: 'Message too long (max 500 characters).' });
      msg.message = escapeHtml(trimmed);
      msg.edited = true;
      msg.editTimestamp = Date.now();
      io.to(sessionId).emit('message_edited', msg);
      callback && callback({ success: true, message: msg });
    });

    // Delete message event
    socket.on('delete_message', async ({ sessionId, messageId, clientId }, callback) => {
      const sessionMessages = getSessionMessages(sessionId);
      if (!sessionMessages) return callback && callback({ error: 'Session not found' });
      const msgIdx = sessionMessages.findIndex((m) => m.messageId === messageId);
      if (msgIdx === -1) return callback && callback({ error: 'Message not found' });
      const msg = sessionMessages[msgIdx];
      if (msg.sender !== clientId) return callback && callback({ error: 'Not allowed' });
      sessionMessages.splice(msgIdx, 1);
      io.to(sessionId).emit('message_deleted', { messageId });
      callback && callback({ success: true });
    });

    // Report message event
    socket.on('report_message', async ({ sessionId, messageId, reporterId, reason }, callback) => {
      const sessionMessages = getSessionMessages(sessionId);
      if (!sessionMessages) return callback && callback({ error: 'Session not found' });
      const msg = sessionMessages.find((m) => m.messageId === messageId);
      if (!msg) return callback && callback({ error: 'Message not found' });
      // For now, just log the report

      callback && callback({ success: true });
    });

    // Replace the existing reaction handler with comprehensive emoji reaction system
    socket.on(
      'emoji_reaction',
      async ({ sessionId, messageId, emoji, clientId, displayName } = {}, callback) => {
        if (!sessionId || !messageId || !emoji || !clientId) {
          return typeof callback === 'function' && callback({ error: 'Missing required fields' });
        }

        const session = getSession(sessionId);
        if (!session) {
          return typeof callback === 'function' && callback({ error: 'Session not found' });
        }

        // Get or create reactions for this session
        const sessionReactions = getSessionReactions(sessionId);
        if (!sessionReactions) {
          return (
            typeof callback === 'function' && callback({ error: 'Failed to get session reactions' })
          );
        }

        // Get or create reactions for this message
        if (!sessionReactions.has(messageId)) {
          sessionReactions.set(messageId, new Map());
        }
        const messageReactions = sessionReactions.get(messageId);

        // Get or create reaction data for this emoji
        if (!messageReactions.has(emoji)) {
          messageReactions.set(emoji, { count: 0, users: new Set() });
        }
        const reactionData = messageReactions.get(emoji);

        // Add user to this reaction
        reactionData.users.add(clientId);
        reactionData.count = reactionData.users.size;

        // Aggregate all reactions for this message
        const aggregatedReactions = aggregateReactions(messageReactions);

        // Broadcast to all clients in the session
        io.to(sessionId).emit('message_reactions_updated', {
          messageId,
          reactions: aggregatedReactions,
          addedBy: clientId,
          addedEmoji: emoji,
        });

        log('Emoji reaction added:', {
          sessionId,
          messageId,
          emoji,
          clientId,
          count: reactionData.count,
        });

        if (typeof callback === 'function') {
          callback({
            success: true,
            reactions: aggregatedReactions,
            addedEmoji: emoji,
          });
        }
      }
    );

    // Remove emoji reaction
    socket.on(
      'remove_emoji_reaction',
      async ({ sessionId, messageId, emoji, clientId } = {}, callback) => {
        if (!sessionId || !messageId || !emoji || !clientId) {
          return typeof callback === 'function' && callback({ error: 'Missing required fields' });
        }

        const session = getSession(sessionId);
        if (!session) {
          return typeof callback === 'function' && callback({ error: 'Session not found' });
        }

        const sessionReactions = getSessionReactions(sessionId);
        if (!sessionReactions) {
          return (
            typeof callback === 'function' && callback({ error: 'Failed to get session reactions' })
          );
        }

        const messageReactions = sessionReactions.get(messageId);
        if (!messageReactions || !messageReactions.has(emoji)) {
          return typeof callback === 'function' && callback({ error: 'Reaction not found' });
        }

        const reactionData = messageReactions.get(emoji);
        reactionData.users.delete(clientId);
        reactionData.count = reactionData.users.size;

        // Remove emoji if no users left
        if (reactionData.count === 0) {
          messageReactions.delete(emoji);
        }

        // Remove message reactions if empty
        if (messageReactions.size === 0) {
          sessionReactions.delete(messageId);
        }

        // Aggregate remaining reactions
        const aggregatedReactions = aggregateReactions(messageReactions);

        // Broadcast to all clients
        io.to(sessionId).emit('message_reactions_updated', {
          messageId,
          reactions: aggregatedReactions,
          removedBy: clientId,
          removedEmoji: emoji,
        });

        log('Emoji reaction removed:', { sessionId, messageId, emoji, clientId });

        if (typeof callback === 'function') {
          callback({
            success: true,
            reactions: aggregatedReactions,
            removedEmoji: emoji,
          });
        }
      }
    );

    // Get reactions for a specific message
    socket.on('get_message_reactions', async ({ sessionId, messageId } = {}, callback) => {
      if (!sessionId || !messageId) {
        return typeof callback === 'function' && callback({ error: 'Missing required fields' });
      }

      const sessionReactions = getSessionReactions(sessionId);
      if (!sessionReactions) {
        return typeof callback === 'function' && callback({ error: 'Session not found' });
      }

      const messageReactions = sessionReactions.get(messageId);
      const aggregatedReactions = aggregateReactions(messageReactions);

      if (typeof callback === 'function') {
        callback({
          success: true,
          reactions: aggregatedReactions,
        });
      }
    });

    // Get all reactions for a session
    socket.on('get_session_reactions', async ({ sessionId } = {}, callback) => {
      if (!sessionId) {
        return typeof callback === 'function' && callback({ error: 'Missing sessionId' });
      }

      const sessionReactions = getSessionReactions(sessionId);
      if (!sessionReactions) {
        return typeof callback === 'function' && callback({ error: 'Session not found' });
      }

      const allReactions = {};
      for (const [messageId, messageReactions] of sessionReactions.entries()) {
        const aggregatedReactions = aggregateReactions(messageReactions);
        if (aggregatedReactions.length > 0) {
          allReactions[messageId] = aggregatedReactions;
        }
      }

      if (typeof callback === 'function') {
        callback({
          success: true,
          reactions: allReactions,
        });
      }
    });

    /**
     * Enhanced add_to_queue event:
     * - Validates input more strictly (URL, title).
     * - Optionally supports metadata (artist, duration, etc) for future extensibility.
     * - Prevents duplicate tracks (by URL) in the queue.
     * - Optionally allows only the controller to add tracks (uncomment to enforce).
     * - Broadcasts queue_update and emits a track_change if this is the first track.
     * - Returns detailed result in callback.
     */
    socket.on('add_to_queue', async (data = {}, callback) => {
      const { sessionId, url, title, ...meta } = data || {};
      if (!sessionId || typeof sessionId !== 'string' || !url || typeof url !== 'string') {
        return (
          typeof callback === 'function' &&
          callback({ error: 'Missing or invalid sessionId or url' })
        );
      }
      // Optionally: Only controller can add tracks (uncomment to enforce)
      // const session = getSession(sessionId);
      // const clientId = getClientIdBySocket(sessionId, socket.id);
      // if (!session || session.controllerClientId !== clientId) {
      //   return callback && callback({ error: 'Only the controller can add tracks' });
      // }

      // Enhanced: Prevent duplicate URLs in queue
      const queue = getQueue(sessionId) || [];
      if (queue.some((track) => track && track.url === url)) {
        return typeof callback === 'function' && callback({ error: 'Track already in queue' });
      }

      // Enhanced: Validate title (optional, allow empty but not non-string)
      const safeTitle = typeof title === 'string' ? title : '';

      // Enhanced: Support extra metadata (artist, duration, etc)
      addToQueue(sessionId, url, safeTitle, meta);

      const updatedQueue = getQueue(sessionId);

      log('[DEBUG] add_to_queue: session', sessionId, 'queue now:', updatedQueue);

      io.to(sessionId).emit('queue_update', updatedQueue);

      // If this is the first track, emit a track_change event to set current track
      if (updatedQueue.length === 1) {
        io.to(sessionId).emit('track_change', {
          idx: 0,
          track: updatedQueue[0],
          reason: 'first_track_added',
          initiator: getClientIdBySocket(sessionId, socket.id),
        });
      }

      typeof callback === 'function' && callback({ success: true, queue: updatedQueue });
    });

    /**
     * Enhanced remove_from_queue:
     * - Validates input more strictly (sessionId, index).
     * - Only controller can remove tracks.
     * - Handles edge cases: removing current track, out-of-bounds, empty queue.
     * - Broadcasts queue_update and, if needed, emits track_change if current track is removed.
     * - Returns detailed result in callback.
     * - Logs for debugging.
     */
    socket.on('remove_from_queue', async ({ sessionId, index } = {}, callback) => {
      // Validate input
      if (!sessionId || typeof sessionId !== 'string' || typeof index !== 'number' || index < 0) {
        return typeof callback === 'function' && callback({ error: 'Invalid input' });
      }
      const session = getSession(sessionId);
      if (!session)
        return typeof callback === 'function' && callback({ error: 'Session not found' });
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId)
        return typeof callback === 'function' && callback({ error: 'Not allowed' });

      const queue = getQueue(sessionId) || [];
      if (index >= queue.length) {
        return typeof callback === 'function' && callback({ error: 'Index out of bounds' });
      }
      const removedTrack = queue[index];

      // Remove the track
      const removed = removeFromQueue(sessionId, index);
      if (!removed) return typeof callback === 'function' && callback({ error: 'Invalid index' });

      // --- Delete uploaded file if it's a user upload (not a sample) ---
      if (removedTrack && removedTrack.url && typeof removedTrack.url === 'string') {
        // Support both absolute and relative URLs
        let pathname = removedTrack.url;
        try {
          // If it's an absolute URL, extract the pathname
          const urlObj = new URL(removedTrack.url, 'http://localhost'); // fallback base
          pathname = urlObj.pathname;
        } catch (e) {
          // If it's not a valid URL, fallback to original string
        }
        const uploadsPrefix = '/audio/uploads/';
        const samplesPrefix = '/audio/uploads/samples/';
        if (pathname.startsWith(uploadsPrefix) && !pathname.startsWith(samplesPrefix)) {
          // Extract filename
          const filename = decodeURIComponent(pathname.substring(uploadsPrefix.length));
          const filePath = path.join(process.cwd(), 'uploads', filename);
          log(
            `[remove_from_queue][DEBUG] Attempting to delete file:`,
            filePath,
            'from url:',
            removedTrack.url
          );
          await fs.promises.unlink(filePath);
          log(`[remove_from_queue] Deleted user-uploaded file: ${filePath}`);
        }
      }

      const updatedQueue = getQueue(sessionId) || [];
      log(
        '[DEBUG] remove_from_queue: session',
        sessionId,
        'removed index',
        index,
        'track:',
        removedTrack,
        'queue now:',
        updatedQueue
      );

      // If the removed track was the current track, emit a track_change to update current track
      let trackChangePayload = null;
      if (typeof session.selectedTrackIdx === 'number' && session.selectedTrackIdx === index) {
        // If queue is not empty, select next track (or previous if last was removed), else null
        let newIdx = 0;
        if (updatedQueue.length === 0) {
          session.selectedTrackIdx = 0;
          trackChangePayload = {
            idx: null,
            track: null,
            reason: 'track_removed_queue_empty',
            initiator: clientId,
            timestamp: Date.now(),
          };
        } else {
          // If we removed the last track, move to previous; else, stay at same index
          newIdx = Math.min(index, updatedQueue.length - 1);
          session.selectedTrackIdx = newIdx;
          trackChangePayload = {
            idx: newIdx,
            track: updatedQueue[newIdx],
            reason: 'current_track_removed',
            initiator: clientId,
            timestamp: Date.now(),
          };
        }
        io.to(sessionId).emit('track_change', trackChangePayload);
      } else if (typeof session.selectedTrackIdx === 'number' && index < session.selectedTrackIdx) {
        // If a track before the current was removed, decrement selectedTrackIdx
        session.selectedTrackIdx = Math.max(0, session.selectedTrackIdx - 1);
      }

      io.to(sessionId).emit('queue_update', updatedQueue);

      typeof callback === 'function' &&
        callback({
          success: true,
          removedIndex: index,
          removedTrack,
          queue: updatedQueue,
          ...(trackChangePayload ? { trackChange: trackChangePayload } : {}),
        });
    });

    /**
     * Ultra-Enhanced track_change event:
     * - Only controller can change track.
     * - Broadcasts new track index and metadata to all clients.
     * - Supports "reason", "initiator", and "extra" for diagnostics.
     * - Emits a queue_update for clients to refresh their queue state.
     * - Optionally supports "autoAdvance" and "force" flags for advanced control.
     * - Handles out-of-bounds and empty queue cases gracefully.
     * - Logs detailed diagnostics in development.
     * - Optionally updates session.selectedTrackIdx for server-side state.
     * - Optionally emits a "track_change_failed" event for error cases.
     */
    socket.on('track_change', async (data, callback) => {
      data = data || {};
      let { sessionId, idx, reason, extra, autoAdvance, force, track: customTrack } = data;

      if (!sessionId) {
        if (typeof callback === 'function') callback({ error: 'No sessionId provided' });
        return;
      }
      const session = getSession(sessionId);
      if (!session) {
        if (typeof callback === 'function') callback({ error: 'Session not found' });
        return;
      }
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) {
        if (typeof callback === 'function') callback({ error: 'Not allowed' });
        io.to(socket.id).emit('track_change_failed', {
          error: 'Not allowed',
          sessionId,
          attemptedBy: clientId,
          timestamp: Date.now(),
        });
        return;
      }

      let queue = getQueue(sessionId) || [];
      let newIdx = typeof idx === 'number' ? idx : 0;
      let track =
        queue.length > 0 && typeof newIdx === 'number' && queue[newIdx] ? queue[newIdx] : null;

      // --- Backend safeguard: If a custom track is provided and not in the queue, add it ---
      if (customTrack && customTrack.url && !queue.some((t) => t && t.url === customTrack.url)) {
        addToQueue(sessionId, customTrack.url, customTrack.title || '', customTrack.meta || {});
        queue = getQueue(sessionId) || [];
        newIdx = queue.findIndex((t) => t && t.url === customTrack.url);
        track = queue[newIdx];
      }

      // Defensive: If idx is out of bounds, clamp to valid range or null
      if (typeof newIdx === 'number' && (newIdx < 0 || newIdx >= queue.length)) {
        if (queue.length === 0) {
          newIdx = null;
          track = null;
        } else {
          newIdx = Math.max(0, Math.min(newIdx, queue.length - 1));
          track = queue[newIdx];
        }
      }

      // Optionally update session.selectedTrackIdx for server-side state
      if (typeof newIdx === 'number' && newIdx !== null) {
        session.selectedTrackIdx = newIdx;
      } else {
        session.selectedTrackIdx = 0;
      }

      // --- Reset playback timestamp when changing tracks ---
      session.timestamp = 0;
      session.lastUpdated = Date.now();

      // Optionally support autoAdvance (e.g., for next/prev track)
      let autoAdvanceInfo = {};
      if (autoAdvance) {
        autoAdvanceInfo = { autoAdvance: true };
      }
      if (force) {
        autoAdvanceInfo.force = true;
      }

      // Debug log for queue and track
      if (process.env.NODE_ENV === 'development') {
        log(
          '[DEBUG][track_change] session:',
          sessionId,
          'queue:',
          queue,
          'idx:',
          newIdx,
          'track:',
          track,
          'reason:',
          reason,
          'extra:',
          extra,
          'autoAdvance:',
          autoAdvance,
          'force:',
          force
        );
      }

      const payload = {
        idx: newIdx,
        track,
        reason: reason || null,
        initiator: clientId,
        timestamp: Date.now(),
        ...autoAdvanceInfo,
        ...(extra && typeof extra === 'object' ? { extra } : {}),
      };

      io.to(sessionId).emit('queue_update', queue);
      io.to(sessionId).emit('track_change', payload);
      log('Track change in session', sessionId, ':', payload);

      // Emit sync_state after track change so all clients get the latest play state and timestamp
      io.to(sessionId).emit('sync_state', {
        isPlaying: session.isPlaying,
        timestamp: getSmoothedTimestamp(sessionId, session.timestamp),
        lastUpdated: session.lastUpdated,
        controllerId: session.controllerId,
        serverTime: Date.now(),
        syncVersion: incrementSyncVersion(sessionId),
      });

      if (typeof callback === 'function') callback({ success: true, ...payload });
    });

    /**
     * Ultra-accurate time_sync event for robust client-server time synchronization.
     * Responds with:
     *   - serverTime: current server timestamp (ms, when received)
     *   - clientSent: original client timestamp (ms, as sent by client)
     *   - serverReceived: when server received the request (ms)
     *   - serverProcessed: when server sent the response (ms)
     *   - serverUptime: process uptime in ms (for drift diagnostics)
     *   - serverTimezoneOffset: server's timezone offset in minutes
     *   - serverIso: ISO string of server time (for debugging)
     *   - serverInfo: basic server info (for diagnostics)
     *   - roundTripEstimate: estimated round-trip time in ms (if client provides a callback timestamp)
     */
    socket.on('time_sync', (clientSent, callback) => {
      const serverReceived = Date.now();
      const parsedClientSent =
        typeof clientSent === 'number' ? clientSent : Number(clientSent) || null;

      // Optionally, allow client to send an object with more info (future-proofing)
      let clientExtra = {};
      if (clientSent && typeof clientSent === 'object' && clientSent !== null) {
        clientExtra = { ...clientSent };
        if ('clientSent' in clientSent) {
          clientExtra.clientSent =
            typeof clientSent.clientSent === 'number'
              ? clientSent.clientSent
              : Number(clientSent.clientSent) || null;
        }
      }

      if (typeof callback === 'function') {
        // Simulate minimal processing delay for realism
        setImmediate(() => {
          const serverProcessed = Date.now();
          // Optionally estimate round-trip if client sent a callback timestamp
          let roundTripEstimate = null;
          if (clientExtra && typeof clientExtra.clientCallbackReceived === 'number') {
            roundTripEstimate = serverProcessed - clientExtra.clientCallbackReceived;
          }
          callback({
            serverTime: serverReceived,
            clientSent: parsedClientSent,
            serverReceived, // Always include when request was received
            serverProcessed, // Always include when response is sent
            serverUptime: Math.round(process.uptime() * 1000),
            serverTimezoneOffset: new Date().getTimezoneOffset(),
            serverIso: new Date(serverReceived).toISOString(),
            serverInfo: {
              nodeVersion: process.version,
              platform: process.platform,
              pid: process.pid,
            },
            roundTripEstimate,
            ...clientExtra, // echo back any extra client info for advanced sync
          });
        });
      }
    });

    // Store per-client drift for diagnostics/adaptive correction
    const clientDriftMap = {};

    socket.on(
      'drift_report',
      async ({
        sessionId,
        drift,
        clientId,
        timestamp,
        manual,
        resyncDuration,
        beforeDrift,
        afterDrift,
        improvement,
      } = {}) => {
        if (!sessionId || typeof drift !== 'number' || !clientId) return;
        if (!clientDriftMap[sessionId]) clientDriftMap[sessionId] = {};
        if (!clientDriftMap[sessionId][clientId]) clientDriftMap[sessionId][clientId] = { history: [] };
        clientDriftMap[sessionId][clientId].drift = drift;
        clientDriftMap[sessionId][clientId].timestamp = timestamp;
        // Maintain a moving window of drift history
        const history = clientDriftMap[sessionId][clientId].history;
        history.push(drift);
        if (history.length > DRIFT_AVG_WINDOW) history.shift();

        // Enhanced logging with more context
        let logMessage = `[DRIFT] Session ${sessionId} Client ${clientId}: Drift=${drift.toFixed(3)}s at ${new Date(timestamp).toISOString()}`;

        if (manual) {
          logMessage += ` (MANUAL RESYNC)`;
          if (typeof resyncDuration === 'number') {
            logMessage += ` Duration: ${resyncDuration.toFixed(1)}ms`;
          }
          if (typeof beforeDrift === 'number' && typeof afterDrift === 'number') {
            logMessage += ` Before: ${beforeDrift.toFixed(3)}s After: ${afterDrift.toFixed(3)}s`;
          }
          if (typeof improvement === 'number') {
            logMessage += ` Improvement: ${improvement.toFixed(3)}s`;
          }
        }

        log(logMessage);

        // Store additional analytics for manual resyncs
        if (manual && typeof improvement === 'number') {
          if (!clientDriftMap[sessionId][clientId].resyncHistory) {
            clientDriftMap[sessionId][clientId].resyncHistory = [];
          }
          clientDriftMap[sessionId][clientId].resyncHistory.push({
            timestamp,
            beforeDrift,
            afterDrift,
            improvement,
            resyncDuration,
          });

          // Keep only last 10 resyncs
          if (clientDriftMap[sessionId][clientId].resyncHistory.length > 10) {
            clientDriftMap[sessionId][clientId].resyncHistory.shift();
          }
        }

        // (Optional) Adaptive correction logic can be added here
      }
    );

    // Typing indicator events
    socket.on('typing', ({ sessionId, clientId, displayName }) => {
      if (!sessionId || !clientId) return;
      // Broadcast to all except sender
      socket
        .to(sessionId)
        .emit('user_typing', { clientId, displayName: safeDisplayName(displayName) });
    });
    socket.on('stop_typing', ({ sessionId, clientId }) => {
      if (!sessionId || !clientId) return;
      socket.to(sessionId).emit('user_stop_typing', { clientId });
    });

    socket.on('disconnect', async () => {
      for (const [sessionId, session] of Object.entries(getAllSessions())) {
        const clientId = getClientIdBySocket(sessionId, socket.id);
        removeClient(sessionId, socket.id);
        // Clean up any pending controller requests from this client
        if (clientId) {
          removeControllerRequest(sessionId, clientId);
        }
        if (session.controllerId === socket.id) {
          const newSocketId = getSocketIdByClientId(sessionId, session.controllerClientId);
          session.controllerId = newSocketId;
          io.to(sessionId).emit('controller_change', newSocketId);
          // Immediately broadcast full sync_state to all clients
          io.to(sessionId).emit('sync_state', {
            isPlaying: session.isPlaying,
            timestamp: getSmoothedTimestamp(sessionId, session.timestamp),
            lastUpdated: session.lastUpdated,
            controllerId: newSocketId,
            serverTime: Date.now(),
            syncVersion: incrementSyncVersion(sessionId),
          });
        }
        // Only delete files if the session is now empty
        if (getClients(sessionId).length === 0) {
          // Delete all files for this session (user uploads only)
          await deleteUserUploadedFiles(sessionId);
          deleteSession(sessionId);
          log(`[CLEANUP] Session deleted (empty): ${sessionId}`);
        }
        io.to(sessionId).emit('clients_update', getClients(sessionId));
        io.to(sessionId).emit(
          'controller_requests_update',
          getPendingControllerRequests(sessionId)
        );
      }
      log('Socket disconnected:', socket.id);
    });

    // --- WebRTC Peer-to-Peer Signaling for Time Sync (server relay) ---
    socket.on('peer-offer', (data) => {
      const { to } = data;
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s) => s.clientId === to
      );
      if (targetSocket) {
        targetSocket.emit('peer-offer', data);
      }
    });
    socket.on('peer-answer', (data) => {
      const { to } = data;
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s) => s.clientId === to
      );
      if (targetSocket) {
        targetSocket.emit('peer-answer', data);
      }
    });
    socket.on('peer-ice-candidate', (data) => {
      const { to } = data;
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s) => s.clientId === to
      );
      if (targetSocket) {
        targetSocket.emit('peer-ice-candidate', data);
      }
    });
  });

  // Session timeout/cleanup (1 hour inactivity)
  const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
  // --- Min-heap for session expirations ---
  class MinHeap {
    constructor() {
      this.heap = [];
      this.sessionMap = new Map(); // sessionId -> index in heap
    }
    push(sessionId, expiresAt) {
      if (this.sessionMap.has(sessionId)) {
        this.update(sessionId, expiresAt);
        return;
      }
      this.heap.push({ sessionId, expiresAt });
      this.sessionMap.set(sessionId, this.heap.length - 1);
      this._bubbleUp(this.heap.length - 1);
    }
    pop() {
      if (this.heap.length === 0) return null;
      const min = this.heap[0];
      const last = this.heap.pop();
      this.sessionMap.delete(min.sessionId);
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this.sessionMap.set(last.sessionId, 0);
        this._bubbleDown(0);
      }
      return min;
    }
    peek() {
      return this.heap.length > 0 ? this.heap[0] : null;
    }
    update(sessionId, expiresAt) {
      const idx = this.sessionMap.get(sessionId);
      if (idx === undefined) return;
      this.heap[idx].expiresAt = expiresAt;
      this._bubbleUp(idx);
      this._bubbleDown(idx);
    }
    remove(sessionId) {
      const idx = this.sessionMap.get(sessionId);
      if (idx === undefined) return;
      const last = this.heap.pop();
      this.sessionMap.delete(sessionId);
      if (idx < this.heap.length) {
        this.heap[idx] = last;
        this.sessionMap.set(last.sessionId, idx);
        this._bubbleUp(idx);
        this._bubbleDown(idx);
      }
    }
    _bubbleUp(idx) {
      while (idx > 0) {
        const parent = Math.floor((idx - 1) / 2);
        if (this.heap[idx].expiresAt >= this.heap[parent].expiresAt) break;
        [this.heap[idx], this.heap[parent]] = [this.heap[parent], this.heap[idx]];
        this.sessionMap.set(this.heap[idx].sessionId, idx);
        this.sessionMap.set(this.heap[parent].sessionId, parent);
        idx = parent;
      }
    }
    _bubbleDown(idx) {
      const n = this.heap.length;
      while (true) {
        let smallest = idx;
        const left = 2 * idx + 1;
        const right = 2 * idx + 2;
        if (left < n && this.heap[left].expiresAt < this.heap[smallest].expiresAt) smallest = left;
        if (right < n && this.heap[right].expiresAt < this.heap[smallest].expiresAt)
          smallest = right;
        if (smallest === idx) break;
        [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
        this.sessionMap.set(this.heap[idx].sessionId, idx);
        this.sessionMap.set(this.heap[smallest].sessionId, smallest);
        idx = smallest;
      }
    }
  }
  const sessionExpiryHeap = new MinHeap();

  // Helper to update heap on session activity
  function updateSessionExpiry(sessionId, lastUpdated) {
    sessionExpiryHeap.push(sessionId, lastUpdated + SESSION_TIMEOUT_MS);
  }
  function removeSessionExpiry(sessionId) {
    sessionExpiryHeap.remove(sessionId);
  }

  // Helper to delete user-uploaded files for a session (not samples)
  async function deleteUserUploadedFiles(sessionId) {
    const sessionFiles = getSessionFiles(sessionId);
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const samplesDir = path.join(uploadsDir, 'samples');
    const sampleFiles = (await fs.promises.access(samplesDir).then(
      () => true,
      () => false
    ))
      ? new Set(await fs.promises.readdir(samplesDir))
      : new Set();
    Object.values(sessionFiles).forEach(async (fileList) => {
      for (const filename of fileList) {
        // Only delete files that are NOT in the samples directory and not a sample file
        if (!filename.startsWith('samples/') && !sampleFiles.has(filename)) {
          const filePath = path.join(uploadsDir, filename);
          log(`[CLEANUP] Attempting to delete file:`, filePath, 'from url:', filePath);
          await fs.promises.unlink(filePath);
          log(`[CLEANUP] Deleted user-uploaded file: ${filePath}`);
        } else {
          log(`[CLEANUP] Skipped sample file: ${filename}`);
        }
      }
    });
    removeSessionFiles(sessionId);
  }

  // Refactored session cleanup interval
  setInterval(async () => {
    const now = Date.now();
    let top = sessionExpiryHeap.peek();
    while (top && top.expiresAt <= now) {
      const sessionId = top.sessionId;
      const session = getSession(sessionId);
      if (session) {
        io.to(sessionId).emit('session_closed');
        for (const clientId of session.clients.keys()) {
          const clientSocket = io.sockets.sockets.get(clientId);
          if (clientSocket) {
            clientSocket.leave(sessionId);
          }
        }
        await deleteUserUploadedFiles(sessionId);
        deleteSession(sessionId);
        log(`Session ${sessionId} timed out and was removed.`);
      }
      removeSessionExpiry(sessionId);
      top = sessionExpiryHeap.peek();
    }
  }, 60 * 1000);

  // --- Adaptive sync_state broadcast ---
  const BASE_SYNC_INTERVAL = 150; // ms (tighter sync)
  const HIGH_DRIFT_SYNC_INTERVAL = 60; // ms (ultra-tight sync)
  const DRIFT_THRESHOLD = 0.08; // seconds (more sensitive)
  const DRIFT_WINDOW = 10000; // ms (10s)
  const DRIFT_AVG_WINDOW = 8; // Number of drift samples for moving average
  const clientDriftMap = {}; // sessionId -> { clientId: { drift, timestamp, history: [] } }

  // Clean up old drift reports every minute
  setInterval(() => {
    const now = Date.now();
    for (const sessionId in clientDriftMap) {
      for (const clientId in clientDriftMap[sessionId]) {
        if (now - clientDriftMap[sessionId][clientId].timestamp > DRIFT_WINDOW) {
          delete clientDriftMap[sessionId][clientId];
        }
      }
      if (Object.keys(clientDriftMap[sessionId]).length === 0) {
        delete clientDriftMap[sessionId];
      }
    }
  }, 60000);

  // Adaptive sync broadcast using moving average of drift
  setInterval(() => {
    const sessions = getAllSessions();
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(sessions)) {
      let highDrift = false;
      let noRecentDrift = true;
      if (clientDriftMap[sessionId]) {
        let driftSamples = [];
        for (const { drift, timestamp, history } of Object.values(clientDriftMap[sessionId])) {
          if (now - timestamp < DRIFT_WINDOW) {
            noRecentDrift = false;
            if (Array.isArray(history) && history.length > 0) {
              driftSamples = driftSamples.concat(history);
            } else {
              driftSamples.push(drift);
            }
          }
        }
        if (driftSamples.length > 0) {
          const avgDrift = driftSamples.reduce((a, b) => a + b, 0) / driftSamples.length;
          if (avgDrift > DRIFT_THRESHOLD) highDrift = true;
        }
      }
      // If no recent drift reports, treat as high drift (increase sync frequency)
      if (noRecentDrift) highDrift = true;
      if (!highDrift) {
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: getSmoothedTimestamp(sessionId, session.timestamp),
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now(),
          syncVersion: getSyncVersion(sessionId),
        });
      }
    }
  }, BASE_SYNC_INTERVAL);

  // High-drift sessions get extra syncs
  setInterval(() => {
    const sessions = getAllSessions();
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(sessions)) {
      let highDrift = false;
      let noRecentDrift = true;
      if (clientDriftMap[sessionId]) {
        let driftSamples = [];
        for (const { drift, timestamp, history } of Object.values(clientDriftMap[sessionId])) {
          if (now - timestamp < DRIFT_WINDOW) {
            noRecentDrift = false;
            if (Array.isArray(history) && history.length > 0) {
              driftSamples = driftSamples.concat(history);
            } else {
              driftSamples.push(drift);
            }
          }
        }
        if (driftSamples.length > 0) {
          const avgDrift = driftSamples.reduce((a, b) => a + b, 0) / driftSamples.length;
          if (avgDrift > DRIFT_THRESHOLD) highDrift = true;
        }
      }
      // If no recent drift reports, treat as high drift (increase sync frequency)
      if (noRecentDrift) highDrift = true;
      if (highDrift) {
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: getSmoothedTimestamp(sessionId, session.timestamp),
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now(),
          syncVersion: getSyncVersion(sessionId),
        });
      }
    }
  }, HIGH_DRIFT_SYNC_INTERVAL);

  // Add laggy controller warning
  setInterval(() => {
    const sessions = getAllSessions();
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (now - session.lastUpdated > 1000) {
        log('[SYNC][WARNING] Controller device may be laggy for session', sessionId, 'lastUpdated:', session.lastUpdated, 'now:', now);
      }
    }
  }, 1000);
}
