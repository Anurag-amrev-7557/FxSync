import { useEffect, useRef, useState } from 'react';

/**
 * usePeerTimeSync - React hook for WebRTC peer-to-peer time sync with signaling via socket.io
 * @param {object} socket - The socket.io client instance
 * @param {string} localId - This client's unique ID
 * @param {string} peerId - The peer's unique ID to connect to
 * @returns {object} { peerOffset, peerRtt, connectionState }
 */
export default function usePeerTimeSync(socket, localId, peerId) {
  const [peerOffset, setPeerOffset] = useState(0);
  const [peerRtt, setPeerRtt] = useState(null);
  const [connectionState, setConnectionState] = useState('disconnected');
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    console.log('usePeerTimeSync effect running:', { socket, localId, peerId });
    if (!socket || !localId || !peerId || localId === peerId) {
      console.log('usePeerTimeSync effect early return:', { socket, localId, peerId });
      return;
    }

    console.log('Connecting to peer:', peerId, 'from', localId);
    let isInitiator = localId < peerId; // Simple deterministic initiator
    let dc;
    setConnectionState('connecting');

    // --- 1. Create PeerConnection ---
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ]
    });
    pcRef.current = pc;

    // --- 2. DataChannel setup ---
    if (isInitiator) {
      dc = pc.createDataChannel('timeSync');
      setupDataChannel(dc);
    } else {
      pc.ondatachannel = (event) => {
        dc = event.channel;
        setupDataChannel(dc);
      };
    }

    // --- 3. ICE Candidate Handling ---
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate:', event.candidate);
        socket.emit('peer-ice-candidate', {
          to: peerId,
          from: localId,
          candidate: event.candidate,
        });
      } else {
        console.log('All ICE candidates have been sent');
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
    };

    // --- 4. Signaling: Offer/Answer Exchange ---
    async function startSignaling() {
      console.log('startSignaling called for', localId, '->', peerId);
      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('peer-offer', { to: peerId, from: localId, offer });
        console.log('Emitted peer-offer to', peerId, 'from', localId);
        console.log('Sent peer-offer to', peerId, 'from', localId);
      }
    }

    socket.on('peer-offer', async (data) => {
      if (data.to !== localId) return;
      const { from, offer } = data;
      console.log('peer-offer event received (filtered):', data, 'localId:', localId, 'peerId:', peerId);
      if (from !== peerId) return;
      console.log('Received peer-offer from', from, 'to', localId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('peer-answer', { to: from, from: localId, answer });
      console.log('Emitted peer-answer to', from, 'from', localId);
      console.log('Sent peer-answer to', from, 'from', localId);
    });

    socket.on('peer-answer', async (data) => {
      if (data.to !== localId) return;
      const { from, answer } = data;
      console.log('peer-answer event received (filtered):', data, 'localId:', localId, 'peerId:', peerId);
      if (from !== peerId) return;
      console.log('Received peer-answer from', from, 'to', localId);
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('peer-ice-candidate', async (data) => {
      if (data.to !== localId) return;
      const { from, candidate } = data;
      console.log('peer-ice-candidate event received (filtered):', data, 'localId:', localId, 'peerId:', peerId);
      if (from !== peerId) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Failed to add ICE candidate:', e);
      }
    });

    // --- 5. DataChannel Logic ---
    function setupDataChannel(dataChannel) {
      dcRef.current = dataChannel;
      dataChannel.onopen = () => {
        setConnectionState('connected');
        console.log('Peer connection open:', localId, '->', peerId);
        // Periodically send time sync messages
        let lastIntervalFired = Date.now();
        intervalRef.current = setInterval(() => {
          const nowInterval = Date.now();
          const elapsed = nowInterval - lastIntervalFired;
          lastIntervalFired = nowInterval;
          // Timer drift detection: if interval fires late, reset connection
          if (elapsed > 4000) {
            // 2x the normal 2000ms interval
            setConnectionState('disconnected');
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (dataChannel.readyState === 'open' || dataChannel.readyState === 'connecting') {
              dataChannel.close();
            }
            // Optionally, log or trigger a reconnect here
            if (
              typeof window !== 'undefined' &&
              window.console &&
              import.meta.env.MODE === 'development'
            ) {
              console.warn(
                '[PeerTimeSync] Timer drift detected (tab throttling?). Peer sync will reconnect.'
              );
            }
            return;
          }
          const now = Date.now();
          dataChannel.send(JSON.stringify({ type: 'timeSync', clientSent: now }));
        }, 2000);
      };
      dataChannel.onclose = () => {
        setConnectionState('disconnected');
        console.log('Peer connection closed:', localId, '->', peerId);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
      dataChannel.onerror = () => {
        setConnectionState('error');
        console.log('Peer connection error:', localId, '->', peerId);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
      dataChannel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'timeSync') {
          // Respond with server time
          dataChannel.send(
            JSON.stringify({
              type: 'timeSyncReply',
              clientSent: msg.clientSent,
              serverTime: Date.now(),
            })
          );
        } else if (msg.type === 'timeSyncReply') {
          const clientReceived = Date.now();
          const rtt = clientReceived - msg.clientSent;
          const offset = msg.serverTime + rtt / 2 - clientReceived;
          setPeerOffset(offset);
          setPeerRtt(rtt);
        }
      };
    }

    // --- 6. Start signaling if initiator ---
    console.log('isInitiator:', isInitiator, 'localId:', localId, 'peerId:', peerId);
    if (isInitiator) startSignaling();

    // --- 7. Cleanup ---
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (dcRef.current) dcRef.current.close();
      if (pcRef.current) pcRef.current.close();
      socket.off('peer-offer');
      socket.off('peer-answer');
      socket.off('peer-ice-candidate');
    };
  }, [socket, localId, peerId]);

  return { peerOffset, peerRtt, connectionState };
}
