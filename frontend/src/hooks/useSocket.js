import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getClientId } from '../utils/clientId';

// --- Time Sync Tuning Constants ---
const TRIM_RATIO = 0.22; // Outlier filtering trim ratio
const MAX_RTT = 220; // ms, ignore samples above this
const ADAPTIVE_INTERVAL_BAD = 400; // ms, unstable network
const ADAPTIVE_INTERVAL_GOOD = 700; // ms, very stable
const ADAPTIVE_INTERVAL_DEFAULT = 900; // ms, default
const JITTER_BAD = 15; // ms
const JITTER_GOOD = 10; // ms
const AVG_RTT_BAD = 100; // ms
const AVG_RTT_GOOD = 70; // ms

export default function useSocket(sessionId, displayName = '', deviceInfo = '') {
  const [connected, setConnected] = useState(false);
  const [controllerId, setControllerId] = useState(null);
  const [clients, setClients] = useState([]);
  const [controllerClientId, setControllerClientId] = useState(null);
  const [timeOffset, setTimeOffset] = useState(0); // serverTime - clientTime
  const [rtt, setRtt] = useState(null);
  const [pendingControllerRequests, setPendingControllerRequests] = useState([]);
  const [controllerRequestReceived, setControllerRequestReceived] = useState(null);
  const [controllerOfferReceived, setControllerOfferReceived] = useState(null);
  const [controllerOfferSent, setControllerOfferSent] = useState(null);
  const [controllerOfferAccepted, setControllerOfferAccepted] = useState(null);
  const [controllerOfferDeclined, setControllerOfferDeclined] = useState(null);
  const [jitter, setJitter] = useState(0); // Track jitter (ms)
  const [drift, setDrift] = useState(0); // Track drift (ms)
  const socketRef = useRef(null);
  const clientId = getClientId();

  // --- NTP-like multi-round time sync before joining session ---
  async function ntpBatchSync(socket, rounds = 8) {
    const samples = [];
    const requests = [];
    for (let i = 0; i < rounds; i++) {
      requests.push(
        new Promise((resolve) => {
          const now = Date.now();
          socket.emit(
            'time_sync',
            { clientSent: now, clientCallbackReceived: Date.now(), userAgent: navigator.userAgent },
            (data) => {
              if (
                data &&
                typeof data.serverReceived === 'number' &&
                typeof data.serverProcessed === 'number' &&
                typeof data.clientSent === 'number'
              ) {
                const clientReceived = Date.now();
                const serverMid = (data.serverReceived + data.serverProcessed) / 2;
                const roundTrip = clientReceived - data.clientSent;
                if (roundTrip > MAX_RTT) return resolve();
                const offset = serverMid - clientReceived;
                samples.push({ offset, rtt: roundTrip });
              } else if (
                data &&
                typeof data.serverTime === 'number' &&
                typeof data.clientSent === 'number'
              ) {
                const clientReceived = Date.now();
                const roundTrip = clientReceived - data.clientSent;
                if (roundTrip > MAX_RTT) return resolve();
                const estimatedServerTime = data.serverTime + roundTrip / 2;
                const offset = estimatedServerTime - clientReceived;
                samples.push({ offset, rtt: roundTrip });
              }
              resolve();
            }
          );
        })
      );
      // Optional: stagger requests by a few ms to avoid burst
      await new Promise((res) => setTimeout(res, 8));
    }
    await Promise.all(requests);
    if (samples.length < 4) return;
    samples.sort((a, b) => a.rtt - b.rtt);
    const trimmed = samples.slice(2, -2);
    let avgOffset;
    if (trimmed.length >= 3) {
      const [best, second, third] = trimmed;
      avgOffset = (best.offset * 0.5 + second.offset * 0.3 + third.offset * 0.2) / 1.0;
    } else {
      avgOffset = trimmed.reduce((sum, s) => sum + s.offset, 0) / trimmed.length;
    }
    const avgRtt = trimmed.reduce((sum, s) => sum + s.rtt, 0) / trimmed.length;
    setTimeOffset(avgOffset);
    setRtt(avgRtt);
  }

  // Add a callback for clock skew warning
  let clockSkewWarned = false;
  function warnClockSkew(offset) {
    if (!clockSkewWarned && Math.abs(offset) > 1.5 * 1000) { // >1.5s skew
      clockSkewWarned = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fxsync:clockskew', { detail: { offset } }));
      }
      // Increase sync frequency
      adaptiveInterval = Math.max(ADAPTIVE_INTERVAL_BAD, 800);
    }
  }

  // Further enhanced time sync logic with drift smoothing, error handling, diagnostics, and visibility/reactivity improvements
  useEffect(() => {
    let interval;
    let lastOffsets = [];
    let lastRtts = [];
    let lastJitters = [];
    let lastDrifts = [];
    const MAX_HISTORY = 12; // Slightly longer smoothing window
    let adaptiveInterval = ADAPTIVE_INTERVAL_DEFAULT; // Start with default
    let lastSyncTime = 0;
    let syncInProgress = false;
    let syncFailures = 0;
    const MAX_SYNC_FAILURES = 4;

    // Helper: robust trimmed mean
    function trimmedMean(arr, trimRatio) {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const trim = Math.floor(arr.length * trimRatio);
      const trimmed = sorted.slice(trim, arr.length - trim);
      if (trimmed.length === 0) return sorted[Math.floor(sorted.length / 2)];
      return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    }

    // Helper: sample standard deviation (jitter)
    function calcJitter(arr) {
      if (arr.length < 2) return 0;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length - 1));
    }

    // Helper: median
    function median(arr) {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Helper: log diagnostics
    function logTimeSyncDiagnostics(diag) {
      if (import.meta.env.MODE !== 'production') {
        console.debug('[TimeSync]', diag);
      }
    }

    // Helper: reset all history
    function resetSyncHistory() {
      lastOffsets = [];
      lastRtts = [];
      lastJitters = [];
      lastDrifts = [];
      syncFailures = 0;
    }

    // Main sync function
    function syncTime(force = false) {
      if (syncInProgress) return; // Prevent overlapping syncs
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;
      const now = Date.now();
      if (!force && now - lastSyncTime < adaptiveInterval - 50) return;
      lastSyncTime = now;
      syncInProgress = true;
      const clientSent = now;
      let didRespond = false;

      // Timeout for sync response
      const syncTimeout = setTimeout(() => {
        if (!didRespond) {
          syncFailures++;
          if (syncFailures >= MAX_SYNC_FAILURES) {
            resetSyncHistory();
            adaptiveInterval = Math.max(ADAPTIVE_INTERVAL_BAD, adaptiveInterval * 0.7); // Decrease interval on repeated failures
          }
          syncInProgress = false;
        }
      }, 600);

      socket.emit(
        'time_sync',
        {
          clientSent,
          clientCallbackReceived: Date.now(),
          userAgent: navigator.userAgent,
        },
        (data) => {
          didRespond = true;
          clearTimeout(syncTimeout);
          syncInProgress = false;

          if (
            !data ||
            (typeof data.serverReceived !== 'number' && typeof data.serverTime !== 'number') ||
            typeof data.clientSent !== 'number'
          ) {
            syncFailures++;
            if (syncFailures >= MAX_SYNC_FAILURES) {
              resetSyncHistory();
              adaptiveInterval = Math.max(ADAPTIVE_INTERVAL_BAD, adaptiveInterval * 0.7);
            }
            return;
          }
          syncFailures = 0;

          const clientReceived = Date.now();
          let offset, roundTrip;
          if (typeof data.serverReceived === 'number' && typeof data.serverProcessed === 'number') {
            const serverMid = (data.serverReceived + data.serverProcessed) / 2;
            roundTrip = clientReceived - data.clientSent;
            offset = serverMid - clientReceived;
          } else {
            roundTrip = clientReceived - data.clientSent;
            const estimatedServerTime = data.serverTime + roundTrip / 2;
            offset = estimatedServerTime - clientReceived;
          }
          if (roundTrip > MAX_RTT) return;

          // Smoothing: keep a rolling window, filter outliers
          lastOffsets.push(offset);
          lastRtts.push(roundTrip);
          if (lastOffsets.length > MAX_HISTORY) lastOffsets.shift();
          if (lastRtts.length > MAX_HISTORY) lastRtts.shift();

          // Outlier filtering: trimmed mean
          const avgOffset = trimmedMean(lastOffsets, TRIM_RATIO);
          const avgRtt = trimmedMean(lastRtts, TRIM_RATIO);

          // Jitter calculation
          const calcJitterVal = calcJitter(lastRtts);
          setJitter(calcJitterVal);

          // Adaptive interval logic: more responsive
          if (syncFailures > 0 || avgRtt > AVG_RTT_BAD || calcJitterVal > JITTER_BAD) {
            adaptiveInterval = Math.max(ADAPTIVE_INTERVAL_BAD, adaptiveInterval * 0.7);
          } else if (avgRtt < AVG_RTT_GOOD && calcJitterVal < JITTER_GOOD) {
            adaptiveInterval = Math.min(ADAPTIVE_INTERVAL_GOOD, adaptiveInterval * 1.15);
          } else {
            adaptiveInterval = ADAPTIVE_INTERVAL_DEFAULT;
          }

          setTimeOffset(avgOffset);
          setRtt(avgRtt);
          warnClockSkew(offset);
        }
      );
    }

    // React to visibility changes: force sync when tab regains focus
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        syncTime(true);
      }
    }

    // React to network changes: force sync on reconnect
    function handleOnline() {
      syncTime(true);
    }

    if (socketRef.current && connected) {
      resetSyncHistory();
      syncTime(true); // Initial sync
      interval = setInterval(() => syncTime(), adaptiveInterval);

      // Listen for visibility/network events
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('online', handleOnline);
    }

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      resetSyncHistory();
    };
  }, [connected, deviceInfo, displayName]);

  // --- Continuous Adaptive Sync: periodic NTP batch in background ---
  useEffect(() => {
    if (!socketRef.current || !connected || !sessionId) return;
    let interval;
    // Periodic NTP batch sync every 20 seconds
    interval = setInterval(() => {
      ntpBatchSync(socketRef.current);
    }, 20000);
    // Trigger NTP batch sync on tab focus or network reconnect
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        ntpBatchSync(socketRef.current);
      }
    }
    function handleOnline() {
      ntpBatchSync(socketRef.current);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [connected, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      console.warn('[useSocket] No sessionId provided, skipping socket connection.');
      return;
    }

    const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const socket = io(url, {
      transports: ['websocket'],
      timeout: 20000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    let reconnectAttempts = 0;

    const logPrefix = `[useSocket][${sessionId}]`;

    // --- Event Handlers ---
    const handleConnect = async () => {
      console.info(`${logPrefix} Socket connected`);
      setConnected(true);
      reconnectAttempts = 0;
      // --- Perform NTP-like batch sync before joining session ---
      await ntpBatchSync(socket);
      socket.emit('join_session', { sessionId, displayName, deviceInfo, clientId }, (data) => {
        if (data?.error) {
          console.error(`${logPrefix} JOIN CALLBACK ERROR:`, data.error);
        } else {
          console.debug(`${logPrefix} JOIN CALLBACK DATA:`, data);
          setControllerId(data.controllerId);
          setControllerClientId(data.controllerClientId || null);
          // --- Advanced sync state ---
          // Optionally expose more session state to consumers
          // setSessionSyncState(data); // This line was causing an error, so it's removed.
          // Optionally, you can add more state setters here for queue, track, etc.
          socket.sessionId = sessionId;
        }
      });
    };

    const handleDisconnect = (reason) => {
      setConnected(false);
      if (reason) {
        console.warn(`${logPrefix} Socket disconnected:`, reason);
      } else {
        console.info(`${logPrefix} Socket disconnected`);
      }
    };

    const handleConnectError = (error) => {
      reconnectAttempts += 1;
      console.error(`${logPrefix} Connection error (attempt ${reconnectAttempts}):`, error);
      if (reconnectAttempts >= 10) {
        console.error(`${logPrefix} Max reconnection attempts reached.`);
      }
    };

    const handleError = (error) => {
      console.error(`${logPrefix} Socket error:`, error);
    };

    // --- Attach Event Listeners ---
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('error', handleError);

    // Core session events
    socket.on('controller_change', setControllerId);
    socket.on('clients_update', setClients);
    socket.on('controller_client_change', setControllerClientId);
    socket.on('controller_requests_update', setPendingControllerRequests);

    // Controller request/offer events
    socket.on('controller_request_received', setControllerRequestReceived);
    socket.on('controller_offer_received', setControllerOfferReceived);
    socket.on('controller_offer_sent', setControllerOfferSent);
    socket.on('controller_offer_accepted', setControllerOfferAccepted);
    socket.on('controller_offer_declined', setControllerOfferDeclined);

    // Session closed by server (e.g., timeout/cleanup)
    socket.on('session_closed', () => {
      console.warn(`${logPrefix} Session closed by server.`);
      setConnected(false);
      setControllerId(null);
      setClients([]);
      setControllerClientId(null);
      setPendingControllerRequests([]);
      setControllerRequestReceived(null);
      setControllerOfferReceived(null);
      setControllerOfferSent(null);
      setControllerOfferAccepted(null);
      setControllerOfferDeclined(null);
      // Optionally, notify user or redirect
    });

    // Optional: handle server-initiated forced reload
    socket.on('force_reload', () => {
      console.warn(`${logPrefix} Server requested client reload.`);
      window.location.reload();
    });

    // Optional: handle backend version mismatch
    socket.on('backend_version_mismatch', (serverVersion) => {
      console.warn(`${logPrefix} Backend version mismatch:`, serverVersion);
      // Optionally, show UI warning or reload
    });

    // --- Cleanup ---
    return () => {
      console.info(`${logPrefix} Cleaning up socket connection`);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('error', handleError);

      socket.off('controller_change', setControllerId);
      socket.off('clients_update', setClients);
      socket.off('controller_client_change', setControllerClientId);
      socket.off('controller_requests_update', setPendingControllerRequests);

      socket.off('controller_request_received', setControllerRequestReceived);
      socket.off('controller_offer_received', setControllerOfferReceived);
      socket.off('controller_offer_sent', setControllerOfferSent);
      socket.off('controller_offer_accepted', setControllerOfferAccepted);
      socket.off('controller_offer_declined', setControllerOfferDeclined);

      socket.off('session_closed');
      socket.off('force_reload');
      socket.off('backend_version_mismatch');

      socket.disconnect();
      setConnected(false);
      setControllerId(null);
      setClients([]);
      setControllerClientId(null);
      setPendingControllerRequests([]);
      setControllerRequestReceived(null);
      setControllerOfferReceived(null);
      setControllerOfferSent(null);
      setControllerOfferAccepted(null);
      setControllerOfferDeclined(null);
    };
  }, [sessionId, clientId]);

  // Expose a method to force immediate time sync (for use on drift)
  function forceTimeSync() {
    if (typeof window !== 'undefined' && window.__forceTimeSync) {
      window.__forceTimeSync();
    }
  }

  // Expose a method to force immediate NTP batch sync (for manual resync)
  function forceNtpBatchSync() {
    if (socketRef.current) {
      ntpBatchSync(socketRef.current);
    }
  }

  // Enhanced getServerTime: returns both raw and Date object, and diagnostics
  function getServerTime(options = {}) {
    // options: { asDate: boolean, withDiagnostics: boolean }
    const now = Date.now();
    const serverTimestamp = now + timeOffset;
    if (options.asDate) {
      const result = new Date(serverTimestamp);
      if (options.withDiagnostics) {
        return {
          date: result,
          timestamp: serverTimestamp,
          offset: timeOffset,
          rtt,
        };
      }
      return result;
    }
    if (options.withDiagnostics) {
      return {
        timestamp: serverTimestamp,
        offset: timeOffset,
        rtt,
      };
    }
    return serverTimestamp;
  }

  // Enhanced return object with more diagnostics, utility methods, and controller status
  return {
    socket: socketRef.current,
    connected,
    controllerId,
    controllerClientId,
    clients,
    clientId,
    timeOffset,
    rtt,
    getServerTime,
    forceTimeSync, // for immediate sync
    pendingControllerRequests,
    controllerRequestReceived,
    controllerOfferReceived,
    controllerOfferSent,
    controllerOfferAccepted,
    controllerOfferDeclined,
    // Enhanced: is this client the controller?
    isController: controllerClientId && clientId && controllerClientId === clientId,
    // Utility: reconnect method
    reconnect: () => {
      if (socketRef.current && typeof socketRef.current.connect === 'function') {
        socketRef.current.connect();
      }
    },
    // Utility: disconnect method
    disconnect: () => {
      if (socketRef.current && typeof socketRef.current.disconnect === 'function') {
        socketRef.current.disconnect();
      }
    },
    // Diagnostics for UI and debugging
    timeSyncDiagnostics: {
      offset: timeOffset,
      rtt,
      jitter,
      drift,
      // Optionally expose jitter and interval if available
      // These are not tracked in state, but could be exposed if needed
      // jitter,
      // adaptiveInterval,
    },
    // Expose raw socket for advanced use
    rawSocket: socketRef.current,
    // Expose a method to emit custom events
    emit: (...args) => {
      if (socketRef.current && typeof socketRef.current.emit === 'function') {
        socketRef.current.emit(...args);
      }
    },
    // Expose a method to listen to custom events
    on: (event, handler) => {
      if (socketRef.current && typeof socketRef.current.on === 'function') {
        socketRef.current.on(event, handler);
      }
    },
    // Expose a method to remove event listeners
    off: (event, handler) => {
      if (socketRef.current && typeof socketRef.current.off === 'function') {
        socketRef.current.off(event, handler);
      }
    },
    forceNtpBatchSync,
  };
}
