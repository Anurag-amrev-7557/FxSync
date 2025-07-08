import { useMemo } from 'react';
import usePeerTimeSync from './usePeerTimeSync';

// Max number of peers to support for stable hook order
const MAX_PEERS = 5;

/**
 * Enhanced multi-peer time sync hook.
 * - Always calls hooks in stable order for React.
 * - Aggregates offsets, RTTs, jitter, and connection states for all peers.
 * - Computes a robust median/trimmed mean offset for better global sync.
 * - Returns both per-peer and aggregate sync stats.
 */
export default function useMultiPeerTimeSync(socket, clientId, peerIds) {
  // Pad peerIds to always call hooks in the same order
  const paddedPeerIds = useMemo(() => {
    const arr = [...peerIds.slice(0, MAX_PEERS)];
    while (arr.length < MAX_PEERS) arr.push(null);
    return arr;
  }, [peerIds]);

  // Call usePeerTimeSync for each peer (null if no peer)
  const peerSyncs = paddedPeerIds.map(peerId =>
    peerId ? usePeerTimeSync(socket, clientId, peerId) : null
  );

  // Aggregate stats for better global sync
  const aggregate = useMemo(() => {
    const validOffsets = peerSyncs
      .map(sync => sync && typeof sync.peerOffset === 'number' ? sync.peerOffset : null)
      .filter(v => v !== null && isFinite(v));
    const validRtts = peerSyncs
      .map(sync => sync && typeof sync.peerRtt === 'number' ? sync.peerRtt : null)
      .filter(v => v !== null && isFinite(v));
    const validJitters = peerSyncs
      .map(sync => sync && typeof sync.jitter === 'number' ? sync.jitter : null)
      .filter(v => v !== null && isFinite(v));
    const connectionStates = peerSyncs.map(sync => sync ? sync.connectionState : 'disconnected');

    // Robust median/trimmed mean for offset
    let globalOffset = 0;
    if (validOffsets.length > 0) {
      const sorted = [...validOffsets].sort((a, b) => a - b);
      const trim = Math.max(1, Math.floor(sorted.length * 0.22));
      const trimmed = sorted.slice(trim, sorted.length - trim);
      globalOffset = trimmed.length > 0
        ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length
        : sorted[Math.floor(sorted.length / 2)];
    }

    // Median RTT and jitter
    const median = arr => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    return {
      globalOffset,
      medianRtt: median(validRtts),
      medianJitter: median(validJitters),
      connectionStates,
      peerCount: validOffsets.length,
    };
  }, [peerSyncs]);

  return {
    peerSyncs,
    ...aggregate,
  };
}