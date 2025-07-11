import { getSession, createSession, deleteSession, addClient, removeClient, setController, getAllSessions, getClients, updatePlayback, updateTimestamp, getClientIdBySocket, getSocketIdByClientId, addControllerRequest, removeControllerRequest, getPendingControllerRequests, clearExpiredControllerRequests } from './managers/sessionManager.js';
import { addToQueue, removeFromQueue, getQueue } from './managers/queueManager.js';
import { formatChatMessage, formatReaction } from './managers/chatManager.js';
import { log } from './utils/utils.js';
import { getSessionFiles, removeSessionFiles } from './managers/fileManager.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// Enhanced helper to build full session sync state for advanced sync, including analytics and richer metadata
function buildSessionSyncState(session) {
  const queue = Array.isArray(session.queue) ? session.queue : [];
  const selectedTrackIdx = Number.isInteger(session.selectedTrackIdx) ? session.selectedTrackIdx : 0;
  const currentTrack = (queue.length > 0 && queue[selectedTrackIdx]) ? queue[selectedTrackIdx] : null;

  // Add enhanced analytics and metadata if available
  const analytics = session.analytics || {};
  const driftHistory = Array.isArray(session.driftHistory) ? session.driftHistory.slice(-20) : [];
  const driftStats = (() => {
    if (!driftHistory.length) return null;
    const drifts = driftHistory.map(d => typeof d.drift === 'number' ? d.drift : 0);
    const corrected = driftHistory.filter(d => d.corrected).length;
    const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length;
    const maxDrift = Math.max(...drifts);
    return {
      totalDrifts: drifts.length,
      correctedDrifts: corrected,
      averageDrift: avgDrift,
      maxDrift,
      lastDrift: drifts[drifts.length - 1],
      lastCorrectionType: driftHistory[0]?.correctionType || null,
    };
  })();

  // Add device/network info if available
  const deviceTypes = Array.isArray(session.deviceTypes) ? session.deviceTypes : [];
  const networkQualities = Array.isArray(session.networkQualities) ? session.networkQualities : [];

  // Add last sync sequence if tracked
  const syncSeq = typeof session.syncSeq === 'number' ? session.syncSeq : null;

  // Add last known server time if tracked
  const serverTime = typeof session.serverTime === 'number' ? session.serverTime : Date.now();

  // Add playback rate if tracked
  const playbackRate = typeof session.playbackRate === 'number' ? session.playbackRate : 1.0;

  // Add buffering state if tracked
  const isBuffering = !!session.isBuffering;

  // Add any custom session metadata
  const meta = session.meta || {};

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
    analytics,
    driftStats,
    driftHistory,
    deviceTypes,
    networkQualities,
    syncSeq,
    serverTime,
    playbackRate,
    isBuffering,
    meta,
  };
}

