import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getClientId } from '../utils/clientId';

export default function useSocket(sessionId, displayName = '', deviceInfo = '') {
  const [connected, setConnected] = useState(false);
  const [controllerId, setControllerId] = useState(null);
  const [clients, setClients] = useState([]);
  const [controllerClientId, setControllerClientId] = useState(null);
  const [timeOffset, setTimeOffset] = useState(0); // serverTime - clientTime
  const [rtt, setRtt] = useState(null);
  const socketRef = useRef(null);
  const clientId = getClientId();

  // Enhanced time sync logic with drift smoothing, error handling, and diagnostics
  useEffect(() => {
    let interval;
    let lastOffsets = [];
    const MAX_HISTORY = 8; // For smoothing

    function syncTime() {
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;
      const clientSent = Date.now();

      // Send extended info for diagnostics
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
          const estimatedServerTime = data.serverTime + roundTrip / 2;
          const offset = estimatedServerTime - clientReceived;

          // Smoothing: keep a rolling average of offsets
          lastOffsets.push(offset);
          if (lastOffsets.length > MAX_HISTORY) lastOffsets.shift();
          const avgOffset =
            lastOffsets.reduce((a, b) => a + b, 0) / lastOffsets.length;

          setTimeOffset(avgOffset);
          setRtt(roundTrip);

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
      syncTime();
      interval = setInterval(syncTime, 5000); // every 5 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
      lastOffsets = [];
    };
  }, [connected]);

  useEffect(() => {
    if (!sessionId) return;
    const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const socket = io(url, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_session', { sessionId, displayName, deviceInfo, clientId }, (data) => {
        console.log('JOIN CALLBACK DATA:', data);
        setControllerId(data.controllerId);
        setControllerClientId(data.controllerClientId || null);
        socket.sessionId = sessionId;
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('controller_change', setControllerId);
    socket.on('clients_update', setClients);
    socket.on('controller_client_change', setControllerClientId);

    return () => {
      socket.disconnect();
      setConnected(false);
      setControllerId(null);
      setClients([]);
      setControllerClientId(null);
    };
  }, [sessionId, displayName, deviceInfo, clientId]);

  useEffect(() => {
    console.log('controllerClientId:', controllerClientId, 'clientId:', clientId, 'isController:', controllerClientId && clientId && controllerClientId === clientId);
  }, [controllerClientId, clientId]);

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
  };
} 