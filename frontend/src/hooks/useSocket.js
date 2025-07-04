import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getClientId } from '../utils/clientId';

export default function useSocket(sessionId, displayName = '', deviceInfo = '') {
  const [connected, setConnected] = useState(false);
  const [controllerId, setControllerId] = useState(null);
  const [clients, setClients] = useState([]);
  const [controllerClientId, setControllerClientId] = useState(null);
  const socketRef = useRef(null);
  const clientId = getClientId();

  useEffect(() => {
    if (!sessionId) return;
    const socket = io(import.meta.env.VITE_BACKEND_URL, { transports: ['websocket'] });
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

  return {
    socket: socketRef.current,
    connected,
    controllerId,
    controllerClientId,
    clients,
    clientId,
  };
} 