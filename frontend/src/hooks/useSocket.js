import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getClientId } from '../utils/clientId';

// --- Time Sync Tuning Constants ---
const TRIM_RATIO = 0.22; // Outlier filtering trim ratio
const MAX_RTT = 220; // ms, ignore samples above this
const ADAPTIVE_INTERVAL_BAD = 800; // ms, unstable network
const ADAPTIVE_INTERVAL_GOOD = 2500; // ms, very stable
const ADAPTIVE_INTERVAL_DEFAULT = 1500; // ms, default
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
  const socketRef = useRef(null);
  const clientId = getClientId();

  // Enhanced time sync logic with drift smoothing, error handling, and diagnostics
  useEffect(() => {
    let interval;
    let lastOffsets = [];
    let lastRtts = [];
    const MAX_HISTORY = 10; // For smoothing (robust to spikes)
    let adaptiveInterval = ADAPTIVE_INTERVAL_DEFAULT; // Start with default
    let lastSyncTime = 0;

    function trimmedMean(arr, trimRatio) {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const trim = Math.floor(arr.length * trimRatio);
      const trimmed = sorted.slice(trim, arr.length - trim);
      if (trimmed.length === 0) return sorted[Math.floor(sorted.length / 2)];
      return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    }

    function calcJitter(arr) {
      if (arr.length < 2) return 0;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length - 1));
    }

    function syncTime(force = false) {
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;
      const now = Date.now();
      if (!force && now - lastSyncTime < adaptiveInterval - 50) return;
      lastSyncTime = now;
      const clientSent = now;
      socket.emit(
        'time_sync',
        {
          clientSent,
          clientCallbackReceived: Date.now(),
          userAgent: navigator.userAgent,
        },
        (data) => {
          if (
            !data ||
            typeof data.serverTime !== 'number' ||
            typeof data.clientSent !== 'number'
          )
            return;

          const clientReceived = Date.now();
          const roundTrip = clientReceived - data.clientSent;
          if (roundTrip > MAX_RTT) return; // Ignore high RTT samples
          const estimatedServerTime = data.serverTime + roundTrip / 2;
          const offset = estimatedServerTime - clientReceived;

          // Smoothing: keep a rolling window, filter outliers
          lastOffsets.push(offset);
          lastRtts.push(roundTrip);
          if (lastOffsets.length > MAX_HISTORY) lastOffsets.shift();
          if (lastRtts.length > MAX_HISTORY) lastRtts.shift();

          // Outlier filtering: trimmed mean
          const avgOffset = trimmedMean(lastOffsets, TRIM_RATIO);
          const avgRtt = trimmedMean(lastRtts, TRIM_RATIO);
          setTimeOffset(avgOffset);
          setRtt(avgRtt);

          // Adaptive interval: shorter if unstable, longer if stable
          const jitter = calcJitter(lastOffsets);
          if (jitter > 20 || avgRtt > 120) {
            adaptiveInterval = ADAPTIVE_INTERVAL_BAD; // Unstable, sync more often
          } else if (jitter < JITTER_GOOD && avgRtt < AVG_RTT_GOOD) {
            adaptiveInterval = ADAPTIVE_INTERVAL_GOOD; // Very stable, sync less often
          } else {
            adaptiveInterval = ADAPTIVE_INTERVAL_DEFAULT; // Default
          }

          // Optionally, log diagnostics for debugging
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.debug('[TimeSync]', {
              serverTime: data.serverTime,
              clientSent: data.clientSent,
              clientReceived,
              roundTrip,
              offset,
              avgOffset,
              avgRtt,
              jitter,
              adaptiveInterval,
              serverIso: data.serverIso,
              serverUptime: data.serverUptime,
              serverInfo: data.serverInfo,
              roundTripEstimate: data.roundTripEstimate,
            });
          }
        }
      );
    }

    if (socketRef.current && connected) {
      syncTime(true); // Initial sync
      interval = setInterval(() => syncTime(), adaptiveInterval);
    }
    return () => {
      if (interval) clearInterval(interval);
      lastOffsets = [];
      lastRtts = [];
    };
  }, [connected]);

  useEffect(() => {
    if (!sessionId) {
      console.log('useSocket: No sessionId provided');
      return;
    }
    console.log('useSocket: Creating socket connection for sessionId:', sessionId);
    const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    console.log('useSocket: Connecting to:', url);
    const socket = io(url, { 
      transports: ['websocket'],
      timeout: 20000,
      forceNew: true
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('useSocket: Socket connected');
      setConnected(true);
      socket.emit('join_session', { sessionId, displayName, deviceInfo, clientId }, (data) => {
        console.log('JOIN CALLBACK DATA:', data);
        setControllerId(data.controllerId);
        setControllerClientId(data.controllerClientId || null);
        socket.sessionId = sessionId;
      });
    });
    socket.on('disconnect', () => {
      console.log('useSocket: Socket disconnected');
      setConnected(false);
    });
    socket.on('connect_error', (error) => {
      console.error('useSocket: Connection error:', error);
    });
    socket.on('error', (error) => {
      console.error('useSocket: Socket error:', error);
    });
    socket.on('controller_change', setControllerId);
    socket.on('clients_update', setClients);
    socket.on('controller_client_change', setControllerClientId);
    socket.on('controller_requests_update', setPendingControllerRequests);
    socket.on('controller_request_received', setControllerRequestReceived);
    socket.on('controller_offer_received', setControllerOfferReceived);
    socket.on('controller_offer_sent', setControllerOfferSent);
    socket.on('controller_offer_accepted', setControllerOfferAccepted);
    socket.on('controller_offer_declined', setControllerOfferDeclined);

    return () => {
      console.log('useSocket: Cleaning up socket connection');
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

  useEffect(() => {
    console.log('useSocket: State update:', {
      controllerClientId,
      clientId,
      isController: controllerClientId && clientId && controllerClientId === clientId,
      socketExists: !!socketRef.current,
      connected
    });
  }, [controllerClientId, clientId, connected]);

  // Expose a method to force immediate time sync (for use on drift)
  function forceTimeSync() {
    if (typeof window !== 'undefined' && window.__forceTimeSync) {
      window.__forceTimeSync();
    }
  }

  // Expose getServerTime for precise scheduling
  function getServerTime() {
    return Date.now() + timeOffset;
  }

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
    // Diagnostics for UI
    timeSyncDiagnostics: {
      offset: timeOffset,
      rtt,
      // Optionally expose jitter and interval
    },
  };
} 