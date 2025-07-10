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
        serverTime: Date.now(),
        syncSeq: session.syncSeq
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
        serverTime: Date.now(),
        syncSeq: session.syncSeq
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
        serverTime: Date.now(),
        syncSeq: session.syncSeq
      });
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

    // Enhanced drift report handling with ML integration
    socket.on('drift_report', ({ sessionId, drift, rtt, jitter, deviceType, networkQuality, clientTime } = {}) => {
      if (!sessionId || typeof drift !== 'number') return;
      
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (!clientId) return;
      
      const now = Date.now();
      
      // Store drift data for analysis
      if (!clientDriftMap[sessionId]) {
        clientDriftMap[sessionId] = {};
      }
      
      clientDriftMap[sessionId][clientId] = {
        drift: Math.abs(drift),
        timestamp: now,
        deviceType: deviceType || 'unknown',
        networkQuality: networkQuality || 'unknown',
        rtt: rtt || null,
        jitter: jitter || null,
        clientTime: clientTime || null,
        analytics: {
          reportCount: (clientDriftMap[sessionId][clientId]?.analytics?.reportCount || 0) + 1,
          lastReportTime: now,
          avgDrift: calculateRollingAverage(
            clientDriftMap[sessionId][clientId]?.analytics?.avgDrift || 0,
            Math.abs(drift),
            clientDriftMap[sessionId][clientId]?.analytics?.reportCount || 0
          )
        }
      };
      
      // Update ML prediction model
      const predictionModel = predictDrift(sessionId, clientId, Math.abs(drift));
      
      // Log drift report with ML insights
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ML] Drift report for ${clientId} in ${sessionId}:`, {
          drift: Math.abs(drift),
          predictedDrift: predictionModel.prediction,
          confidence: predictionModel.confidence,
          pattern: recognizeDriftPattern(sessionId, clientId),
          deviceType,
          networkQuality
        });
      }
      
      // Trigger optimization if significant drift detected
      if (Math.abs(drift) > DRIFT_THRESHOLD) {
        optimizeSyncIntervals(sessionId);
      }
    });
    
    // Helper function for rolling average calculation
    function calculateRollingAverage(currentAvg, newValue, count) {
      if (count === 0) return newValue;
      return (currentAvg * (count - 1) + newValue) / count;
    }

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
        serverTime: Date.now(),
        syncSeq: session.syncSeq
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
        serverTime: Date.now(),
        syncSeq: session.syncSeq
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
      let { sessionId, idx, reason, extra, autoAdvance, force, track: customTrack } = data;

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

      let queue = getQueue(sessionId) || [];
      let newIdx = typeof idx === 'number' ? idx : 0;
      let track = (queue.length > 0 && typeof newIdx === 'number' && queue[newIdx]) ? queue[newIdx] : null;

      // --- Backend safeguard: If a custom track is provided and not in the queue, add it ---
      if (customTrack && customTrack.url && !queue.some(t => t && t.url === customTrack.url)) {
        addToQueue(sessionId, customTrack.url, customTrack.title || '', customTrack.meta || {});
        queue = getQueue(sessionId) || [];
        newIdx = queue.findIndex(t => t && t.url === customTrack.url);
        track = queue[newIdx];
      }

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

      // --- Set playback state for new track to autoplay ---
      session.timestamp = 0;
      session.isPlaying = true;
      session.lastUpdated = Date.now();
      session.syncSeq = (session.syncSeq || 0) + 1;

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

    // --- Robust NTP-like time sync event for clients ---
    socket.on('time_sync', (data = {}, callback) => {
      const serverReceived = Date.now();
      // Optionally, do any processing or logging here
      const serverProcessed = Date.now();
      if (typeof callback === 'function') {
        callback({
          serverReceived,
          serverProcessed,
          serverTime: serverProcessed, // Use processed time for best accuracy
          clientSent: data.clientSent,
          // Optionally: serverIso: new Date(serverProcessed).toISOString(),
          // Optionally: serverUptime: process.uptime(),
        });
      }
    });

    socket.on('drift_report', ({ sessionId, drift, clientId, timestamp, manual, resyncDuration, beforeDrift, afterDrift, improvement, analytics } = {}) => {
      if (!sessionId || typeof drift !== 'number' || !clientId) return;
      if (!clientDriftMap[sessionId]) clientDriftMap[sessionId] = {};
      
      // Enhanced drift data storage with device and network analytics
      clientDriftMap[sessionId][clientId] = {
        drift,
        timestamp: timestamp || Date.now(),
        deviceType: analytics?.deviceType || 'unknown',
        networkQuality: analytics?.networkQuality || 'unknown',
        analytics: {
          adaptiveThreshold: analytics?.adaptiveThreshold,
          rtt: analytics?.rtt,
          jitter: analytics?.jitter,
          audioLatency: analytics?.audioLatency,
          driftHistory: analytics?.driftHistory || []
        }
      };
      
      // Enhanced logging with more context
      let logMessage = `[DRIFT] Session ${sessionId} Client ${clientId}: Drift=${drift.toFixed(3)}s at ${new Date(timestamp).toISOString()}`;
      
      if (analytics?.deviceType) {
        logMessage += ` Device: ${analytics.deviceType}`;
      }
      if (analytics?.networkQuality) {
        logMessage += ` Network: ${analytics.networkQuality}`;
      }
      if (analytics?.rtt) {
        logMessage += ` RTT: ${analytics.rtt.toFixed(1)}ms`;
      }
      
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
      
      // Log significant drift events for monitoring
      if (drift > 0.3) {
        log(`[DRIFT] High drift detected: ${drift.toFixed(3)}s for client ${clientId} in session ${sessionId}`, {
          deviceType: analytics?.deviceType,
          networkQuality: analytics?.networkQuality,
          rtt: analytics?.rtt,
          jitter: analytics?.jitter
        });
      }
      
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
          resyncDuration
        });
        
        // Keep only last 10 resyncs
        if (clientDriftMap[sessionId][clientId].resyncHistory.length > 10) {
          clientDriftMap[sessionId][clientId].resyncHistory.shift();
        }
      }
    });

    // Avatar position update: ultra-low-latency broadcast to all other clients in the session
    // Use volatile emit for best-effort, lightning-fast delivery (okay to drop if network congested)
    socket.on('avatar_position_update', ({ sessionId, clientId, position }) => {
      if (!sessionId || !clientId || !Array.isArray(position)) return;
      // Use .volatile to minimize latency (does not queue if client is not ready)
      socket.volatile.to(sessionId).emit('avatar_position_update', { clientId, position });
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

    // --- WebRTC Peer-to-Peer Signaling for Time Sync ---
    socket.on('peer-offer', ({ to, from, offer }) => {
      const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.clientId === to || s.id === to);
      if (targetSocket) {
        targetSocket.emit('peer-offer', { from, offer });
      }
    });
    socket.on('peer-answer', ({ to, from, answer }) => {
      const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.clientId === to || s.id === to);
      if (targetSocket) {
        targetSocket.emit('peer-answer', { from, answer });
      }
    });
    socket.on('peer-ice-candidate', ({ to, from, candidate }) => {
      const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.clientId === to || s.id === to);
      if (targetSocket) {
        targetSocket.emit('peer-ice-candidate', { from, candidate });
      }
    });

    // --- Heartbeat/Ping event for client connectivity checks ---
    socket.on('ping', (data, callback) => {
      if (typeof callback === 'function') {
        callback({ serverTime: Date.now() });
      }
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

  // --- Enhanced Adaptive sync_state broadcast with device-specific handling ---
  const BASE_SYNC_INTERVAL = 300; // ms (was 500)
  const HIGH_DRIFT_SYNC_INTERVAL = 100; // ms (was 200)
  const CRITICAL_DRIFT_SYNC_INTERVAL = 50; // ms for critical drift situations
  const DRIFT_THRESHOLD = 0.2; // seconds
  const CRITICAL_DRIFT_THRESHOLD = 0.5; // seconds
  const DRIFT_WINDOW = 10000; // ms (10s)
  const clientDriftMap = {}; // sessionId -> { clientId: { drift, timestamp, deviceType, networkQuality, analytics } }
  const sessionSyncStats = {}; // sessionId -> { avgDrift, maxDrift, deviceTypes, networkQualities }
  
  // Advanced drift prediction and ML-based sync optimization
  const driftPredictionModels = {}; // sessionId -> { clientId: { history, trend, prediction, confidence } }
  const syncOptimizationData = {}; // sessionId -> { optimalIntervals, driftPatterns, deviceProfiles }
  const ML_SYNC_CONFIG = {
    HISTORY_WINDOW: 30000, // 30s of drift history
    PREDICTION_HORIZON: 5000, // 5s prediction horizon
    MIN_CONFIDENCE: 0.7, // Minimum confidence for ML predictions
    TREND_ANALYSIS_WINDOW: 10000, // 10s for trend analysis
    PATTERN_RECOGNITION_THRESHOLD: 0.8, // Pattern recognition confidence
    ADAPTIVE_LEARNING_RATE: 0.1, // Learning rate for model updates
    MAX_HISTORY_SIZE: 100, // Maximum drift history entries per client
    SYNC_OPTIMIZATION_INTERVAL: 5000 // 5s optimization interval
  };

  // Enhanced drift analysis and device profiling
  function analyzeSessionDrift(sessionId) {
    if (!clientDriftMap[sessionId]) return { highDrift: false, criticalDrift: false, deviceTypes: [], networkQualities: [] };
    
    const now = Date.now();
    const recentDrifts = [];
    const deviceTypes = new Set();
    const networkQualities = new Set();
    let highDrift = false;
    let criticalDrift = false;
    
    for (const [clientId, data] of Object.entries(clientDriftMap[sessionId])) {
      if (now - data.timestamp < DRIFT_WINDOW) {
        recentDrifts.push(data.drift);
        if (data.deviceType) deviceTypes.add(data.deviceType);
        if (data.networkQuality) networkQualities.add(data.networkQuality);
        
        if (data.drift > CRITICAL_DRIFT_THRESHOLD) {
          criticalDrift = true;
        } else if (data.drift > DRIFT_THRESHOLD) {
          highDrift = true;
        }
      }
    }
    
    // Calculate session statistics
    const avgDrift = recentDrifts.length > 0 ? recentDrifts.reduce((a, b) => a + b, 0) / recentDrifts.length : 0;
    const maxDrift = recentDrifts.length > 0 ? Math.max(...recentDrifts) : 0;
    
    sessionSyncStats[sessionId] = {
      avgDrift,
      maxDrift,
      deviceTypes: Array.from(deviceTypes),
      networkQualities: Array.from(networkQualities),
      clientCount: recentDrifts.length,
      lastUpdate: now
    };
    
    return { highDrift, criticalDrift, deviceTypes: Array.from(deviceTypes), networkQualities: Array.from(networkQualities) };
  }

  // Device-specific sync intervals
  function getDeviceSpecificSyncInterval(deviceTypes, networkQualities) {
    // Mobile devices need more frequent syncs
    if (deviceTypes.includes('mobile') || deviceTypes.includes('lowEnd')) {
      return Math.min(BASE_SYNC_INTERVAL / 2, 150); // 150ms for mobile
    }
    
    // Poor network conditions need more frequent syncs
    if (networkQualities.includes('poor')) {
      return Math.min(BASE_SYNC_INTERVAL / 2, 150); // 150ms for poor network
    }
    
    // Good conditions can use standard interval
    return BASE_SYNC_INTERVAL;
  }

  // Advanced drift prediction using machine learning
  function predictDrift(sessionId, clientId, currentDrift) {
    if (!driftPredictionModels[sessionId]) {
      driftPredictionModels[sessionId] = {};
    }
    
    if (!driftPredictionModels[sessionId][clientId]) {
      driftPredictionModels[sessionId][clientId] = {
        history: [],
        trend: 0,
        prediction: 0,
        confidence: 0,
        lastUpdate: Date.now()
      };
    }
    
    const model = driftPredictionModels[sessionId][clientId];
    const now = Date.now();
    
    // Add current drift to history
    model.history.push({
      drift: currentDrift,
      timestamp: now,
      deviceType: clientDriftMap[sessionId]?.[clientId]?.deviceType || 'unknown',
      networkQuality: clientDriftMap[sessionId]?.[clientId]?.networkQuality || 'unknown'
    });
    
    // Keep history within window and size limits
    model.history = model.history.filter(entry => 
      now - entry.timestamp < ML_SYNC_CONFIG.HISTORY_WINDOW
    ).slice(-ML_SYNC_CONFIG.MAX_HISTORY_SIZE);
    
    // Calculate trend using linear regression
    if (model.history.length >= 3) {
      const recentHistory = model.history.slice(-10); // Last 10 entries
      const xValues = recentHistory.map((_, i) => i);
      const yValues = recentHistory.map(entry => entry.drift);
      
      const { slope, confidence } = calculateLinearTrend(xValues, yValues);
      model.trend = slope;
      model.confidence = confidence;
      
      // Predict future drift
      const timeHorizon = ML_SYNC_CONFIG.PREDICTION_HORIZON / 1000; // Convert to seconds
      model.prediction = currentDrift + (slope * timeHorizon);
    }
    
    model.lastUpdate = now;
    return model;
  }
  
  // Linear regression for trend analysis
  function calculateLinearTrend(xValues, yValues) {
    const n = xValues.length;
    if (n < 2) return { slope: 0, confidence: 0 };
    
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssRes = yValues.reduce((sum, y, i) => {
      const predicted = slope * xValues[i] + intercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    const ssTot = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const confidence = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
    
    return { slope, confidence: Math.max(0, Math.min(1, confidence)) };
  }
  
  // Pattern recognition for drift behavior
  function recognizeDriftPattern(sessionId, clientId) {
    const model = driftPredictionModels[sessionId]?.[clientId];
    if (!model || model.history.length < 5) return null;
    
    const recentDrifts = model.history.slice(-10).map(entry => entry.drift);
    const patterns = {
      oscillating: detectOscillatingPattern(recentDrifts),
      accelerating: detectAcceleratingPattern(recentDrifts),
      stabilizing: detectStabilizingPattern(recentDrifts),
      random: detectRandomPattern(recentDrifts)
    };
    
    const bestPattern = Object.entries(patterns).reduce((best, [name, confidence]) => 
      confidence > best.confidence ? { name, confidence } : best
    , { name: 'unknown', confidence: 0 });
    
    return bestPattern.confidence > ML_SYNC_CONFIG.PATTERN_RECOGNITION_THRESHOLD ? bestPattern : null;
  }
  
  // Pattern detection algorithms
  function detectOscillatingPattern(drifts) {
    if (drifts.length < 4) return 0;
    let oscillations = 0;
    for (let i = 1; i < drifts.length - 1; i++) {
      if ((drifts[i] > drifts[i-1] && drifts[i] > drifts[i+1]) || 
          (drifts[i] < drifts[i-1] && drifts[i] < drifts[i+1])) {
        oscillations++;
      }
    }
    return Math.min(1, oscillations / (drifts.length - 2));
  }
  
  function detectAcceleratingPattern(drifts) {
    if (drifts.length < 3) return 0;
    const changes = [];
    for (let i = 1; i < drifts.length; i++) {
      changes.push(drifts[i] - drifts[i-1]);
    }
    
    let accelerating = 0;
    for (let i = 1; i < changes.length; i++) {
      if (Math.abs(changes[i]) > Math.abs(changes[i-1])) {
        accelerating++;
      }
    }
    return Math.min(1, accelerating / (changes.length - 1));
  }
  
  function detectStabilizingPattern(drifts) {
    if (drifts.length < 3) return 0;
    const variance = calculateVariance(drifts);
    const meanVariance = variance / drifts.length;
    return Math.max(0, 1 - (meanVariance / 0.1)); // Normalize to 0-1
  }
  
  function detectRandomPattern(drifts) {
    if (drifts.length < 5) return 0;
    const autocorrelation = calculateAutocorrelation(drifts);
    return Math.max(0, 1 - autocorrelation); // Lower autocorrelation = more random
  }
  
  // Statistical helper functions
  function calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  }
  
  function calculateAutocorrelation(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = calculateVariance(values);
    
    let autocorr = 0;
    for (let lag = 1; lag < Math.min(values.length, 5); lag++) {
      let sum = 0;
      for (let i = lag; i < values.length; i++) {
        sum += (values[i] - mean) * (values[i - lag] - mean);
      }
      autocorr += sum / (values.length - lag);
    }
    
    return variance > 0 ? Math.abs(autocorr / variance) : 0;
  }
  
  // Optimize sync intervals based on ML predictions
  function optimizeSyncIntervals(sessionId) {
    if (!syncOptimizationData[sessionId]) {
      syncOptimizationData[sessionId] = {
        optimalIntervals: {},
        driftPatterns: {},
        deviceProfiles: {},
        lastOptimization: Date.now()
      };
    }
    
    const optimization = syncOptimizationData[sessionId];
    const now = Date.now();
    
    // Analyze each client's drift patterns
    for (const [clientId, model] of Object.entries(driftPredictionModels[sessionId] || {})) {
      const pattern = recognizeDriftPattern(sessionId, clientId);
      optimization.driftPatterns[clientId] = pattern;
      
      // Calculate optimal sync interval based on pattern and prediction
      let optimalInterval = BASE_SYNC_INTERVAL;
      
      if (pattern) {
        switch (pattern.name) {
          case 'oscillating':
            optimalInterval = Math.max(50, BASE_SYNC_INTERVAL * 0.3); // More frequent syncs
            break;
          case 'accelerating':
            optimalInterval = Math.max(50, BASE_SYNC_INTERVAL * 0.5); // Moderate frequency
            break;
          case 'stabilizing':
            optimalInterval = Math.min(1000, BASE_SYNC_INTERVAL * 1.5); // Less frequent syncs
            break;
          case 'random':
            optimalInterval = BASE_SYNC_INTERVAL; // Standard interval
            break;
        }
      }
      
      // Adjust based on prediction confidence
      if (model.confidence > ML_SYNC_CONFIG.MIN_CONFIDENCE) {
        const predictedDrift = Math.abs(model.prediction);
        if (predictedDrift > CRITICAL_DRIFT_THRESHOLD) {
          optimalInterval = Math.max(25, optimalInterval * 0.2);
        } else if (predictedDrift > DRIFT_THRESHOLD) {
          optimalInterval = Math.max(50, optimalInterval * 0.5);
        }
      }
      
      optimization.optimalIntervals[clientId] = optimalInterval;
    }
    
    optimization.lastOptimization = now;
    return optimization;
  }
  
  // Enhanced predictive sync with ML
  function shouldPredictiveSync(sessionId) {
    if (!sessionSyncStats[sessionId]) return false;
    
    const stats = sessionSyncStats[sessionId];
    const timeSinceUpdate = Date.now() - stats.lastUpdate;
    
    // Use ML predictions for more accurate sync timing
    const optimization = syncOptimizationData[sessionId];
    if (optimization) {
      const avgOptimalInterval = Object.values(optimization.optimalIntervals).reduce((a, b) => a + b, 0) / 
                                Object.keys(optimization.optimalIntervals).length;
      
      if (timeSinceUpdate >= avgOptimalInterval * 0.8) {
        return true;
      }
    }
    
    // Fallback to original logic
    if (stats.avgDrift > DRIFT_THRESHOLD * 0.8 && timeSinceUpdate > 200) {
      return true;
    }
    
    if (stats.deviceTypes.includes('mobile') || stats.networkQualities.includes('poor')) {
      return timeSinceUpdate > 250;
    }
    
    return false;
  }

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
    
    // Clean up old session stats
    for (const sessionId in sessionSyncStats) {
      if (now - sessionSyncStats[sessionId].lastUpdate > DRIFT_WINDOW * 2) {
        delete sessionSyncStats[sessionId];
      }
    }
  }, 60000);

  // Enhanced adaptive sync broadcast with device-specific intervals
  setInterval(() => {
    const sessions = getAllSessions();
    const now = Date.now();
    
    for (const [sessionId, session] of Object.entries(sessions)) {
      const { highDrift, criticalDrift, deviceTypes, networkQualities } = analyzeSessionDrift(sessionId);
      
      // Skip if critical drift (handled by critical sync interval)
      if (criticalDrift) continue;
      
      // Use device-specific intervals
      const syncInterval = getDeviceSpecificSyncInterval(deviceTypes, networkQualities);
      const timeSinceLastSync = now - (session.lastSyncBroadcast || 0);
      
      if (timeSinceLastSync >= syncInterval && !highDrift) {
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now(),
          syncStats: sessionSyncStats[sessionId] || null
        });
        session.lastSyncBroadcast = now;
      }
    }
  }, BASE_SYNC_INTERVAL);

  // High-drift sessions get extra syncs
  setInterval(() => {
    const sessions = getAllSessions();
    const now = Date.now();
    
    for (const [sessionId, session] of Object.entries(sessions)) {
      const { highDrift, criticalDrift } = analyzeSessionDrift(sessionId);
      
      if (highDrift && !criticalDrift) {
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now(),
          syncStats: sessionSyncStats[sessionId] || null,
          reason: 'high_drift'
        });
        session.lastSyncBroadcast = now;
      }
    }
  }, HIGH_DRIFT_SYNC_INTERVAL);

  // Critical drift sessions get immediate attention
  setInterval(() => {
    const sessions = getAllSessions();
    const now = Date.now();
    
    for (const [sessionId, session] of Object.entries(sessions)) {
      const { criticalDrift } = analyzeSessionDrift(sessionId);
      
      if (criticalDrift) {
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now(),
          syncStats: sessionSyncStats[sessionId] || null,
          reason: 'critical_drift'
        });
        session.lastSyncBroadcast = now;
      }
    }
  }, CRITICAL_DRIFT_SYNC_INTERVAL);

  // ML-based sync optimization interval
  setInterval(() => {
    const sessions = getAllSessions();
    const now = Date.now();
    
    for (const [sessionId, session] of Object.entries(sessions)) {
      // Run optimization for sessions with active drift data
      if (clientDriftMap[sessionId] && Object.keys(clientDriftMap[sessionId]).length > 0) {
        const optimization = optimizeSyncIntervals(sessionId);
        
        // Send optimization data to clients for local adjustments
        io.to(sessionId).emit('sync_optimization', {
          sessionId,
          optimalIntervals: optimization.optimalIntervals,
          driftPatterns: optimization.driftPatterns,
          mlInsights: {
            totalModels: Object.keys(driftPredictionModels[sessionId] || {}).length,
            avgConfidence: Object.values(driftPredictionModels[sessionId] || {})
              .reduce((sum, model) => sum + model.confidence, 0) / 
              Math.max(1, Object.keys(driftPredictionModels[sessionId] || {}).length),
            lastOptimization: optimization.lastOptimization
          }
        });
      }
    }
  }, ML_SYNC_CONFIG.SYNC_OPTIMIZATION_INTERVAL);

  // Enhanced predictive sync with ML insights
  setInterval(() => {
    const sessions = getAllSessions();
    const now = Date.now();
    
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (shouldPredictiveSync(sessionId)) {
        const optimization = syncOptimizationData[sessionId];
        const mlInsights = {
          predictionModels: driftPredictionModels[sessionId] ? 
            Object.keys(driftPredictionModels[sessionId]).length : 0,
          avgPredictionConfidence: driftPredictionModels[sessionId] ?
            Object.values(driftPredictionModels[sessionId])
              .reduce((sum, model) => sum + model.confidence, 0) / 
              Object.keys(driftPredictionModels[sessionId]).length : 0,
          detectedPatterns: optimization?.driftPatterns || {}
        };
        
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now(),
          syncStats: sessionSyncStats[sessionId] || null,
          mlInsights,
          reason: 'ml_predictive'
        });
        session.lastSyncBroadcast = now;
      }
    }
  }, 200); // Check every 200ms for ML-based predictive sync opportunities
} 