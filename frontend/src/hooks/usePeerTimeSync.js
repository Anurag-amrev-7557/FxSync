import { useEffect, useRef, useState } from 'react';

/**
 * usePeerTimeSync - Enhanced React hook for WebRTC peer-to-peer time sync with signaling via socket.io
 * @param {object} socket - The socket.io client instance
 * @param {string} localId - This client's unique ID
 * @param {string} peerId - The peer's unique ID to connect to
 * @returns {object} { peerOffset, peerRtt, connectionState, jitter }
 */
export default function usePeerTimeSync(socket, localId, peerId, onUpdate) {
  // --- Tuning constants for better sync ---
  const SYNC_INTERVAL = 900; // ms, adaptive in future
  const SYNC_BATCH = 6; // Number of samples per round
  const TRIM_RATIO = 0.22; // Outlier filtering
  const MAX_RTT = 220; // ms, ignore samples above this

  const [peerOffset, setPeerOffset] = useState(0);
  const [peerRtt, setPeerRtt] = useState(null);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [jitter, setJitter] = useState(0);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const intervalRef = useRef(null);
  const syncSamplesRef = useRef([]);
  const lastRttRef = useRef(null);

  // Wrap setState to also call onUpdate
  const setPeerOffsetWithUpdate = (v) => { setPeerOffset(v); if (onUpdate) { if (process.env.NODE_ENV !== 'production') { console.debug('[PeerTimeSync] onUpdate: peerOffset', v); } onUpdate(); } };
  const setPeerRttWithUpdate = (v) => { setPeerRtt(v); if (onUpdate) { if (process.env.NODE_ENV !== 'production') { console.debug('[PeerTimeSync] onUpdate: peerRtt', v); } onUpdate(); } };
  const setConnectionStateWithUpdate = (v) => { setConnectionState(v); if (onUpdate) { if (process.env.NODE_ENV !== 'production') { console.debug('[PeerTimeSync] onUpdate: connectionState', v); } onUpdate(); } };
  const setJitterWithUpdate = (v) => { setJitter(v); if (onUpdate) { if (process.env.NODE_ENV !== 'production') { console.debug('[PeerTimeSync] onUpdate: jitter', v); } onUpdate(); } };

  useEffect(() => {
    if (!socket || !localId || !peerId || localId === peerId) return;

    let isInitiator = localId < peerId; // Simple deterministic initiator
    let pc, dc;
    setConnectionStateWithUpdate('connecting');

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
      } catch (e) {
        // Ignore
      }
    });

    // --- 5. DataChannel Logic with enhanced time sync ---
    function setupDataChannel(dataChannel) {
      dcRef.current = dataChannel;
      dataChannel.onopen = () => {
        setConnectionStateWithUpdate('connected');
        // Start periodic batch sync
        intervalRef.current = setInterval(() => {
          performBatchSync(dataChannel);
        }, SYNC_INTERVAL);
        // Initial batch immediately
        performBatchSync(dataChannel);
      };
      dataChannel.onclose = () => {
        setConnectionStateWithUpdate('disconnected');
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
      dataChannel.onerror = () => {
        setConnectionStateWithUpdate('error');
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
      dataChannel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'timeSync') {
          // Respond with local time
          dataChannel.send(JSON.stringify({ type: 'timeSyncReply', clientSent: msg.clientSent, serverTime: Date.now() }));
        } else if (msg.type === 'timeSyncReply') {
          handleTimeSyncReply(msg);
        }
      };
    }

    // --- Enhanced: Batch time sync for better accuracy ---
    function performBatchSync(dataChannel) {
      syncSamplesRef.current = [];
      let sent = 0;
      let completed = 0;

      function sendSync() {
        if (sent >= SYNC_BATCH) return;
        const now = Date.now();
        dataChannel.send(JSON.stringify({ type: 'timeSync', clientSent: now }));
        sent++;
      }

      // Send all SYNC_BATCH requests quickly
      for (let i = 0; i < SYNC_BATCH; i++) {
        setTimeout(sendSync, i * 8); // slight stagger to avoid clumping
      }

      // After a short delay, process the batch
      setTimeout(() => {
        const samples = syncSamplesRef.current.filter(s => s.rtt < MAX_RTT);
        if (samples.length === 0) return;

        // Sort by RTT, trim outliers
        samples.sort((a, b) => a.rtt - b.rtt);
        const trim = Math.floor(samples.length * TRIM_RATIO);
        const trimmed = samples.slice(trim, samples.length - trim);

        // Calculate average offset and RTT
        const avgOffset = trimmed.reduce((sum, s) => sum + s.offset, 0) / trimmed.length;
        const avgRtt = trimmed.reduce((sum, s) => sum + s.rtt, 0) / trimmed.length;

        // Calculate jitter (mean deviation from avg RTT)
        const jitterVal = trimmed.reduce((sum, s) => sum + Math.abs(s.rtt - avgRtt), 0) / trimmed.length;

        setPeerOffsetWithUpdate(avgOffset);
        setPeerRttWithUpdate(avgRtt);
        setJitterWithUpdate(jitterVal);
        lastRttRef.current = avgRtt;
      }, 120 + SYNC_BATCH * 10);
    }

    function handleTimeSyncReply(msg) {
      const clientReceived = Date.now();
      const rtt = clientReceived - msg.clientSent;
      const offset = msg.serverTime + rtt / 2 - clientReceived;
      syncSamplesRef.current.push({ offset, rtt });
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

  return { peerOffset, peerRtt, connectionState, jitter };
} 