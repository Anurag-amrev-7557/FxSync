import { getSession, createSession, deleteSession, addClient, removeClient, setController, getAllSessions, getClients, updatePlayback, updateTimestamp, getClientIdBySocket, getSocketIdByClientId, addControllerRequest, removeControllerRequest, getPendingControllerRequests, clearExpiredControllerRequests } from './managers/sessionManager.js';
import { addToQueue, removeFromQueue, getQueue } from './managers/queueManager.js';
import { formatChatMessage, formatReaction } from './managers/chatManager.js';
import { log } from './utils/utils.js';
import { getSessionFiles, removeSessionFiles } from './managers/fileManager.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// Helper to build full session sync state for advanced sync
function buildSessionSyncState(session) {
  const queue = Array.isArray(session.queue) ? session.queue : [];
  const selectedTrackIdx = Number.isInteger(session.selectedTrackIdx) ? session.selectedTrackIdx : 0;
  const currentTrack = (queue.length > 0 && queue[selectedTrackIdx]) ? queue[selectedTrackIdx] : null;
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

export function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join_session', ({ sessionId, displayName, deviceInfo, clientId } = {}, callback) => {
      console.log('join_session event received', { sessionId, clientId });
      if (!sessionId || typeof sessionId !== 'string') {
        log('join_session: missing or invalid sessionId');
        return typeof callback === "function" && callback({ error: 'No sessionId provided' });
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
      const syncState = buildSessionSyncState(session);
      typeof callback === "function" && callback({
        ...syncState,
        sessionId,
        audioUrl: process.env.AUDIO_URL || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
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
        controllerId: socket.id,
        serverTime: Date.now()
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
        controllerId: socket.id,
        serverTime: Date.now()
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
        controllerId: socket.id,
        serverTime: Date.now()
      });
    });

    // Enhanced: Handle immediate sync state broadcasts for better timing
    socket.on('sync_state_broadcast', ({ sessionId, isPlaying, timestamp, lastUpdated, controllerId, serverTime } = {}) => {
      if (!sessionId || typeof timestamp !== 'number') return;
      const session = getSession(sessionId);
      if (!session) return;
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return;
      
      // Update session state
      updatePlayback(sessionId, { isPlaying, timestamp, controllerId });
      
      // Immediately broadcast to all clients
      io.to(sessionId).emit('sync_state', {
        isPlaying,
        timestamp,
        lastUpdated: lastUpdated || Date.now(),
        controllerId,
        serverTime: serverTime || Date.now()
      });
      
      log('Immediate sync_state broadcast for session', sessionId, 'timestamp:', timestamp);
    });

    socket.on('sync_request', async ({ sessionId } = {}, callback) => {
      try {
        if (!sessionId) {
          if (typeof callback === "function") callback({ error: 'No sessionId provided' });
          return;
        }
        const session = getSession(sessionId);
        if (!session) {
          if (typeof callback === "function") callback({ error: 'Session not found' });
          return;
        }
        const response = buildSessionSyncState(session);
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('[socket][sync_request] Responding to sync_request for session', sessionId, response);
        }
        if (typeof callback === "function") callback(response);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('[socket][sync_request] Error handling sync_request:', err);
        }
        if (typeof callback === "function") callback({ error: 'Internal server error' });
      }
    });

    socket.on('request_controller', ({ sessionId } = {}, callback) => {
      if (!sessionId) return typeof callback === "function" && callback({ error: 'No sessionId provided' });
      const session = getSession(sessionId);
      if (!session) return typeof callback === "function" && callback({ error: 'Session not found' });
      
      const requesterClientId = getClientIdBySocket(sessionId, socket.id);
      if (!requesterClientId) return typeof callback === "function" && callback({ error: 'Client not found in session' });
      
      // Check if requester is already the controller
      if (session.controllerClientId === requesterClientId) {
        return typeof callback === "function" && callback({ error: 'You are already the controller' });
      }
      
      // Check if there's already a pending request from this client
      if (session.pendingControllerRequests.has(requesterClientId)) {
        return typeof callback === "function" && callback({ error: 'You already have a pending request' });
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
      typeof callback === "function" && callback({ success: true, message: 'Request sent to current controller' });
    });

    socket.on('approve_controller_request', ({ sessionId, requesterClientId } = {}, callback) => {
      if (!sessionId) return typeof callback === "function" && callback({ error: 'No sessionId provided' });
      if (!requesterClientId) return typeof callback === "function" && callback({ error: 'No requesterClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return typeof callback === "function" && callback({ error: 'Session not found' });
      
      const approverClientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== approverClientId) {
        return typeof callback === "function" && callback({ error: 'Only the current controller can approve requests' });
      }
      
      // Check if the request still exists
      if (!session.pendingControllerRequests.has(requesterClientId)) {
        return typeof callback === "function" && callback({ error: 'Request not found or expired' });
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
        controllerId: getSocketIdByClientId(sessionId, requesterClientId),
        serverTime: Date.now()
      });
      
      typeof callback === "function" && callback({ success: true });
    });

    socket.on('deny_controller_request', ({ sessionId, requesterClientId } = {}, callback) => {
      if (!sessionId) return typeof callback === "function" && callback({ error: 'No sessionId provided' });
      if (!requesterClientId) return typeof callback === "function" && callback({ error: 'No requesterClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return typeof callback === "function" && callback({ error: 'Session not found' });
      
      const denierClientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== denierClientId) {
        return typeof callback === "function" && callback({ error: 'Only the current controller can deny requests' });
      }
      
      // Remove the request
      removeControllerRequest(sessionId, requesterClientId);
      
      log('Controller request denied for client', requesterClientId, 'in session', sessionId);
      
      // Notify all clients
      io.to(sessionId).emit('controller_requests_update', getPendingControllerRequests(sessionId));
      
      typeof callback === "function" && callback({ success: true });
    });

    socket.on('cancel_controller_request', ({ sessionId } = {}, callback) => {
      if (!sessionId) return typeof callback === "function" && callback({ error: 'No sessionId provided' });
      
      const session = getSession(sessionId);
      if (!session) return typeof callback === "function" && callback({ error: 'Session not found' });
      
      const requesterClientId = getClientIdBySocket(sessionId, socket.id);
      if (!requesterClientId) return typeof callback === "function" && callback({ error: 'Client not found in session' });
      
      // Remove the request
      removeControllerRequest(sessionId, requesterClientId);
      
      log('Controller request cancelled by client', requesterClientId, 'in session', sessionId);
      
      // Notify all clients
      io.to(sessionId).emit('controller_requests_update', getPendingControllerRequests(sessionId));
      
      typeof callback === "function" && callback({ success: true });
    });

    socket.on('offer_controller', ({ sessionId, targetClientId } = {}, callback) => {
      if (!sessionId) return typeof callback === "function" && callback({ error: 'No sessionId provided' });
      if (!targetClientId) return typeof callback === "function" && callback({ error: 'No targetClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return typeof callback === "function" && callback({ error: 'Session not found' });
      
      const offererClientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== offererClientId) {
        return typeof callback === "function" && callback({ error: 'Only the current controller can offer controller role' });
      }
      
      // Check if target is already the controller
      if (session.controllerClientId === targetClientId) {
        return typeof callback === "function" && callback({ error: 'Target is already the controller' });
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
      typeof callback === "function" && callback({ success: true, message: `Controller offer sent to ${targetName}` });
    });

    socket.on('accept_controller_offer', ({ sessionId, offererClientId } = {}, callback) => {
      if (!sessionId) return typeof callback === "function" && callback({ error: 'No sessionId provided' });
      if (!offererClientId) return typeof callback === "function" && callback({ error: 'No offererClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return typeof callback === "function" && callback({ error: 'Session not found' });
      
      const accepterClientId = getClientIdBySocket(sessionId, socket.id);
      if (!accepterClientId) return typeof callback === "function" && callback({ error: 'Client not found in session' });
      
      // Verify the offerer is still the controller
      if (session.controllerClientId !== offererClientId) {
        return typeof callback === "function" && callback({ error: 'Offer is no longer valid' });
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
        controllerId: getSocketIdByClientId(sessionId, accepterClientId),
        serverTime: Date.now()
      });
      
      typeof callback === "function" && callback({ success: true });
    });

    socket.on('decline_controller_offer', ({ sessionId, offererClientId } = {}, callback) => {
      if (!sessionId) return typeof callback === "function" && callback({ error: 'No sessionId provided' });
      if (!offererClientId) return typeof callback === "function" && callback({ error: 'No offererClientId provided' });
      
      const session = getSession(sessionId);
      if (!session) return typeof callback === "function" && callback({ error: 'Session not found' });
      
      const declinerClientId = getClientIdBySocket(sessionId, socket.id);
      if (!declinerClientId) return typeof callback === "function" && callback({ error: 'Client not found in session' });
      
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
      
      typeof callback === "function" && callback({ success: true });
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

    /**
     * Enhanced add_to_queue event:
     * - Validates input more strictly (URL, title).
     * - Optionally supports metadata (artist, duration, etc) for future extensibility.
     * - Prevents duplicate tracks (by URL) in the queue.
     * - Optionally allows only the controller to add tracks (uncomment to enforce).
     * - Broadcasts queue_update and emits a track_change if this is the first track.
     * - Returns detailed result in callback.
     */
    socket.on('add_to_queue', (data = {}, callback) => {
      const { sessionId, url, title, ...meta } = data || {};
      if (!sessionId || typeof sessionId !== 'string' || !url || typeof url !== 'string') {
        return typeof callback === "function" && callback({ error: 'Missing or invalid sessionId or url' });
      }
      // Optionally: Only controller can add tracks (uncomment to enforce)
      // const session = getSession(sessionId);
      // const clientId = getClientIdBySocket(sessionId, socket.id);
      // if (!session || session.controllerClientId !== clientId) {
      //   return callback && callback({ error: 'Only the controller can add tracks' });
      // }

      // Enhanced: Prevent duplicate URLs in queue
      const queue = getQueue(sessionId) || [];
      if (queue.some(track => track && track.url === url)) {
        return typeof callback === "function" && callback({ error: 'Track already in queue' });
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
          initiator: getClientIdBySocket(sessionId, socket.id)
        });
      }

      typeof callback === "function" && callback({ success: true, queue: updatedQueue });
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
    socket.on('remove_from_queue', ({ sessionId, index } = {}, callback) => {
      // Validate input
      if (!sessionId || typeof sessionId !== 'string' || typeof index !== 'number' || index < 0) {
        return typeof callback === "function" && callback({ error: 'Invalid input' });
      }
      const session = getSession(sessionId);
      if (!session) return typeof callback === "function" && callback({ error: 'Session not found' });
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return typeof callback === "function" && callback({ error: 'Not allowed' });

      const queue = getQueue(sessionId) || [];
      if (index >= queue.length) {
        return typeof callback === "function" && callback({ error: 'Index out of bounds' });
      }
      const removedTrack = queue[index];

      // Remove the track
      const removed = removeFromQueue(sessionId, index);
      if (!removed) return typeof callback === "function" && callback({ error: 'Invalid index' });

      const updatedQueue = getQueue(sessionId) || [];
      log('[DEBUG] remove_from_queue: session', sessionId, 'removed index', index, 'track:', removedTrack, 'queue now:', updatedQueue);

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
            timestamp: Date.now()
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
            timestamp: Date.now()
          };
        }
        io.to(sessionId).emit('track_change', trackChangePayload);
      } else if (
        typeof session.selectedTrackIdx === 'number' &&
        index < session.selectedTrackIdx
      ) {
        // If a track before the current was removed, decrement selectedTrackIdx
        session.selectedTrackIdx = Math.max(0, session.selectedTrackIdx - 1);
      }

      io.to(sessionId).emit('queue_update', updatedQueue);

      typeof callback === "function" && callback({
        success: true,
        removedIndex: index,
        removedTrack,
        queue: updatedQueue,
        ...(trackChangePayload ? { trackChange: trackChangePayload } : {})
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
    socket.on('track_change', (data, callback) => {
      data = data || {};
      const { sessionId, idx, reason, extra, autoAdvance, force } = data;

      if (!sessionId) {
        if (typeof callback === "function") callback({ error: 'No sessionId provided' });
        return;
      }
      const session = getSession(sessionId);
      if (!session) {
        if (typeof callback === "function") callback({ error: 'Session not found' });
        return;
      }
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) {
        if (typeof callback === "function") callback({ error: 'Not allowed' });
        io.to(socket.id).emit('track_change_failed', {
          error: 'Not allowed',
          sessionId,
          attemptedBy: clientId,
          timestamp: Date.now()
        });
        return;
      }

      const queue = getQueue(sessionId) || [];
      let newIdx = typeof idx === 'number' ? idx : 0;
      let track = (queue.length > 0 && typeof newIdx === 'number' && queue[newIdx]) ? queue[newIdx] : null;

      // Debug log for queue and track BEFORE emitting events
      console.log('[SOCKET][track_change] About to emit. sessionId:', sessionId, 'queue:', queue, 'newIdx:', newIdx, 'track:', track, 'session:', JSON.stringify(session));

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
        log('[DEBUG][track_change] session:', sessionId, 'queue:', queue, 'idx:', newIdx, 'track:', track, 'reason:', reason, 'extra:', extra, 'autoAdvance:', autoAdvance, 'force:', force);
      }

      const payload = {
        idx: newIdx,
        track,
        reason: reason || null,
        initiator: clientId,
        timestamp: Date.now(),
        ...autoAdvanceInfo,
        ...(extra && typeof extra === 'object' ? { extra } : {})
      };

      io.to(sessionId).emit('queue_update', queue);
      io.to(sessionId).emit('track_change', payload);
      log('Track change in session', sessionId, ':', payload);

      // Emit sync_state after track change so all clients get the latest play state and timestamp
      io.to(sessionId).emit('sync_state', {
        isPlaying: session.isPlaying,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: session.controllerId,
        serverTime: Date.now()
      });

      if (typeof callback === "function") callback({ success: true, ...payload });
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

      if (typeof callback === "function") {
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

  // --- Adaptive sync_state broadcast ---
  const BASE_SYNC_INTERVAL = 300; // ms (reduced from 500ms for more frequent sync)
  const HIGH_DRIFT_SYNC_INTERVAL = 150; // ms (reduced from 200ms for faster high-drift sync)
  const DRIFT_THRESHOLD = 0.15; // seconds (reduced from 0.2s to match frontend)
  const DRIFT_WINDOW = 10000; // ms (10s)
  const clientDriftMap = {}; // sessionId -> { clientId: { drift, timestamp } }

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

  // Adaptive sync broadcast
  setInterval(() => {
    const sessions = getAllSessions();
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(sessions)) {
      let highDrift = false;
      if (clientDriftMap[sessionId]) {
        for (const { drift, timestamp } of Object.values(clientDriftMap[sessionId])) {
          if (now - timestamp < DRIFT_WINDOW && drift > DRIFT_THRESHOLD) {
            highDrift = true;
            break;
          }
        }
      }
      if (!highDrift) {
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now()
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
      if (clientDriftMap[sessionId]) {
        for (const { drift, timestamp } of Object.values(clientDriftMap[sessionId])) {
          if (now - timestamp < DRIFT_WINDOW && drift > DRIFT_THRESHOLD) {
            highDrift = true;
            break;
          }
        }
      }
      if (highDrift) {
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now()
        });
      }
    }
  }, HIGH_DRIFT_SYNC_INTERVAL);
} 