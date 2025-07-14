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
  const timeoutRef = useRef(null);

  // NTP batch sync config
  const BATCH_SIZE = 5; // Number of requests per batch
  const BATCH_INTERVAL = 2000; // ms between batches

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
      try {
        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('peer-offer', { to: peerId, from: localId, offer });
        }
      } catch (err) {
        setConnectionState('error');
      }
    }

    socket.on('peer-offer', async ({ from, offer }) => {
      if (from !== peerId) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('peer-answer', { to: from, from: localId, answer });
      } catch (err) {
        setConnectionState('error');
      }
    });

    socket.on('peer-answer', async ({ from, answer }) => {
      if (from !== peerId) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        setConnectionState('error');
      }
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
        // NTP-style batch sync
        let stopped = false;
        function sendBatchSync() {
          if (stopped) return;
          const batch = [];
          let responses = 0;
          // For each batch, send BATCH_SIZE requests
          for (let i = 0; i < BATCH_SIZE; ++i) {
            const clientSent = Date.now();
            batch.push({ clientSent, responded: false });
            dataChannel.send(JSON.stringify({ type: 'timeSync', clientSent, batchId: clientSent }));
          }
          // Handler for replies
          function handleReply(msg, clientReceived) {
            // Find the batch entry
            const idx = batch.findIndex(b => b.clientSent === msg.clientSent && !b.responded);
            if (idx === -1) return;
            batch[idx].responded = true;
            const rtt = clientReceived - msg.clientSent;
            const offset = msg.serverTime + rtt / 2 - clientReceived;
            batch[idx].rtt = rtt;
            batch[idx].offset = offset;
            responses++;
            // After all responses or after a timeout, pick the best
            if (responses === BATCH_SIZE) {
              const valid = batch.filter(b => typeof b.rtt === 'number' && typeof b.offset === 'number');
              if (valid.length) {
                const best = valid.reduce((a, b) => (a.rtt < b.rtt ? a : b));
                setPeerOffset(best.offset);
                setPeerRtt(best.rtt);
              }
            }
          }
          // Listen for replies for a short window
          const replyTimeout = setTimeout(() => {
            const valid = batch.filter(b => typeof b.rtt === 'number' && typeof b.offset === 'number');
            if (valid.length) {
              const best = valid.reduce((a, b) => (a.rtt < b.rtt ? a : b));
              setPeerOffset(best.offset);
              setPeerRtt(best.rtt);
            }
          }, 400); // 400ms window for replies

          // Attach a temporary message handler for this batch
          const onMessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'timeSyncReply') {
              handleReply(msg, Date.now());
            }
          };
          dataChannel.addEventListener('message', onMessage);
          // Schedule next batch
          timeoutRef.current = setTimeout(() => {
            dataChannel.removeEventListener('message', onMessage);
            clearTimeout(replyTimeout);
            if (!stopped) sendBatchSync();
          }, BATCH_INTERVAL);
        }
        sendBatchSync();
      };
      dataChannel.onclose = () => {
        setConnectionState('disconnected');
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
      dataChannel.onerror = () => {
        setConnectionState('error');
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
      dataChannel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'timeSync') {
          // Respond with server time
          dataChannel.send(JSON.stringify({ type: 'timeSyncReply', clientSent: msg.clientSent, serverTime: Date.now() }));
        }
        // timeSyncReply handled in batch logic
      };
    }

    // --- 6. Start signaling if initiator ---
    if (isInitiator) startSignaling();

    // --- 7. Cleanup ---
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (dcRef.current) dcRef.current.close();
      if (pcRef.current) pcRef.current.close();
      socket.off('peer-offer');
      socket.off('peer-answer');
      socket.off('peer-ice-candidate');
    };
  }, [socket, localId, peerId]);

  return { peerOffset, peerRtt, connectionState };
} 