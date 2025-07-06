import { getSession, createSession, deleteSession, addClient, removeClient, setController, getAllSessions, getClients, updatePlayback, updateTimestamp, getClientIdBySocket, getSocketIdByClientId, addControllerRequest, removeControllerRequest, getPendingControllerRequests, clearExpiredControllerRequests } from './managers/sessionManager.js';
import { addToQueue, removeFromQueue, getQueue } from './managers/queueManager.js';
import { formatChatMessage, formatReaction } from './managers/chatManager.js';
import { log } from './utils/utils.js';
import { getSessionFiles, removeSessionFiles } from './managers/fileManager.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

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
        audioUrl: process.env.AUDIO_URL || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        controllerClientId: session.controllerClientId
      });
      
      // Send current queue to the joining client
      socket.emit('queue_update', getQueue(sessionId));
      
      io.to(sessionId).emit('clients_update', getClients(sessionId));
      if (becameController) {
        io.to(sessionId).emit('controller_change', socket.id);
        io.to(sessionId).emit('controller_client_change', clientId);
      }
      log('Client joined session', sessionId, 'Current queue:', getQueue(sessionId));
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
      // Get current track from queue and selectedTrackIdx
      const queue = session.queue || [];
      const selectedTrackIdx = typeof session.selectedTrackIdx === 'number' ? session.selectedTrackIdx : 0;
      const currentTrack = (queue && queue.length > 0 && queue[selectedTrackIdx]) ? queue[selectedTrackIdx] : null;
      callback && callback({
        isPlaying: session.isPlaying,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: session.controllerId,
        currentTrack
      });
    });

    socket.on('request_controller', ({ sessionId } = {}, callback) => {
      if (!sessionId) return callback && callback({ error: 'No sessionId provided' });
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      
      const requesterClientId = getClientIdBySocket(sessionId, socket.id);
      if (!requesterClientId) return callback && callback({ error: 'Client not found in session' });
      
      // Check if requester is already the controller
      if (session.controllerClientId === requesterClientId) {
        return callback && callback({ error: 'You are already the controller' });
      }
      
      // Check if there's already a pending request from this client
      if (session.pendingControllerRequests.has(requesterClientId)) {
        return callback && callback({ error: 'You already have a pending request' });
      }
      
      // Get requester's display name
      const requesterInfo = session.clients.get(socket.id);
      const requesterName = requesterInfo ? requesterInfo.displayName : `User-${requesterClientId.slice(-4)}`;
      
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
            requestTime: Date.now()
          });
        }
      }
      
      // Notify all clients about the pending request
      io.to(sessionId).emit('controller_requests_update', getPendingControllerRequests(sessionId));
      
      log('Controller request from client', requesterClientId, 'in session', sessionId);
      callback && callback({ success: true, message: 'Request sent to current controller' });
    });

    socket.on('approve_controller_request', ({ sessionId, requesterClientId } = {}, callback) => {
      if (!sessionId) return callback && callback({ error: 'No sessionId provided' });
      if (!requesterClientId) return callback && callback({ error: 'No requesterClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      
      const approverClientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== approverClientId) {
        return callback && callback({ error: 'Only the current controller can approve requests' });
      }
      
      // Check if the request still exists
      if (!session.pendingControllerRequests.has(requesterClientId)) {
        return callback && callback({ error: 'Request not found or expired' });
      }
      
      // Remove the request and transfer controller role
      removeControllerRequest(sessionId, requesterClientId);
      setController(sessionId, requesterClientId);
      
      log('Controller transferred to client', requesterClientId, 'in session', sessionId);
      
      // Notify all clients
      io.to(sessionId).emit('controller_change', getSocketIdByClientId(sessionId, requesterClientId));
      io.to(sessionId).emit('controller_client_change', requesterClientId);
      io.to(sessionId).emit('controller_requests_update', getPendingControllerRequests(sessionId));
      io.to(sessionId).emit('sync_state', {
        isPlaying: session.isPlaying,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: getSocketIdByClientId(sessionId, requesterClientId)
      });
      
      callback && callback({ success: true });
    });

    socket.on('deny_controller_request', ({ sessionId, requesterClientId } = {}, callback) => {
      if (!sessionId) return callback && callback({ error: 'No sessionId provided' });
      if (!requesterClientId) return callback && callback({ error: 'No requesterClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      
      const denierClientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== denierClientId) {
        return callback && callback({ error: 'Only the current controller can deny requests' });
      }
      
      // Remove the request
      removeControllerRequest(sessionId, requesterClientId);
      
      log('Controller request denied for client', requesterClientId, 'in session', sessionId);
      
      // Notify all clients
      io.to(sessionId).emit('controller_requests_update', getPendingControllerRequests(sessionId));
      
      callback && callback({ success: true });
    });

    socket.on('cancel_controller_request', ({ sessionId } = {}, callback) => {
      if (!sessionId) return callback && callback({ error: 'No sessionId provided' });
      
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      
      const requesterClientId = getClientIdBySocket(sessionId, socket.id);
      if (!requesterClientId) return callback && callback({ error: 'Client not found in session' });
      
      // Remove the request
      removeControllerRequest(sessionId, requesterClientId);
      
      log('Controller request cancelled by client', requesterClientId, 'in session', sessionId);
      
      // Notify all clients
      io.to(sessionId).emit('controller_requests_update', getPendingControllerRequests(sessionId));
      
      callback && callback({ success: true });
    });

    socket.on('offer_controller', ({ sessionId, targetClientId } = {}, callback) => {
      if (!sessionId) return callback && callback({ error: 'No sessionId provided' });
      if (!targetClientId) return callback && callback({ error: 'No targetClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      
      const offererClientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== offererClientId) {
        return callback && callback({ error: 'Only the current controller can offer controller role' });
      }
      
      // Check if target is already the controller
      if (session.controllerClientId === targetClientId) {
        return callback && callback({ error: 'Target is already the controller' });
      }
      
      // Get offerer's display name
      const offererInfo = session.clients.get(socket.id);
      const offererName = offererInfo ? offererInfo.displayName : `User-${offererClientId.slice(-4)}`;
      
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
            offerTime: Date.now()
          });
        }
      }
      
      // Notify the offerer that the offer was sent successfully
      socket.emit('controller_offer_sent', {
        sessionId,
        targetClientId,
        targetName,
        offerTime: Date.now()
      });
      
      log('Controller offer sent from', offererClientId, 'to', targetClientId, 'in session', sessionId);
      callback && callback({ success: true, message: `Controller offer sent to ${targetName}` });
    });

    socket.on('accept_controller_offer', ({ sessionId, offererClientId } = {}, callback) => {
      if (!sessionId) return callback && callback({ error: 'No sessionId provided' });
      if (!offererClientId) return callback && callback({ error: 'No offererClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      
      const accepterClientId = getClientIdBySocket(sessionId, socket.id);
      if (!accepterClientId) return callback && callback({ error: 'Client not found in session' });
      
      // Verify the offerer is still the controller
      if (session.controllerClientId !== offererClientId) {
        return callback && callback({ error: 'Offer is no longer valid' });
      }
      
      // Transfer controller role
      setController(sessionId, accepterClientId);
      
      log('Controller transferred to client', accepterClientId, 'in session', sessionId);
      
      // Get accepter's info
      const accepterInfo = session.clients.get(socket.id);
      const accepterName = accepterInfo ? accepterInfo.displayName : `User-${accepterClientId.slice(-4)}`;
      
      // Notify the offerer that their offer was accepted
      const offererSocketId = getSocketIdByClientId(sessionId, offererClientId);
      if (offererSocketId) {
        const offererSocket = io.sockets.sockets.get(offererSocketId);
        if (offererSocket) {
          offererSocket.emit('controller_offer_accepted', {
            sessionId,
            accepterClientId,
            accepterName,
            offerTime: Date.now()
          });
        }
      }
      
      // Notify all clients
      io.to(sessionId).emit('controller_change', getSocketIdByClientId(sessionId, accepterClientId));
      io.to(sessionId).emit('controller_client_change', accepterClientId);
      io.to(sessionId).emit('sync_state', {
        isPlaying: session.isPlaying,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: getSocketIdByClientId(sessionId, accepterClientId)
      });
      
      callback && callback({ success: true });
    });

    socket.on('decline_controller_offer', ({ sessionId, offererClientId } = {}, callback) => {
      if (!sessionId) return callback && callback({ error: 'No sessionId provided' });
      if (!offererClientId) return callback && callback({ error: 'No offererClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return callback && callback({ error: 'Session not found' });
      
      const declinerClientId = getClientIdBySocket(sessionId, socket.id);
      if (!declinerClientId) return callback && callback({ error: 'Client not found in session' });
      
      // Notify the offerer that their offer was declined
      const offererSocketId = getSocketIdByClientId(sessionId, offererClientId);
      if (offererSocketId) {
        const offererSocket = io.sockets.sockets.get(offererSocketId);
        if (offererSocket) {
          offererSocket.emit('controller_offer_declined', {
            sessionId,
            declinerClientId,
            declinerName: session.clients.get(socket.id) ? session.clients.get(socket.id).displayName : `User-${declinerClientId.slice(-4)}`,
            offerTime: Date.now()
          });
        }
      }
      
      log('Controller offer declined by client', declinerClientId, 'in session', sessionId);
      
      callback && callback({ success: true });
    });

    socket.on('chat_message', ({ sessionId, message, sender } = {}) => {
      console.log('Backend: Received chat_message event:', { sessionId, message, sender, socketId: socket.id });
      if (!sessionId || !message || typeof message !== 'string') {
        console.log('Backend: Invalid chat message data:', { sessionId, message, sender });
        return;
      }
      const session = getSession(sessionId);
      console.log('Backend: Available sessions:', Object.keys(getAllSessions()));
      if (!session) {
        console.log('Backend: Session not found:', sessionId);
        return;
      }
      console.log('Backend: Session found, broadcasting message to session:', sessionId);
      log('Chat in session', sessionId, ':', message);
      const formattedMessage = formatChatMessage(sender || socket.id, message);
      console.log('Backend: Formatted message:', formattedMessage);
      io.to(sessionId).emit('chat_message', formattedMessage);
    });

    socket.on('reaction', ({ sessionId, reaction, sender } = {}) => {
      console.log('Backend: Received reaction event:', { sessionId, reaction, sender, socketId: socket.id });
      if (!sessionId || !reaction || typeof reaction !== 'string') {
        console.log('Backend: Invalid reaction data:', { sessionId, reaction, sender });
        return;
      }
      const session = getSession(sessionId);
      if (!session) {
        console.log('Backend: Session not found for reaction:', sessionId);
        return;
      }
      console.log('Backend: Session found, broadcasting reaction to session:', sessionId);
      log('Reaction in session', sessionId, ':', reaction);
      const formattedReaction = formatReaction(sender || socket.id, reaction);
      console.log('Backend: Formatted reaction:', formattedReaction);
      io.to(sessionId).emit('reaction', formattedReaction);
    });

    socket.on('add_to_queue', ({ sessionId, url, title } = {}, callback) => {
      if (!sessionId || !url) return callback && callback({ error: 'Missing sessionId or url' });
      addToQueue(sessionId, url, title);
      const queue = getQueue(sessionId);
      log('[DEBUG] add_to_queue: session', sessionId, 'queue now:', queue);
      io.to(sessionId).emit('queue_update', queue);
      callback && callback({ success: true, queue });
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
     * Enhanced track_change event:
     * - Only controller can change track.
     * - Broadcasts new track index and metadata to all clients.
     * - Optionally supports a "reason" and "initiator" for diagnostics.
     * - Emits a queue_update for clients to refresh their queue state.
     * 
     * Defensive: Handles null/undefined event argument to avoid destructuring errors.
     */
    socket.on('track_change', (data, callback) => {
      data = data || {};
      const { sessionId, idx, reason } = data;

      if (!sessionId) {
        if (callback) callback({ error: 'No sessionId provided' });
        return;
      }
      const session = getSession(sessionId);
      if (!session) {
        if (callback) callback({ error: 'Session not found' });
        return;
      }
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) {
        if (callback) callback({ error: 'Not allowed' });
        return;
      }

      const queue = getQueue(sessionId) || [];
      const track = (typeof idx === 'number' && queue[idx]) ? queue[idx] : null;

      // Debug log for queue and track
      log('[DEBUG] track_change: session', sessionId, 'queue:', queue, 'idx:', idx, 'track:', track);

      const payload = {
        idx,
        track,
        reason: reason || null,
        initiator: clientId,
        timestamp: Date.now()
      };

      io.to(sessionId).emit('queue_update', queue);
      io.to(sessionId).emit('track_change', payload);
      log('Track change in session', sessionId, ':', payload);
      if (callback) callback({ success: true, ...payload });
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

    // Store per-client drift for diagnostics/adaptive correction
    const clientDriftMap = {};

    socket.on('drift_report', ({ sessionId, drift, clientId, timestamp } = {}) => {
      if (!sessionId || typeof drift !== 'number' || !clientId) return;
      if (!clientDriftMap[sessionId]) clientDriftMap[sessionId] = {};
      clientDriftMap[sessionId][clientId] = { drift, timestamp };
      log(`[DRIFT] Session ${sessionId} Client ${clientId}: Drift=${drift.toFixed(3)}s at ${new Date(timestamp).toISOString()}`);
      // (Optional) Adaptive correction logic can be added here
    });

    socket.on('disconnect', () => {
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
        }
        // Only delete files if the session is now empty
        if (getClients(sessionId).length === 0) {
          // Delete all files for this session (user uploads only)
          const sessionFiles = getSessionFiles(sessionId);
          const uploadsDir = path.join(process.cwd(), 'uploads');
          const samplesDir = path.join(uploadsDir, 'samples');
          const sampleFiles = fs.existsSync(samplesDir) ? new Set(fs.readdirSync(samplesDir)) : new Set();
          Object.values(sessionFiles).forEach(fileList => {
            fileList.forEach(filename => {
              // Only delete files that are NOT in the samples directory and not a sample file
              if (!filename.startsWith('samples/') && !sampleFiles.has(filename)) {
                const filePath = path.join(uploadsDir, filename);
                fs.unlink(filePath, (err) => {
                  if (err) {
                    console.error(`[CLEANUP] Failed to delete file ${filePath}:`, err);
                  } else {
                    log(`[CLEANUP] Deleted user-uploaded file: ${filePath}`);
                  }
                });
              } else {
                log(`[CLEANUP] Skipped sample file: ${filename}`);
              }
            });
          });
          removeSessionFiles(sessionId);
          deleteSession(sessionId);
          log(`[CLEANUP] Session deleted (empty): ${sessionId}`);
        }
        io.to(sessionId).emit('clients_update', getClients(sessionId));
        io.to(sessionId).emit('controller_requests_update', getPendingControllerRequests(sessionId));
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
      } else {
        // Clean up expired controller requests
        const hadExpiredRequests = session.pendingControllerRequests.size > 0;
        clearExpiredControllerRequests(sessionId);
        if (hadExpiredRequests && session.pendingControllerRequests.size === 0) {
          io.to(sessionId).emit('controller_requests_update', []);
        }
      }
    }
  }, 60 * 1000);

  // Periodic authoritative sync broadcast (every 2 seconds)
  setInterval(() => {
    const sessions = getAllSessions();
    for (const [sessionId, session] of Object.entries(sessions)) {
      io.to(sessionId).emit('sync_state', {
        isPlaying: session.isPlaying,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: session.controllerId
      });
    }
  }, 2000);
} 