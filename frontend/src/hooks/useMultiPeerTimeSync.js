import { useMemo, useState, useCallback, useRef } from 'react';
import usePeerTimeSync from './usePeerTimeSync';

// Max number of peers to support for stable hook order
const MAX_PEERS = 5;

// Peer quality scoring weights
const PEER_QUALITY_WEIGHTS = {
  rtt: 0.4,        // Lower RTT is better
  jitter: 0.3,     // Lower jitter is better
  stability: 0.2,  // Connection stability
  drift: 0.1       // Historical drift consistency
};

/**
 * Enhanced multi-peer time sync hook with intelligent peer selection.
 * - Always calls hooks in stable order for React.
 * - Aggregates offsets, RTTs, jitter, and connection states for all peers.
 * - Computes a robust median/trimmed mean offset for better global sync.
 * - Intelligent peer selection based on quality metrics.
 * - Adaptive sync strategies based on network conditions.
 * - Returns both per-peer and aggregate sync stats.
 */
export default function useMultiPeerTimeSync(socket, clientId, peerIds) {
  // Always call hooks in the same order
  const paddedPeerIds = [...peerIds.slice(0, MAX_PEERS)];
  while (paddedPeerIds.length < MAX_PEERS) paddedPeerIds.push(null);

  // Add forceUpdate state to trigger re-renders
  const [, setForceUpdate] = useState(0);
  const forceUpdate = useCallback(() => setForceUpdate(f => f + 1), []);

  // Track peer quality history for better selection
  const peerQualityHistory = useRef(new Map());

  // Call usePeerTimeSync for each peer, passing forceUpdate as onUpdate
  const peerSyncs = paddedPeerIds.map(peerId =>
    usePeerTimeSync(socket, clientId, peerId, forceUpdate)
  );

  // Calculate peer quality scores
  const peerQualityScores = useMemo(() => {
    const scores = new Map();
    
    peerSyncs.forEach((sync, index) => {
      if (!sync || !paddedPeerIds[index]) return;
      
      const peerId = paddedPeerIds[index];
      const { peerRtt, jitter, connectionState } = sync;
      
      // Calculate quality score (0-1, higher is better)
      let score = 0;
      
      // RTT score (lower is better)
      if (peerRtt !== null && isFinite(peerRtt)) {
        const rttScore = Math.max(0, 1 - (peerRtt / 200)); // 200ms = 0 score
        score += rttScore * PEER_QUALITY_WEIGHTS.rtt;
      }
      
      // Jitter score (lower is better)
      if (jitter !== null && isFinite(jitter)) {
        const jitterScore = Math.max(0, 1 - (jitter / 50)); // 50ms = 0 score
        score += jitterScore * PEER_QUALITY_WEIGHTS.jitter;
      }
      
      // Connection stability score
      const stabilityScore = connectionState === 'connected' ? 1 : 0;
      score += stabilityScore * PEER_QUALITY_WEIGHTS.stability;
      
      // Historical drift consistency (if available)
      const history = peerQualityHistory.current.get(peerId) || [];
      if (history.length > 0) {
        const recentScores = history.slice(-5);
        const avgHistoricalScore = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
        score += avgHistoricalScore * PEER_QUALITY_WEIGHTS.drift;
      }
      
      scores.set(peerId, score);
      
      // Update history
      if (!peerQualityHistory.current.has(peerId)) {
        peerQualityHistory.current.set(peerId, []);
      }
      peerQualityHistory.current.get(peerId).push(score);
      
      // Keep only last 10 scores
      if (peerQualityHistory.current.get(peerId).length > 10) {
        peerQualityHistory.current.get(peerId).shift();
      }
    });
    
    return scores;
  }, [peerSyncs, paddedPeerIds]);

  // Select best peers for sync
  const selectedPeers = useMemo(() => {
    const validPeers = Array.from(peerQualityScores.entries())
      .filter(([peerId, score]) => peerId && score > 0.3) // Minimum quality threshold
      .sort(([, a], [, b]) => b - a) // Sort by quality score
      .slice(0, 3); // Top 3 peers
    
    return validPeers.map(([peerId]) => peerId);
  }, [peerQualityScores]);

  // Aggregate stats for better global sync with intelligent weighting
  const aggregate = useMemo(() => {
    const validPeers = peerSyncs
      .map((sync, index) => ({ sync, peerId: paddedPeerIds[index] }))
      .filter(({ sync, peerId }) => sync && peerId && selectedPeers.includes(peerId));

    const validOffsets = validPeers.map(({ sync }) => sync.peerOffset).filter(v => v !== null && isFinite(v));
    const validRtts = validPeers.map(({ sync }) => sync.peerRtt).filter(v => v !== null && isFinite(v));
    const validJitters = validPeers.map(({ sync }) => sync.jitter).filter(v => v !== null && isFinite(v));
    const connectionStates = validPeers.map(({ sync }) => sync.connectionState);

    // Weighted average offset based on peer quality
    let globalOffset = 0;
    if (validOffsets.length > 0) {
      const weightedOffsets = validPeers.map(({ sync, peerId }) => {
        const weight = peerQualityScores.get(peerId) || 0;
        return { offset: sync.peerOffset, weight };
      }).filter(p => p.weight > 0);

      if (weightedOffsets.length > 0) {
        const totalWeight = weightedOffsets.reduce((sum, p) => sum + p.weight, 0);
        globalOffset = weightedOffsets.reduce((sum, p) => sum + (p.offset * p.weight), 0) / totalWeight;
      } else {
        // Fallback to median if no weighted peers
        const sorted = [...validOffsets].sort((a, b) => a - b);
        const trim = Math.max(1, Math.floor(sorted.length * 0.22));
        const trimmed = sorted.slice(trim, sorted.length - trim);
        globalOffset = trimmed.length > 0
          ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length
          : sorted[Math.floor(sorted.length / 2)];
      }
    }

    // Median RTT and jitter
    const median = arr => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    const medianRtt = median(validRtts);
    const medianJitter = median(validJitters);

    // Calculate sync confidence based on peer consistency
    let syncConfidence = 0;
    if (validOffsets.length > 1) {
      const offsetVariance = validOffsets.reduce((sum, offset) => {
        return sum + Math.pow(offset - globalOffset, 2);
      }, 0) / validOffsets.length;
      syncConfidence = Math.max(0, 1 - Math.sqrt(offsetVariance) / 100); // 100ms variance = 0 confidence
    } else if (validOffsets.length === 1) {
      syncConfidence = 0.5; // Single peer = medium confidence
    }

    const aggregateStats = {
      globalOffset,
      medianRtt,
      medianJitter,
      connectionStates,
      peerCount: validOffsets.length,
      selectedPeers,
      syncConfidence,
      peerQualityScores: Object.fromEntries(peerQualityScores),
    };

    // Add logging for diagnosis
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[useMultiPeerTimeSync] Enhanced aggregate stats:', aggregateStats);
    }
    
    return aggregateStats;
  }, [
    peerSyncs,
    paddedPeerIds,
    selectedPeers,
    peerQualityScores,
  ]);

  return {
    peerSyncs,
    ...aggregate,
  };
}