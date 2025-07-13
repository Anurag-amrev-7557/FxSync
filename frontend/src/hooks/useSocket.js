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

  // --- Add high-res time sync state ---
  const [highResOffset, setHighResOffset] = useState(0); // ns
  const [lastHighResServer, setLastHighResServer] = useState(0); // ns
  const [lastHighResClient, setLastHighResClient] = useState(0); // ns

  // --- NTP-like multi-round time sync before joining session ---
  async function ntpBatchSync(socket, rounds = 8) {
    const samples = [];
    for (let i = 0; i < rounds; i++) {
      const now = Date.now();
      await new Promise((resolve) => {
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
              // Use midpoint between serverReceived and serverProcessed for more accurate offset
              const serverMid = (data.serverReceived + data.serverProcessed) / 2;
              const roundTrip = clientReceived - data.clientSent;
              if (roundTrip > MAX_RTT) return resolve(); // Ignore high RTT
              const offset = serverMid - clientReceived;
              samples.push({ offset, rtt: roundTrip });
            } else if (
              data &&
              typeof data.serverTime === 'number' &&
              typeof data.clientSent === 'number'
            ) {
              // Fallback to old method if serverReceived/Processed missing
              const clientReceived = Date.now();
              const roundTrip = clientReceived - data.clientSent;
              if (roundTrip > MAX_RTT) return resolve();
              const estimatedServerTime = data.serverTime + roundTrip / 2;
              const offset = estimatedServerTime - clientReceived;
              samples.push({ offset, rtt: roundTrip });
            }
            setTimeout(resolve, 20); // Small delay between rounds
          }
        );
      });
    }
    if (samples.length < 4) return; // Not enough samples
    samples.sort((a, b) => a.rtt - b.rtt);
    const trimmed = samples.slice(2, -2); // Remove top/bottom 2 RTTs
    // Weighted offset calculation: 50% lowest, 30% second, 20% third
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

  // --- Batch NTP/Time Sync with High-Res Support ---
  async function batchTimeSync(socket, rounds = 8) {
    if (!socket) return;
    let samples = [];
    let usedBatch = false;
    // Try new batch event first
    try {
      samples = await new Promise((resolve) => {
        socket.emit('time_sync_batch', { count: rounds }, (arr) => {
          if (Array.isArray(arr) && arr.length > 0 && arr[0].serverTime && arr[0].hrtime) {
            usedBatch = true;
            const clientTimes = [];
            for (let i = 0; i < arr.length; i++) {
              clientTimes.push(performance.now() * 1e6); // ns
            }
            // Map samples to include client receive time
            const mapped = arr.map((s, i) => ({
              serverTime: s.serverTime,
              hrtime: s.hrtime,
              clientReceived: clientTimes[i],
            }));
            resolve(mapped);
          } else {
            resolve([]);
          }
        });
      });
    } catch (e) {
      samples = [];
    }
    // Fallback to old method if batch not available
    if (!usedBatch || samples.length < 2) {
      for (let i = 0; i < rounds; i++) {
        await new Promise((resolve) => {
          const clientSentAt = Date.now();
          socket.emit('time:sync', clientSentAt, ({ serverTime, clientSentAt: echoed }) => {
            const clientReceivedAt = Date.now();
            const rtt = clientReceivedAt - echoed;
            const offset = serverTime - (echoed + rtt / 2);
            samples.push({ serverTime, rtt, offset, clientReceived: clientReceivedAt });
            resolve();
          });
        });
      }
    }
    // Analyze samples
    if (samples.length > 1) {
      // Use trimmed mean/median for ms offset/RTT
      const msOffsets = samples.map(s => s.offset !== undefined ? s.offset : (s.serverTime - (s.clientReceived - (s.rtt || 0) / 2)));
      const msRtts = samples.map(s => s.rtt !== undefined ? s.rtt : Math.abs(s.serverTime - s.clientReceived));
      msOffsets.sort((a, b) => a - b);
      msRtts.sort((a, b) => a - b);
      const trim = Math.floor(samples.length * 0.2);
      const trimmedOffsets = msOffsets.slice(trim, msOffsets.length - trim);
      const trimmedRtts = msRtts.slice(trim, msRtts.length - trim);
      const bestOffset = trimmedOffsets.length ? trimmedOffsets.reduce((a, b) => a + b, 0) / trimmedOffsets.length : msOffsets[0];
      const bestRtt = trimmedRtts.length ? trimmedRtts.reduce((a, b) => a + b, 0) / trimmedRtts.length : msRtts[0];
      setTimeOffset(bestOffset);
      setRtt(bestRtt);
      // High-res offset (ns)
      if (usedBatch && samples[0].hrtime) {
        // Estimate offset: server hrtime - client hrtime
        const hrOffsets = samples.map(s => s.hrtime - s.clientReceived);
        hrOffsets.sort((a, b) => a - b);
        const trimmedHrOffsets = hrOffsets.slice(trim, hrOffsets.length - trim);
        const bestHrOffset = trimmedHrOffsets.length ? trimmedHrOffsets.reduce((a, b) => a + b, 0) / trimmedHrOffsets.length : hrOffsets[0];
        setHighResOffset(bestHrOffset);
        setLastHighResServer(samples[0].hrtime);
        setLastHighResClient(samples[0].clientReceived);
      }
    }
  }

  // --- Expose a getHighResServerTime() method ---
  function getHighResServerTime() {
    if (highResOffset && lastHighResClient) {
      // Estimate current server hrtime
      const now = performance.now() * 1e6; // ns
      return now + highResOffset;
    }
    // Fallback to ms
    return Date.now() * 1e6;
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
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Helper: log diagnostics
    function logTimeSyncDiagnostics(diag) {
      // Production logging removed
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
            adaptiveInterval = ADAPTIVE_INTERVAL_BAD;
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
              adaptiveInterval = ADAPTIVE_INTERVAL_BAD;
            }
            return;
          }
          syncFailures = 0;

          const clientReceived = Date.now();
          let offset, roundTrip;
          if (typeof data.serverReceived === 'number' && typeof data.serverProcessed === 'number') {
            // Use midpoint between serverReceived and serverProcessed
            const serverMid = (data.serverReceived + data.serverProcessed) / 2;
            roundTrip = clientReceived - data.clientSent;
            offset = serverMid - clientReceived;
          } else {
            // Fallback to old method
            roundTrip = clientReceived - data.clientSent;
            const estimatedServerTime = data.serverTime + roundTrip / 2;
            offset = estimatedServerTime - clientReceived;
          }
          if (roundTrip > MAX_RTT) return; // Ignore high RTT samples

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
          lastJitters.push(calcJitterVal);
          if (lastJitters.length > MAX_HISTORY) lastJitters.shift();
          setJitter(calcJitterVal);

          // Drift calculation (change in offset)
          let driftVal = 0;
          if (lastOffsets.length > 1) {
            driftVal = lastOffsets[lastOffsets.length - 1] - lastOffsets[lastOffsets.length - 2];
            lastDrifts.push(driftVal);
            if (lastDrifts.length > MAX_HISTORY) lastDrifts.shift();
            setDrift(driftVal);
          }

          setTimeOffset(avgOffset);
          setRtt(avgRtt);

          // Adaptive interval: shorter if unstable, longer if stable
          if (calcJitterVal > 20 || Math.abs(driftVal) > 20) {
            adaptiveInterval = ADAPTIVE_INTERVAL_BAD; // Unstable, sync more often
            // Production logging removed
          } else if (calcJitterVal < JITTER_GOOD && Math.abs(driftVal) < 5 && avgRtt < AVG_RTT_GOOD) {
            adaptiveInterval = ADAPTIVE_INTERVAL_GOOD; // Very stable, sync less often
          } else {
            adaptiveInterval = ADAPTIVE_INTERVAL_DEFAULT; // Default
          }

          // Optionally, log diagnostics for debugging
          logTimeSyncDiagnostics({
            serverTime: data.serverTime,
            clientSent: data.clientSent,
            clientReceived,
            roundTrip,
            offset,
            avgOffset,
            avgRtt,
            jitter: calcJitterVal,
            drift: driftVal,
            medianJitter: median(lastJitters),
            medianDrift: median(lastDrifts),
            adaptiveInterval,
            serverIso: data.serverIso,
            serverUptime: data.serverUptime,
            serverInfo: data.serverInfo,
            roundTripEstimate: data.roundTripEstimate,
            historyLen: lastOffsets.length,
          });
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
  }, [connected]);

  // --- Continuous Adaptive Sync: periodic NTP batch in background ---
  useEffect(() => {
    if (!socketRef.current || !connected || !sessionId) return;
    let interval;
    // Periodic batch time sync every 20 seconds
    interval = setInterval(() => {
      batchTimeSync(socketRef.current);
    }, 20000);
    // Trigger batch time sync on tab focus or network reconnect
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        batchTimeSync(socketRef.current);
      }
    }
    function handleOnline() {
      batchTimeSync(socketRef.current);
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
      // Production logging removed
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
      // Production logging removed
      setConnected(true);
      reconnectAttempts = 0;
      // --- Perform NTP-like batch sync before joining session ---
      await ntpBatchSync(socket);
      socket.emit('join_session', { sessionId, displayName, deviceInfo, clientId }, (data) => {
        if (data?.error) {
          console.error(`${logPrefix} JOIN CALLBACK ERROR:`, data.error);
        } else {
          // Production logging removed
          setControllerId(data.controllerId);
          setControllerClientId(data.controllerClientId || null);
          // --- Advanced sync state ---
          // Optionally expose more session state to consumers
          if (typeof setSessionSyncState === 'function') {
            setSessionSyncState(data);
          }
          // Optionally, you can add more state setters here for queue, track, etc.
          socket.sessionId = sessionId;
        }
      });
    };

    const handleDisconnect = (reason) => {
      setConnected(false);
      if (reason) {
        // Production logging removed
      } else {
        // Production logging removed
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
      // Production logging removed
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
      // Production logging removed
      window.location.reload();
    });

    // Optional: handle backend version mismatch
    socket.on('backend_version_mismatch', (serverVersion) => {
      // Production logging removed
      // Optionally, show UI warning or reload
    });

    // --- Cleanup ---
    return () => {
      // Production logging removed
      if (socket) {
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
      }
    };
  }, [sessionId, clientId]);

  // Debug state changes in development
  useEffect(() => {
    // Production logging removed
  }, [controllerClientId, clientId, connected]);

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
    highResOffset, // ns
    getHighResServerTime,
  };
} 