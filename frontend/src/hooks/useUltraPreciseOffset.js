import { useMemo, useRef, useEffect } from 'react';
import SYNC_CONFIG from '../utils/syncConfig';

/**
 * useUltraPreciseOffset
 * @param {Array} peerSyncs - Array of peer sync objects (from usePeerTimeSync)
 * @param {number} timeOffset - Server time offset
 * @param {number} rtt - Server RTT
 * @param {number} jitter - Server jitter
 * @param {number} drift - Server drift
 * @returns {object} { ultraPreciseOffset, syncQuality, allOffsets, selectedSource }
 */
export default function useUltraPreciseOffset(peerSyncs, timeOffset, rtt, jitter, drift, onPeerSyncFallback) {
  // Combine peer and server offsets, add source
  const allPeerOffsets = useMemo(
    () =>
      peerSyncs
        .map((p, i) =>
          p && p.connectionState === 'connected' && p.peerRtt !== null
            ? { offset: p.peerOffset, rtt: p.peerRtt, source: `peer${i + 1}` }
            : null
        )
        .filter(Boolean),
    [peerSyncs]
  );

  // Detect peer sync fallback
  const allPeerDisconnected = useMemo(
    () => peerSyncs.length > 0 && peerSyncs.every((p) => !p || p.connectionState !== 'connected'),
    [peerSyncs]
  );
  useEffect(() => {
    if (typeof onPeerSyncFallback === 'function') {
      onPeerSyncFallback(allPeerDisconnected);
    }
  }, [allPeerDisconnected, onPeerSyncFallback]);

  // Outlier filter: discard peer offsets that deviate >2x stddev from the median
  const filteredPeerOffsets = useMemo(() => {
    if (allPeerOffsets.length < 2) return allPeerOffsets;
    const offsets = allPeerOffsets.map((o) => o.offset);
    const median = offsets.slice().sort((a, b) => a - b)[Math.floor(offsets.length / 2)];
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const stddev = Math.sqrt(
      offsets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / offsets.length
    );
    return allPeerOffsets.filter(
      (o) => Math.abs(o.offset - median) <= SYNC_CONFIG.OUTLIER_STDDEV_MULTIPLIER * stddev
    );
  }, [allPeerOffsets]);

  // Exclude peers with unstable RTT (>300ms or NaN)
  const stablePeerOffsets = useMemo(
    () =>
      filteredPeerOffsets.filter((o) => typeof o.rtt === 'number' && o.rtt < 300 && !isNaN(o.rtt)),
    [filteredPeerOffsets]
  );

  // Quality scoring: lower RTT = higher score, server is fallback
  function scoreOffset(o) {
    if (!o) return -Infinity;
    if (o.source && o.source.startsWith('peer')) {
      return 1000 - o.rtt; // Higher is better
    }
    if (o.source === 'server') {
      return 500 - (typeof o.rtt === 'number' ? o.rtt : 0);
    }
    return 0;
  }

  // Weighted median by RTT (lower RTT = higher weight)
  function weightedMedian(offsets) {
    if (!offsets.length) return null;
    // Assign weight = 1/(rtt+1) to avoid div by zero
    const arr = offsets
      .map((o) => ({ ...o, weight: 1 / (o.rtt + 1) }))
      .sort((a, b) => a.offset - b.offset);
    const totalWeight = arr.reduce((sum, o) => sum + o.weight, 0);
    let acc = 0;
    for (let i = 0; i < arr.length; ++i) {
      acc += arr[i].weight;
      if (acc >= totalWeight / 2) return arr[i].offset;
    }
    return arr[arr.length - 1].offset;
  }

  // Select the best offset (highest score)
  const bestOffsetObj = useMemo(() => {
    const candidates = [...stablePeerOffsets, { offset: timeOffset, rtt: rtt, source: 'server' }];
    return candidates.reduce(
      (best, o) => (scoreOffset(o) > scoreOffset(best) ? o : best),
      candidates[0]
    );
  }, [stablePeerOffsets, timeOffset, rtt]);

  // --- NTP-like filter: rolling window, IQR outlier removal, median smoothing ---
  const offsetWindowRef = useRef([]);
  const filteredWindow = useMemo(() => {
    // Add the latest best offset (weighted median or server)
    let latest = null;
    if (bestOffsetObj && Math.abs(bestOffsetObj.offset) < 1000) {
      latest = bestOffsetObj.offset;
    } else {
      latest = timeOffset;
    }
    if (!isNaN(latest)) {
      offsetWindowRef.current.push(latest);
      if (offsetWindowRef.current.length > SYNC_CONFIG.OFFSET_SMOOTHING_WINDOW)
        offsetWindowRef.current.shift();
    }
    // Outlier removal: IQR method
    const sorted = offsetWindowRef.current.slice().sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length / 4)] || 0;
    const q3 = sorted[Math.floor((sorted.length * 3) / 4)] || 0;
    const iqr = q3 - q1;
    const lower = q1 - SYNC_CONFIG.OUTLIER_STDDEV_MULTIPLIER * iqr;
    const upper = q3 + SYNC_CONFIG.OUTLIER_STDDEV_MULTIPLIER * iqr;
    return sorted.filter((v) => v >= lower && v <= upper);
  }, [bestOffsetObj, timeOffset]);

  // Use the median of the filtered window as the final offset
  const smoothedOffset = useMemo(() => {
    if (!filteredWindow.length) return timeOffset;
    const sorted = filteredWindow.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [filteredWindow, timeOffset]);

  // For analytics/debug: show all offsets (peers + server)
  const allOffsets = useMemo(
    () => [...filteredPeerOffsets, { offset: timeOffset, rtt: rtt, source: 'server' }],
    [filteredPeerOffsets, timeOffset, rtt]
  );

  // Sync quality calculation
  const syncQuality = useMemo(() => {
    const r = rtt !== null && !isNaN(rtt) ? rtt : 0;
    const j = jitter !== null && !isNaN(jitter) ? Math.abs(jitter) : 0;
    const d = drift !== null && !isNaN(drift) ? Math.abs(drift) : 0;
    if (r < 30 && j < 10 && d < 10)
      return {
        label: 'Good',
        color: 'bg-green-500',
        tooltip: 'Sync is excellent. Low latency, jitter, and drift.',
      };
    if (r < 80 && j < 25 && d < 25)
      return {
        label: 'Fair',
        color: 'bg-yellow-500',
        tooltip: 'Sync is fair. Some latency, jitter, or drift detected.',
      };
    return {
      label: 'Poor',
      color: 'bg-red-500',
      tooltip: 'Sync is poor. High latency, jitter, or drift.',
    };
  }, [rtt, jitter, drift]);

  return { ultraPreciseOffset: smoothedOffset, syncQuality, allOffsets, selectedSource: bestOffsetObj?.source || 'server', allPeerDisconnected };
}
