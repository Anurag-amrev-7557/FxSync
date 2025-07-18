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
    if (!socket || !localId || !peerId || localId === peerId) return;

    let isInitiator = localId < peerId; // Simple deterministic initiator
    let pc, dc;
    setConnectionState('connecting');

    // --- 1. Create PeerConnection ---
    pc = new RTCPeerConnection();
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
        socket.emit('peer-ice-candidate', { to: peerId, from: localId, candidate: event.candidate });
      }
    };

    // --- 4. Signaling: Offer/Answer Exchange ---
    async function startSignaling() {
      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('peer-offer', { to: peerId, from: localId, offer });
      }
    }

    socket.on('peer-offer', async ({ from, offer }) => {
      if (from !== peerId) return;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('peer-answer', { to: from, from: localId, answer });
    });

    socket.on('peer-answer', async ({ from, answer }) => {
      if (from !== peerId) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('peer-ice-candidate', async ({ from, candidate }) => {
      if (from !== peerId) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore
      }
    });

    // --- 5. DataChannel Logic ---
    function setupDataChannel(dataChannel) {
      dcRef.current = dataChannel;
      dataChannel.onopen = () => {
        setConnectionState('connected');
        // Periodically send time sync messages
        let lastIntervalFired = Date.now();
        intervalRef.current = setInterval(() => {
          const nowInterval = Date.now();
          const elapsed = nowInterval - lastIntervalFired;
          lastIntervalFired = nowInterval;
          // Timer drift detection: if interval fires late, reset connection
          if (elapsed > 4000) { // 2x the normal 2000ms interval
            setConnectionState('disconnected');
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (dataChannel.readyState === 'open' || dataChannel.readyState === 'connecting') {
              dataChannel.close();
            }
            // Optionally, log or trigger a reconnect here
            if (typeof window !== 'undefined' && window.console) {
              console.warn('[PeerTimeSync] Timer drift detected (tab throttling?). Peer sync will reconnect.');
            }
            return;
          }
          const now = Date.now();
          dataChannel.send(JSON.stringify({ type: 'timeSync', clientSent: now }));
        }, 2000);
      };
      dataChannel.onclose = () => {
        setConnectionState('disconnected');
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
      dataChannel.onerror = () => {
        setConnectionState('error');
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
      dataChannel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'timeSync') {
          // Respond with server time
          dataChannel.send(JSON.stringify({ type: 'timeSyncReply', clientSent: msg.clientSent, serverTime: Date.now() }));
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