export function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join_session', async ({ sessionId, displayName, deviceInfo, clientId } = {}, callback) => {
      try {
        console.log('[join_session] Event received', { sessionId, clientId, displayName, deviceInfo });

        // Validate sessionId
        if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
          log('[join_session] Missing or invalid sessionId');
          return typeof callback === "function" && callback({ error: 'No sessionId provided' });
        }

        // Prevent duplicate joins from same socket
        if (socket.sessionId && socket.sessionId === sessionId) {
          log('[join_session] Socket already joined this session:', sessionId);
          return typeof callback === "function" && callback({ error: 'Already joined' });
        }

        // Get or create session
        let session = getSession(sessionId);
        let isNewSession = false;
        if (!session) {
          session = createSession(sessionId, socket.id, clientId);
          isNewSession = true;
          log('[join_session] Session created:', sessionId);
        }

        // Add client to session
        addClient(sessionId, socket.id, displayName, deviceInfo, clientId);
        socket.join(sessionId);
        socket.sessionId = sessionId;
        socket.clientId = clientId;

        log('[join_session] Socket', socket.id, 'joined session', sessionId, 'as client', clientId);

        // Enhanced: Track join time and device info for analytics
        if (!session.joinHistory) session.joinHistory = [];
        session.joinHistory.push({
          clientId,
          socketId: socket.id,
          displayName,
          deviceInfo,
          joinedAt: Date.now(),
          ip: socket.handshake?.address || null,
        });

        // Enhanced: Prevent join flooding (rate limit joins per clientId)
        if (!session._joinTimestamps) session._joinTimestamps = {};
        const now = Date.now();
        session._joinTimestamps[clientId] = session._joinTimestamps[clientId] || [];
        session._joinTimestamps[clientId] = session._joinTimestamps[clientId].filter(ts => now - ts < 10000);
        session._joinTimestamps[clientId].push(now);
        if (session._joinTimestamps[clientId].length > 5) {
          log('[join_session] Join rate limit exceeded for clientId:', clientId);
          return typeof callback === "function" && callback({ error: 'Join rate limit exceeded' });
        }

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

        // Enhanced: Track controller change history
        if (becameController) {
          if (!session.controllerHistory) session.controllerHistory = [];
          session.controllerHistory.push({
            clientId,
            socketId: socket.id,
            changedAt: Date.now(),
          });
        }

        // Debug log for controller assignment
        console.log('[join_session] JOIN CALLBACK:', {
          controllerClientId: session.controllerClientId,
          clientId,
          sessionId,
          controllerId: session.controllerId,
          becameController,
        });

        // Always send the correct controllerClientId in the callback
        const syncState = buildSessionSyncState(session);

        // Enhanced: Attach join analytics and session meta
        const joinAnalytics = {
          totalJoins: session.joinHistory?.length || 0,
          uniqueClients: new Set(session.joinHistory?.map(j => j.clientId)).size,
          isNewSession,
          becameController,
        };

        typeof callback === "function" && callback({
          ...syncState,
          sessionId,
          audioUrl: process.env.AUDIO_URL || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          joinAnalytics,
        });

        // Send current queue to the joining client
        socket.emit('queue_update', getQueue(sessionId));

        // Enhanced: Send join notification to all clients in session
        io.to(sessionId).emit('clients_update', getClients(sessionId));
        io.to(sessionId).emit('client_joined', {
          clientId,
          displayName,
          deviceInfo,
          socketId: socket.id,
          joinedAt: now,
        });

        if (becameController) {
          io.to(sessionId).emit('controller_change', socket.id);
          io.to(sessionId).emit('controller_client_change', clientId);
        }

        // Enhanced: Log join event with queue and analytics
        log('[join_session] Client joined session', sessionId, {
          clientId,
          displayName,
          queue: getQueue(sessionId),
          joinAnalytics,
        });

        // Enhanced: Optionally send session stats to the joining client
        if (typeof socket.emit === 'function') {
          socket.emit('session_stats', {
            totalClients: getClients(sessionId).length,
            totalJoins: session.joinHistory?.length || 0,
            controllerClientId: session.controllerClientId,
            controllerId: session.controllerId,
            isNewSession,
          });
        }

      } catch (err) {
        log('[join_session] Error:', err);
        if (typeof callback === "function") callback({ error: 'Internal server error' });
      }
    });

    socket.on('play', async ({ sessionId, timestamp, meta = {} } = {}) => {
      try {
        if (!sessionId || typeof timestamp !== 'number') {
          log('[play] Invalid play event: missing sessionId or timestamp', { sessionId, timestamp });
          return;
        }
        const session = getSession(sessionId);
        if (!session) {
          log('[play] Session not found', sessionId);
          return;
        }
        const clientId = getClientIdBySocket(sessionId, socket.id);
        if (session.controllerClientId !== clientId) {
          log('[play] Unauthorized play attempt by client', clientId, 'in session', sessionId);
          return;
        }

        // Enhanced: Track play analytics
        if (!session.playHistory) session.playHistory = [];
        session.playHistory.push({
          clientId,
          socketId: socket.id,
          timestamp,
          serverTime: Date.now(),
          meta,
        });
        if (session.playHistory.length > 20) session.playHistory.shift();

        // Enhanced: Optionally broadcast play event analytics
        io.to(sessionId).emit('play_event', {
          clientId,
          socketId: socket.id,
          timestamp,
          serverTime: Date.now(),
          meta,
        });

        // Enhanced: Update playback state
        updatePlayback(sessionId, { isPlaying: true, timestamp, controllerId: socket.id });

        // Enhanced: Log with more context
        log('[play] Play in session', sessionId, 'by', clientId, 'at', timestamp, {
          controllerClientId: session.controllerClientId,
          controllerId: session.controllerId,
          clients: Array.from(session.clients.keys()),
          meta,
        });

        // Enhanced: Emit sync_state with additional analytics and drift info if available
        const syncStatePayload = {
          isPlaying: true,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: socket.id,
          serverTime: Date.now(),
          syncSeq: session.syncSeq,
        };

        // Optionally attach drift analytics if present
        if (session.driftAnalytics) {
          syncStatePayload.driftAnalytics = session.driftAnalytics;
        }

        // Optionally attach current queue info
        if (typeof getQueue === 'function') {
          syncStatePayload.queue = getQueue(sessionId);
        }

        // Optionally attach play history summary
        syncStatePayload.playHistoryCount = session.playHistory.length;

        // Enhanced: Debug log
        if (process.env.NODE_ENV !== 'production') {
          console.log('[play] Emitting sync_state to session', sessionId, 'clients:', Array.from(session.clients.keys()), syncStatePayload);
        }

        io.to(sessionId).emit('sync_state', syncStatePayload);

        // Optionally: ML/AI hooks for adaptive sync (stub)
        if (typeof global.onPlayEventML === 'function') {
          global.onPlayEventML({
            sessionId,
            clientId,
            timestamp,
            serverTime: Date.now(),
            meta,
            session,
          });
        }
      } catch (err) {
        log('[play] Error handling play event:', err);
      }
    });

    // Enhanced pause event with analytics, ML hooks, and richer sync_state
    socket.on('pause', ({ sessionId, timestamp, meta } = {}) => {
      if (!sessionId || typeof timestamp !== 'number') return;
      const session = getSession(sessionId);
      if (!session) return;
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return;

      // Update playback state
      updatePlayback(sessionId, { isPlaying: false, timestamp, controllerId: socket.id });

      // Enhanced: Log with more context
      log('[pause] Pause in session', sessionId, 'by client', clientId, 'at', timestamp, 'meta:', meta);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[pause] Emitting sync_state to session', sessionId, 'clients:', Array.from(session.clients.keys()));
      }

      // Enhanced: Build sync_state payload with analytics, drift info, and meta
      const syncStatePayload = {
        isPlaying: false,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: socket.id,
        serverTime: Date.now(),
        syncSeq: session.syncSeq,
        // Optionally attach drift analytics if present
        ...(session.driftAnalytics ? { driftAnalytics: session.driftAnalytics } : {}),
        // Optionally attach current queue info
        ...(typeof getQueue === 'function' ? { queue: getQueue(sessionId) } : {}),
        // Optionally attach play history summary
        playHistoryCount: Array.isArray(session.playHistory) ? session.playHistory.length : 0,
        // Attach meta if provided
        ...(meta ? { meta } : {})
      };

      io.to(sessionId).emit('sync_state', syncStatePayload);

      // Optionally: ML/AI hooks for adaptive sync (stub)
      if (typeof global.onPauseEventML === 'function') {
        global.onPauseEventML({
          sessionId,
          clientId,
          timestamp,
          serverTime: Date.now(),
          meta,
          session,
        });
      }
    });

    // Enhanced seek event with analytics, ML hooks, and richer sync_state
    socket.on('seek', ({ sessionId, timestamp, meta } = {}) => {
      if (!sessionId || typeof timestamp !== 'number') return;
      const session = getSession(sessionId);
      if (!session) return;
      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (session.controllerClientId !== clientId) return;

      // Update timestamp and log with more context
      updateTimestamp(sessionId, timestamp, socket.id);
      log('[seek] Seek in session', sessionId, 'by client', clientId, 'to', timestamp, 'meta:', meta);

      if (process.env.NODE_ENV !== 'production') {
        console.log('[seek] Emitting sync_state to session', sessionId, 'clients:', Array.from(session.clients.keys()));
      }

      // Enhanced: Build sync_state payload with analytics, drift info, and meta
      const syncStatePayload = {
        isPlaying: session.isPlaying,
        timestamp: session.timestamp,
        lastUpdated: session.lastUpdated,
        controllerId: socket.id,
        serverTime: Date.now(),
        syncSeq: session.syncSeq,
        // Optionally attach drift analytics if present
        ...(session.driftAnalytics ? { driftAnalytics: session.driftAnalytics } : {}),
        // Optionally attach current queue info
        ...(typeof getQueue === 'function' ? { queue: getQueue(sessionId) } : {}),
        // Optionally attach play history summary
        playHistoryCount: Array.isArray(session.playHistory) ? session.playHistory.length : 0,
        // Attach meta if provided
        ...(meta ? { meta } : {})
      };

      io.to(sessionId).emit('sync_state', syncStatePayload);

      // Optionally: ML/AI hooks for adaptive sync (stub)
      if (typeof global.onSeekEventML === 'function') {
        global.onSeekEventML({
          sessionId,
          clientId,
          timestamp,
          serverTime: Date.now(),
          meta,
          session,
        });
      }
    });

    // Enhanced sync_request handler with analytics, logging, and optional ML hooks
    socket.on('sync_request', async ({ sessionId, includeAnalytics, includeQueue, includeDriftStats, clientInfo } = {}, callback) => {
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

        // Build the base sync state
        let response = buildSessionSyncState(session);

        // Optionally include more analytics or queue info if requested
        if (includeAnalytics && session.analytics) {
          response.analytics = session.analytics;
        }
        if (includeQueue && typeof getQueue === 'function') {
          response.queue = getQueue(sessionId);
        }
        if (includeDriftStats && session.driftStats) {
          response.driftStats = session.driftStats;
        }

        // Optionally attach clientInfo for logging/analytics
        if (clientInfo) {
          response.clientInfo = clientInfo;
        }

        // Attach server time for better client sync
        response.serverTime = Date.now();

        // Optionally attach ML/AI sync hints (stub for future)
        if (typeof global.getSyncHints === 'function') {
          response.syncHints = global.getSyncHints(sessionId, session, clientInfo);
        }

        // Enhanced logging
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log('[socket][sync_request] Responding to sync_request for session', sessionId, {
            clientId: socket.clientId,
            socketId: socket.id,
            requested: { includeAnalytics, includeQueue, includeDriftStats },
            responsePreview: {
              isPlaying: response.isPlaying,
              timestamp: response.timestamp,
              controllerId: response.controllerId,
              queueLength: Array.isArray(response.queue) ? response.queue.length : undefined,
              analytics: !!response.analytics,
              driftStats: !!response.driftStats,
              syncSeq: response.syncSeq,
              serverTime: response.serverTime
            }
          });
        }

        // Optionally emit an event for monitoring
        if (typeof io !== 'undefined' && process.env.SYNC_REQUEST_MONITOR === '1') {
          io.emit('sync_request_log', {
            sessionId,
            clientId: socket.clientId,
            socketId: socket.id,
            time: Date.now(),
            requested: { includeAnalytics, includeQueue, includeDriftStats }
          });
        }

        if (typeof callback === "function") callback(response);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.error('[socket][sync_request] Error handling sync_request:', err, { sessionId: sessionId, socketId: socket.id });
        }
        if (typeof callback === "function") callback({ error: 'Internal server error' });
      }
    });

    // Further enhanced drift report handling with ML, analytics, and anomaly detection
    socket.on('drift_report', (payload = {}) => {
      const {
        sessionId,
        drift,
        rtt,
        jitter,
        deviceType,
        networkQuality,
        clientTime,
        expected,
        current,
        audioLatency,
        networkLatency,
        correctionType,
        threshold,
        corrected,
        trackId,
        ctrlId,
        meta,
        timestamp: clientReportTimestamp,
        ...extra
      } = payload;

      if (!sessionId || typeof drift !== 'number') return;

      const clientId = getClientIdBySocket(sessionId, socket.id);
      if (!clientId) return;

      const now = Date.now();

      // Initialize drift map for session if needed
      if (!clientDriftMap[sessionId]) {
        clientDriftMap[sessionId] = {};
      }

      // Maintain drift history for analytics (last 30 reports)
      if (!clientDriftMap[sessionId][clientId]?.driftHistory) {
        clientDriftMap[sessionId][clientId] = {
          driftHistory: [],
        };
      }
      const driftHistory = clientDriftMap[sessionId][clientId].driftHistory;
      driftHistory.push({
        drift: Math.abs(drift),
        timestamp: now,
        rtt,
        jitter,
        deviceType: deviceType || 'unknown',
        networkQuality: networkQuality || 'unknown',
        clientTime: clientTime || null,
        expected,
        current,
        audioLatency,
        networkLatency,
        correctionType,
        threshold,
        corrected: !!corrected,
        trackId,
        ctrlId,
        meta,
        clientReportTimestamp,
        ...extra
      });
      if (driftHistory.length > 30) driftHistory.shift();

      // Calculate rolling average and trend for drift
      const driftValues = driftHistory.map(d => typeof d.drift === 'number' ? d.drift : 0);
      const avgDrift = driftValues.length
        ? driftValues.reduce((a, b) => a + b, 0) / driftValues.length
        : Math.abs(drift);

      // Simple linear regression for drift trend (slope)
      let driftTrend = 0;
      if (driftValues.length >= 3) {
        const n = driftValues.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = driftValues;
        const meanX = x.reduce((a, b) => a + b, 0) / n;
        const meanY = y.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
          num += (x[i] - meanX) * (y[i] - meanY);
          den += (x[i] - meanX) ** 2;
        }
        driftTrend = den !== 0 ? num / den : 0;
      }

      // Store latest drift data and analytics
      clientDriftMap[sessionId][clientId] = {
        ...clientDriftMap[sessionId][clientId],
        drift: Math.abs(drift),
        timestamp: now,
        deviceType: deviceType || 'unknown',
        networkQuality: networkQuality || 'unknown',
        rtt: rtt || null,
        jitter: jitter || null,
        clientTime: clientTime || null,
        expected,
        current,
        audioLatency,
        networkLatency,
        correctionType,
        threshold,
        corrected: !!corrected,
        trackId,
        ctrlId,
        meta,
        clientReportTimestamp,
        analytics: {
          reportCount: (clientDriftMap[sessionId][clientId]?.analytics?.reportCount || 0) + 1,
          lastReportTime: now,
          avgDrift,
          driftTrend,
          maxDrift: Math.max(...driftValues, Math.abs(drift)),
          minDrift: Math.min(...driftValues, Math.abs(drift)),
          lastCorrectionType: correctionType || null,
          lastCorrected: !!corrected,
        },
        driftHistory
      };

      // ML prediction and anomaly detection
      const predictionModel = predictDrift(sessionId, clientId, Math.abs(drift));
      const pattern = recognizeDriftPattern(sessionId, clientId);

      // Anomaly detection: flag if drift is much higher than recent average
      let isAnomaly = false;
      if (avgDrift > 0 && Math.abs(drift) > avgDrift * 2.5 && Math.abs(drift) > 0.5) {
        isAnomaly = true;
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[ANOMALY] High drift anomaly detected for ${clientId} in ${sessionId}:`, {
            drift: Math.abs(drift),
            avgDrift,
            driftTrend,
            deviceType,
            networkQuality,
            rtt,
            jitter,
            correctionType,
            trackId,
            ctrlId,
            meta
          });
        }
      }

      // Log drift report with ML and analytics
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ML] Drift report for ${clientId} in ${sessionId}:`, {
          drift: Math.abs(drift),
          avgDrift,
          driftTrend,
          predictedDrift: predictionModel.prediction,
          confidence: predictionModel.confidence,
          pattern,
          deviceType,
          networkQuality,
          rtt,
          jitter,
          correctionType,
          corrected,
          isAnomaly,
          reportCount: clientDriftMap[sessionId][clientId].analytics.reportCount,
          lastCorrectionType: correctionType,
          trackId,
          ctrlId,
          meta
        });
      }

      // Optionally emit drift analytics to session for monitoring
      if (process.env.DRIFT_ANALYTICS_MONITOR === '1') {
        io.to(sessionId).emit('drift_analytics_update', {
          clientId,
          drift: Math.abs(drift),
          avgDrift,
          driftTrend,
          deviceType,
          networkQuality,
          rtt,
          jitter,
          correctionType,
          corrected,
          isAnomaly,
          timestamp: now,
          trackId,
          ctrlId,
          meta
        });
      }

      // Trigger optimization if significant drift or anomaly detected
      if (Math.abs(drift) > DRIFT_THRESHOLD || isAnomaly) {
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
     * Ultra-Enhanced add_to_queue event:
     * - Strictly validates input (sessionId, url, title, and optional metadata).
     * - Supports rich metadata (artist, duration, album, artwork, etc).
     * - Prevents duplicate tracks by URL (case-insensitive, trims whitespace).
     * - Optionally allows only the controller to add tracks (configurable).
     * - Optionally enforces a maximum queue length (configurable).
     * - Optionally checks for valid audio URLs (basic pattern).
     * - Broadcasts queue_update and emits a track_change if this is the first track.
     * - Emits a queue_add event for audit/logging.
     * - Returns detailed result in callback, including error codes.
     * - Logs for debugging and analytics.
     */
    socket.on('add_to_queue', (data = {}, callback) => {
      const MAX_QUEUE_LENGTH = 100; // configurable
      const CONTROLLER_ONLY = false; // set to true to restrict to controller

      // Destructure and sanitize input
      let { sessionId, url, title, artist, duration, album, artwork, ...meta } = data || {};
      sessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
      url = typeof url === 'string' ? url.trim() : '';
      title = typeof title === 'string' ? title.trim() : '';
      artist = typeof artist === 'string' ? artist.trim() : '';
      album = typeof album === 'string' ? album.trim() : '';
      artwork = typeof artwork === 'string' ? artwork.trim() : '';

      // Validate sessionId and url
      if (!sessionId || !url) {
        return typeof callback === "function" && callback({ error: 'Missing or invalid sessionId or url', code: 'INVALID_INPUT' });
      }

      // Optionally: Only controller can add tracks
      if (CONTROLLER_ONLY) {
        const session = getSession(sessionId);
        const clientId = getClientIdBySocket(sessionId, socket.id);
        if (!session || session.controllerClientId !== clientId) {
          return typeof callback === "function" && callback({ error: 'Only the controller can add tracks', code: 'NOT_CONTROLLER' });
        }
      }

      // Optionally: Validate URL is a plausible audio file (basic check)
      const audioUrlPattern = /^https?:\/\/.+\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i;
      if (!audioUrlPattern.test(url)) {
        return typeof callback === "function" && callback({ error: 'URL does not appear to be a valid audio file', code: 'INVALID_URL' });
      }

      // Prevent duplicate tracks in queue by title+artist (case-insensitive, trimmed)
      const queue = getQueue(sessionId) || [];
      const normTitle = (title || '').trim().toLowerCase();
      const normArtist = (artist || '').trim().toLowerCase();
      const isDuplicate = queue.some(track => {
        if (!track) return false;
        const tTitle = (track.title || '').trim().toLowerCase();
        const tArtist = (track.artist || '').trim().toLowerCase();
        if (normArtist && tArtist) {
          // Both have artist: match on both
          return tTitle === normTitle && tArtist === normArtist;
        } else {
          // Fallback: match on title only
          return tTitle === normTitle;
        }
      });
      if (isDuplicate) {
        return typeof callback === "function" && callback({ error: 'Track already in queue (title+artist)', code: 'DUPLICATE' });
      }

      // Optionally: Enforce maximum queue length
      if (queue.length >= MAX_QUEUE_LENGTH) {
        return typeof callback === "function" && callback({ error: 'Queue is full', code: 'QUEUE_FULL' });
      }

      // Validate and sanitize title (allow empty, but must be string)
      const safeTitle = title || url.split('/').pop() || 'Untitled';

      // Build track object with rich metadata
      const track = {
        url,
        title: safeTitle,
        ...(artist && { artist }),
        ...(album && { album }),
        ...(artwork && { artwork }),
        ...(typeof duration === 'number' && duration > 0 && { duration }),
        ...meta,
        addedBy: getClientIdBySocket(sessionId, socket.id),
        addedAt: Date.now()
      };

      // Actually add to queue
      addToQueue(sessionId, track.url, track.title, track);

      const updatedQueue = getQueue(sessionId);

      log('[ENHANCED] add_to_queue: session', sessionId, 'added:', track, 'queue now:', updatedQueue);

      // Emit audit/logging event for queue addition
      io.to(sessionId).emit('queue_add', {
        track,
        queue: updatedQueue,
        addedBy: track.addedBy,
        addedAt: track.addedAt
      });

      // Broadcast updated queue
      io.to(sessionId).emit('queue_update', updatedQueue);

      // If this is the first track, emit a track_change event to set current track
      if (updatedQueue.length === 1) {
        io.to(sessionId).emit('track_change', {
          idx: 0,
          track: updatedQueue[0],
          reason: 'first_track_added',
          initiator: track.addedBy,
          timestamp: Date.now()
        });
      }

      typeof callback === "function" && callback({ success: true, queue: updatedQueue, added: track });
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
        serverTime: Date.now(),
        syncSeq: session.syncSeq
      });

      if (typeof callback === "function") callback({ success: true, ...payload });
    });

    // --- Ultra-Robust NTP-like time sync event for clients with diagnostics and drift estimation ---
    socket.on('time_sync', (data = {}, callback) => {
      const serverReceived = Date.now();

      // Optionally, extract client info for diagnostics
      const clientId = socket.clientId || data.clientId || null;
      const sessionId = socket.sessionId || data.sessionId || null;
      const clientSent = typeof data.clientSent === 'number' ? data.clientSent : null;
      const clientPlaybackTime = typeof data.clientPlaybackTime === 'number' ? data.clientPlaybackTime : null;
      const clientUptime = typeof data.clientUptime === 'number' ? data.clientUptime : null;
      const clientDevice = data.deviceInfo || null;

      // Optionally, log for diagnostics
      if (process.env.NODE_ENV !== 'production') {
        log('[time_sync] Received from client', {
          clientId,
          sessionId,
          clientSent,
          clientPlaybackTime,
          clientUptime,
          clientDevice,
          socketId: socket.id
        });
      }

      // Simulate processing delay (for testing, can be removed)
      // setTimeout(() => {
      const serverProcessed = Date.now();

      // Optionally, calculate server uptime and ISO time
      const serverUptime = process.uptime();
      const serverIso = new Date(serverProcessed).toISOString();

      // Optionally, estimate round-trip time (RTT) if client provides clientReceived/serverSent
      let estimatedRTT = null;
      if (typeof data.clientReceived === 'number' && typeof clientSent === 'number') {
        // RTT = (serverProcessed - clientSent) - (clientReceived - serverReceived)
        estimatedRTT = (serverProcessed - clientSent) - (data.clientReceived - serverReceived);
      }

      // Optionally, estimate clock drift if client provides its own serverTime
      let estimatedDrift = null;
      if (typeof data.clientServerTime === 'number') {
        estimatedDrift = serverProcessed - data.clientServerTime;
      }

      // Optionally, include diagnostics in response
      const response = {
        serverReceived,
        serverProcessed,
        serverTime: serverProcessed, // Use processed time for best accuracy
        serverIso,
        serverUptime,
        clientSent,
        clientReceived: data.clientReceived,
        clientPlaybackTime,
        clientUptime,
        clientDevice,
        estimatedRTT,
        estimatedDrift,
        diagnostics: {
          socketId: socket.id,
          clientId,
          sessionId,
          env: process.env.NODE_ENV,
        }
      };

      if (typeof callback === 'function') {
        callback(response);
      }
      // }, 0);
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
  const BASE_SYNC_INTERVAL = 2000; // ms (increased from 1000ms to reduce sync frequency)
const HIGH_DRIFT_SYNC_INTERVAL = 1000; // ms (increased from 500ms to reduce interruptions)
const CRITICAL_DRIFT_SYNC_INTERVAL = 500; // ms (increased from 200ms to reduce audio stuttering)
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
    SYNC_OPTIMIZATION_INTERVAL: 10000 // 10s optimization interval (reduced frequency)
  };

  // Ultra-Enhanced drift analysis and device/network profiling with diagnostics and outlier detection
  function analyzeSessionDrift(sessionId) {
    if (!clientDriftMap[sessionId]) {
      return {
        highDrift: false,
        criticalDrift: false,
        deviceTypes: [],
        networkQualities: [],
        avgDrift: 0,
        maxDrift: 0,
        minDrift: 0,
        stdDevDrift: 0,
        outlierClients: [],
        driftHistogram: {},
        clientCount: 0,
        lastUpdate: Date.now()
      };
    }

    const now = Date.now();
    const recentDrifts = [];
    const deviceTypes = new Set();
    const networkQualities = new Set();
    const driftByClient = {};
    let highDrift = false;
    let criticalDrift = false;

    // For histogram
    const driftHistogram = {
      '<0.1s': 0,
      '0.1-0.2s': 0,
      '0.2-0.5s': 0,
      '0.5-1s': 0,
      '>1s': 0
    };

    for (const [clientId, data] of Object.entries(clientDriftMap[sessionId])) {
      if (now - data.timestamp < DRIFT_WINDOW) {
        recentDrifts.push(data.drift);
        driftByClient[clientId] = data.drift;
        if (data.deviceType) deviceTypes.add(data.deviceType);
        if (data.networkQuality) networkQualities.add(data.networkQuality);

        // Drift histogram
        if (data.drift < 0.1) driftHistogram['<0.1s']++;
        else if (data.drift < 0.2) driftHistogram['0.1-0.2s']++;
        else if (data.drift < 0.5) driftHistogram['0.2-0.5s']++;
        else if (data.drift < 1) driftHistogram['0.5-1s']++;
        else driftHistogram['>1s']++;

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
    const minDrift = recentDrifts.length > 0 ? Math.min(...recentDrifts) : 0;
    // Standard deviation
    const stdDevDrift = recentDrifts.length > 1
      ? Math.sqrt(recentDrifts.reduce((sum, d) => sum + Math.pow(d - avgDrift, 2), 0) / (recentDrifts.length - 1))
      : 0;

    // Outlier detection (clients with drift > avg + 2*stdDev)
    const outlierClients = [];
    if (recentDrifts.length > 1 && stdDevDrift > 0) {
      for (const [clientId, drift] of Object.entries(driftByClient)) {
        if (drift > avgDrift + 2 * stdDevDrift) {
          outlierClients.push(clientId);
        }
      }
    }

    // Save extended stats for diagnostics
    sessionSyncStats[sessionId] = {
      avgDrift,
      maxDrift,
      minDrift,
      stdDevDrift,
      deviceTypes: Array.from(deviceTypes),
      networkQualities: Array.from(networkQualities),
      clientCount: recentDrifts.length,
      outlierClients,
      driftHistogram,
      lastUpdate: now
    };

    // Optionally log diagnostics in development
    if (process.env.NODE_ENV === 'development') {
      log('[analyzeSessionDrift]', {
        sessionId,
        avgDrift,
        maxDrift,
        minDrift,
        stdDevDrift,
        outlierClients,
        driftHistogram,
        deviceTypes: Array.from(deviceTypes),
        networkQualities: Array.from(networkQualities),
        clientCount: recentDrifts.length
      });
    }

    return {
      highDrift,
      criticalDrift,
      deviceTypes: Array.from(deviceTypes),
      networkQualities: Array.from(networkQualities),
      avgDrift,
      maxDrift,
      minDrift,
      stdDevDrift,
      outlierClients,
      driftHistogram,
      clientCount: recentDrifts.length,
      lastUpdate: now
    };
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
  
  // Enhanced linear regression for trend analysis with outlier resistance and diagnostics
  function calculateLinearTrend(xValues, yValues) {
    const n = xValues.length;
    if (n < 2) return { slope: 0, confidence: 0, intercept: 0, diagnostics: {} };

    // Optionally: Remove outliers using IQR (Interquartile Range) method
    function removeOutliers(arr) {
      const sorted = [...arr].sort((a, b) => a - b);
      const q1 = sorted[Math.floor((sorted.length / 4))];
      const q3 = sorted[Math.floor((sorted.length * (3 / 4)))];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      return arr.map((v, i) => ({ v, i })).filter(({ v }) => v >= lower && v <= upper);
    }

    // Remove outliers from yValues (and corresponding xValues)
    const filtered = removeOutliers(yValues);
    const filteredX = filtered.map(({ i }) => xValues[i]);
    const filteredY = filtered.map(({ v }) => v);
    const m = filteredX.length;

    // If too many outliers, fallback to original data
    const useX = m >= Math.max(2, Math.floor(n * 0.6)) ? filteredX : xValues;
    const useY = m >= Math.max(2, Math.floor(n * 0.6)) ? filteredY : yValues;
    const N = useX.length;

    const sumX = useX.reduce((a, b) => a + b, 0);
    const sumY = useY.reduce((a, b) => a + b, 0);
    const sumXY = useX.reduce((sum, x, i) => sum + x * useY[i], 0);
    const sumXX = useX.reduce((sum, x) => sum + x * x, 0);

    // Prevent division by zero
    const denominator = (N * sumXX - sumX * sumX);
    const slope = denominator !== 0 ? (N * sumXY - sumX * sumY) / denominator : 0;
    const intercept = (sumY - slope * sumX) / N;

    // Calculate R-squared for confidence
    const yMean = sumY / N;
    const ssRes = useY.reduce((sum, y, i) => {
      const predicted = slope * useX[i] + intercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    const ssTot = useY.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const confidence = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

    // Diagnostics: stddev, outlier count, used points, original points
    const stddev = Math.sqrt(useY.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0) / N);
    const diagnostics = {
      stddev,
      outlierCount: n - N,
      usedPoints: N,
      originalPoints: n,
      slope,
      intercept,
      rSquared: confidence
    };

    return {
      slope,
      confidence: Math.max(0, Math.min(1, confidence)),
      intercept,
      diagnostics
    };
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
        // Increment syncSeq for periodic sync emissions
        session.syncSeq = (session.syncSeq || 0) + 1;
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now(),
          syncSeq: session.syncSeq,
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
        // Increment syncSeq for periodic sync emissions
        session.syncSeq = (session.syncSeq || 0) + 1;
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now(),
          syncSeq: session.syncSeq,
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
        // Increment syncSeq for periodic sync emissions
        session.syncSeq = (session.syncSeq || 0) + 1;
        io.to(sessionId).emit('sync_state', {
          isPlaying: session.isPlaying,
          timestamp: session.timestamp,
          lastUpdated: session.lastUpdated,
          controllerId: session.controllerId,
          serverTime: Date.now(),
          syncSeq: session.syncSeq,
          syncStats: sessionSyncStats[sessionId] || null,
          reason: 'critical_drift'
        });
        session.lastSyncBroadcast = now;
      }
    }
  }, CRITICAL_DRIFT_SYNC_INTERVAL);

  // ML-based sync optimization interval (DISABLED for performance)
  // setInterval(() => {
  //   const sessions = getAllSessions();
  //   const now = Date.now();
  //   
  //   for (const [sessionId, session] of Object.entries(sessions)) {
  //     // Run optimization for sessions with active drift data
  //     if (clientDriftMap[sessionId] && Object.keys(clientDriftMap[sessionId]).length > 0) {
  //       const optimization = optimizeSyncIntervals(sessionId);
  //       
  //       // Send optimization data to clients for local adjustments
  //       io.to(sessionId).emit('sync_optimization', {
  //         sessionId,
  //         optimalIntervals: optimization.optimalIntervals,
  //         driftPatterns: optimization.driftPatterns,
  //         mlInsights: {
  //           totalModels: Object.keys(driftPredictionModels[sessionId] || {}).length,
  //           avgConfidence: Object.values(driftPredictionModels[sessionId] || {})
  //             .reduce((sum, model) => sum + model.confidence, 0) / 
  //             Math.max(1, Object.keys(driftPredictionModels[sessionId] || {}).length),
  //           lastOptimization: optimization.lastOptimization
  //         }
  //       });
  //     }
  //   }
  // }, ML_SYNC_CONFIG.SYNC_OPTIMIZATION_INTERVAL);

  // Enhanced predictive sync with ML insights (DISABLED for performance)
  // setInterval(() => {
  //   const sessions = getAllSessions();
  //   const now = Date.now();
  //   
  //   for (const [sessionId, session] of Object.entries(sessions)) {
  //     if (shouldPredictiveSync(sessionId)) {
  //       const optimization = syncOptimizationData[sessionId];
  //       const mlInsights = {
  //         predictionModels: driftPredictionModels[sessionId] ? 
  //           Object.keys(driftPredictionModels[sessionId]).length : 0,
  //         avgPredictionConfidence: driftPredictionModels[sessionId] ?
  //           Object.values(driftPredictionModels[sessionId])
  //             .reduce((sum, model) => sum + model.confidence, 0) / 
  //             Object.keys(driftPredictionModels[sessionId]).length : 0,
  //         detectedPatterns: optimization?.driftPatterns || {}
  //       };
  //       
  //       // Increment syncSeq for periodic sync emissions
  //       session.syncSeq = (session.syncSeq || 0) + 1;
  //       io.to(sessionId).emit('sync_state', {
  //         isPlaying: session.isPlaying,
  //         timestamp: session.timestamp,
  //         lastUpdated: session.lastUpdated,
  //         controllerId: session.controllerId,
  //         serverTime: Date.now(),
  //         syncSeq: session.syncSeq,
  //         syncStats: sessionSyncStats[sessionId] || null,
  //         mlInsights,
  //         reason: 'ml_predictive'
  //       });
  //       session.lastSyncBroadcast = now;
  //     }
  //   }
  // }, 3000); // Check every 3000ms for ML-based predictive sync opportunities (reduced frequency)
} 