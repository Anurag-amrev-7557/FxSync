import { getSession, createSession, deleteSession, addClient, removeClient, setController, getAllSessions, getClients, updatePlayback, updateTimestamp, getClientIdBySocket, getSocketIdByClientId } from './managers/sessionManager.js';
import { addToQueue, removeFromQueue, getQueue } from './managers/queueManager.js';
import { formatChatMessage, formatReaction } from './managers/chatManager.js';
import { log } from './utils/utils.js';

export function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join_session', ({ sessionId, displayName, deviceInfo, clientId } = {}, callback) => {
      console.log('join_session event received', { sessionId, clientId });
      if (!sessionId || typeof sessionId !== 'string') {
        log('join_session: missing or invalid sessionId');
        return callback && callback({ error: 'No sessionId provided' });
      }
      let session = getSession(sessionId);
      if (!session) {
        session = createSession(sessionId, socket.id, clientId);
        log('Session created:', sessionId);
      }
      addClient(sessionId, socket.id, displayName, deviceInfo, clientId);
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
      // Debug log for controller assignment
      console.log('JOIN CALLBACK:', {
        controllerClientId: session.controllerClientId,
        clientId,
        sessionId,
        controllerId: session.controllerId
      });
      // Always send the correct controllerClientId in the callback
      callback && callback({
        ...session,
        sessionId,
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        controllerClientId: session.controllerClientId
      });
      io.to(sessionId).emit('clients_update', getClients(sessionId));
      if (becameController) {
        io.to(sessionId).emit('controller_change', socket.id);
        io.to(sessionId).emit('controller_client_change', clientId);
      }
    });

    socket.on('play', ({ sessionId, timestamp } = {}) => {
      if (!sessionId || typeof timestamp !== 'number') return;
      const session = getSession(sessionId);
      if (!session) return;
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return;
      updatePlayback(sessionId, { isPlaying: true, timestamp, controllerId: socket.id });
      log('Play in session', sessionId, 'at', timestamp);
      console.log('Emitting sync_state to session', sessionId, 'clients:', Array.from(session.clients.keys()));
      io.to(sessionId).emit('sync_state', {
        isPlaying: true,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: socket.id
      });
    });

    socket.on('pause', ({ sessionId, timestamp } = {}) => {
      if (!sessionId || typeof timestamp !== 'number') return;
      const session = getSession(sessionId);
      if (!session) return;
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return;
      updatePlayback(sessionId, { isPlaying: false, timestamp, controllerId: socket.id });
      log('Pause in session', sessionId, 'at', timestamp);
      console.log('Emitting sync_state to session', sessionId, 'clients:', Array.from(session.clients.keys()));
      io.to(sessionId).emit('sync_state', {
        isPlaying: false,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: socket.id
      });
    });

    socket.on('seek', ({ sessionId, timestamp } = {}) => {
      if (!sessionId || typeof timestamp !== 'number') return;
      const session = getSession(sessionId);
      if (!session) return;
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return;
      updateTimestamp(sessionId, timestamp, socket.id);
      log('Seek in session', sessionId, 'to', timestamp);
      console.log('Emitting sync_state to session', sessionId, 'clients:', Array.from(session.clients.keys()));
      io.to(sessionId).emit('sync_state', {
        isPlaying: session.isPlaying,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: socket.id
      });
    });

    socket.on('sync_request', ({ sessionId } = {}, callback) => {
      if (!sessionId) return callback && callback({ error: 'No sessionId provided' });
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      callback && callback({
        isPlaying: session.isPlaying,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: session.controllerId
      });
    });

    socket.on('request_controller', ({ sessionId } = {}, callback) => {
      if (!sessionId) return callback && callback({ error: 'No sessionId provided' });
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      const clientId = getClientIdBySocket(sessionId, socket.id);
      setController(sessionId, clientId);
      log('Controller changed to client', clientId, 'in session', sessionId);
      io.to(sessionId).emit('controller_change', socket.id);
      io.to(sessionId).emit('controller_client_change', clientId);
      io.to(sessionId).emit('sync_state', {
        isPlaying: session.isPlaying,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: socket.id
      });
      callback && callback({ success: true });
    });

    socket.on('chat_message', ({ sessionId, message, sender } = {}) => {
      if (!sessionId || !message || typeof message !== 'string') return;
      if (!getSession(sessionId)) return;
      log('Chat in session', sessionId, ':', message);
      io.to(sessionId).emit('chat_message', formatChatMessage(sender || socket.id, message));
    });

    socket.on('reaction', ({ sessionId, reaction, sender } = {}) => {
      if (!sessionId || !reaction || typeof reaction !== 'string') return;
      if (!getSession(sessionId)) return;
      log('Reaction in session', sessionId, ':', reaction);
      io.to(sessionId).emit('reaction', formatReaction(sender || socket.id, reaction));
    });

    socket.on('add_to_queue', ({ sessionId, url, title } = {}, callback) => {
      if (!sessionId || !url || typeof url !== 'string') return callback && callback({ error: 'Invalid input' });
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return callback && callback({ error: 'Not allowed' });
      addToQueue(sessionId, url, title);
      log('Queue add in session', sessionId, ':', url);
      io.to(sessionId).emit('queue_update', getQueue(sessionId));
      callback && callback({ success: true });
    });

    socket.on('remove_from_queue', ({ sessionId, index } = {}, callback) => {
      if (!sessionId || typeof index !== 'number') return callback && callback({ error: 'Invalid input' });
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return callback && callback({ error: 'Not allowed' });
      if (!removeFromQueue(sessionId, index)) return callback && callback({ error: 'Invalid index' });
      log('Queue remove in session', sessionId, ':', index);
      io.to(sessionId).emit('queue_update', getQueue(sessionId));
      callback && callback({ success: true });
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
      const parsedClientSent = typeof clientSent === 'number' ? clientSent : Number(clientSent) || null;

      // Optionally, allow client to send an object with more info (future-proofing)
      let clientExtra = {};
      if (clientSent && typeof clientSent === 'object' && clientSent !== null) {
        clientExtra = { ...clientSent };
        if ('clientSent' in clientSent) {
          clientExtra.clientSent = typeof clientSent.clientSent === 'number'
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
            serverReceived,
            serverProcessed,
            serverUptime: Math.round(process.uptime() * 1000),
            serverTimezoneOffset: new Date().getTimezoneOffset(),
            serverIso: new Date(serverReceived).toISOString(),
            serverInfo: {
              nodeVersion: process.version,
              platform: process.platform,
              pid: process.pid
            },
            roundTripEstimate,
            ...clientExtra // echo back any extra client info for advanced sync
          });
        });
      }
    });

    socket.on('disconnect', () => {
      for (const [sessionId, session] of Object.entries(getAllSessions())) {
        removeClient(sessionId, socket.id);
        if (session.controllerId === socket.id) {
          const newSocketId = getSocketIdByClientId(sessionId, session.controllerClientId);
          session.controllerId = newSocketId;
          io.to(sessionId).emit('controller_change', newSocketId);
        }
        if (getClients(sessionId).length === 0) {
          deleteSession(sessionId);
          log('Session deleted (empty):', sessionId);
        } else {
          io.to(sessionId).emit('clients_update', getClients(sessionId));
        }
      }
      log('Socket disconnected:', socket.id);
    });
  });

  // Session timeout/cleanup (1 hour inactivity)
  const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
  setInterval(() => {
    const now = Date.now();
    const sessions = getAllSessions();
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (now - session.lastUpdated > SESSION_TIMEOUT_MS) {
        io.to(sessionId).emit('session_closed');
        for (const clientId of session.clients.keys()) {
          const clientSocket = io.sockets.sockets.get(clientId);
          if (clientSocket) {
            clientSocket.leave(sessionId);
          }
        }
        deleteSession(sessionId);
        log(`Session ${sessionId} timed out and was removed.`);
      }
    }
  }, 60 * 1000);
} 