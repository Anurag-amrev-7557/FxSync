import { useMemo, useRef } from 'react';

/**
 * useUltraPreciseOffset
 * @param {Array} peerSyncs - Array of peer sync objects (from usePeerTimeSync)
 * @param {number} timeOffset - Server time offset
 * @param {number} rtt - Server RTT
 * @param {number} jitter - Server jitter
 * @param {number} drift - Server drift
 * @returns {object} { ultraPreciseOffset, syncQuality, allOffsets }
 */
export default function useUltraPreciseOffset(peerSyncs, timeOffset, rtt, jitter, drift) {
  // Combine peer and server offsets
  const allPeerOffsets = useMemo(() =>
    peerSyncs
      .map((p, i) => (p && p.connectionState === 'connected' && p.peerRtt !== null)
        ? { offset: p.peerOffset, rtt: p.peerRtt } : null)
      .filter(Boolean),
    [peerSyncs]
  );

  // Outlier filter: discard peer offsets that deviate >2x stddev from the median
  const filteredPeerOffsets = useMemo(() => {
    if (allPeerOffsets.length < 2) return allPeerOffsets;
    const offsets = allPeerOffsets.map(o => o.offset);
    const median = offsets.slice().sort((a, b) => a - b)[Math.floor(offsets.length / 2)];
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const stddev = Math.sqrt(offsets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / offsets.length);
    return allPeerOffsets.filter(o => Math.abs(o.offset - median) <= 2 * stddev);
  }, [allPeerOffsets]);

  // Prefer the peer offset with lowest RTT, fallback to server if none
  // Exclude peers with unstable RTT (>300ms or NaN)
  const stablePeerOffsets = useMemo(() =>
    filteredPeerOffsets.filter(o => typeof o.rtt === 'number' && o.rtt < 300 && !isNaN(o.rtt)),
    [filteredPeerOffsets]
  );

  // Weighted median by RTT (lower RTT = higher weight)
  function weightedMedian(offsets) {
    if (!offsets.length) return null;
    // Assign weight = 1/(rtt+1) to avoid div by zero
    const arr = offsets.map(o => ({...o, weight: 1/(o.rtt+1)})).sort((a,b) => a.offset-b.offset);
    const totalWeight = arr.reduce((sum, o) => sum + o.weight, 0);
    let acc = 0;
    for (let i=0; i<arr.length; ++i) {
      acc += arr[i].weight;
      if (acc >= totalWeight/2) return arr[i].offset;
    }
    return arr[arr.length-1].offset;
  }

  const bestPeer = useMemo(() => {
    if (!stablePeerOffsets.length) return null;
    return stablePeerOffsets.reduce((a, b) => (a.rtt < b.rtt ? a : b));
  }, [stablePeerOffsets]);

  // --- NTP-like filter: rolling window, IQR outlier removal, median smoothing ---
  const offsetWindowRef = useRef([]);
  const filteredWindow = useMemo(() => {
    // Add the latest best offset (weighted median or server)
    let latest = null;
    if (stablePeerOffsets.length) {
      latest = weightedMedian(stablePeerOffsets);
    } else if (bestPeer && Math.abs(bestPeer.offset) < 1000) {
      latest = bestPeer.offset;
    } else {
      latest = timeOffset;
    }
    if (!isNaN(latest)) {
      offsetWindowRef.current.push(latest);
      if (offsetWindowRef.current.length > 10) offsetWindowRef.current.shift();
    }
    // Outlier removal: IQR method
    const sorted = offsetWindowRef.current.slice().sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length / 4)] || 0;
    const q3 = sorted[Math.floor(sorted.length * 3 / 4)] || 0;
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    return sorted.filter(v => v >= lower && v <= upper);
  }, [stablePeerOffsets, bestPeer, timeOffset]);

  // Use the median of the filtered window as the final offset
  const smoothedOffset = useMemo(() => {
    if (!filteredWindow.length) return timeOffset;
    const sorted = filteredWindow.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [filteredWindow, timeOffset]);

  // For analytics/debug: show all offsets (peers + server)
  const allOffsets = useMemo(() => [
    ...filteredPeerOffsets,
    { offset: timeOffset, rtt: rtt, source: 'server' }
  ], [filteredPeerOffsets, timeOffset, rtt]);

  // Sync quality calculation
  const syncQuality = useMemo(() => {
    const r = rtt !== null && !isNaN(rtt) ? rtt : 0;
    const j = jitter !== null && !isNaN(jitter) ? Math.abs(jitter) : 0;
    const d = drift !== null && !isNaN(drift) ? Math.abs(drift) : 0;
    if (r < 30 && j < 10 && d < 10) return { label: 'Good', color: 'bg-green-500', tooltip: 'Sync is excellent. Low latency, jitter, and drift.' };
    if (r < 80 && j < 25 && d < 25) return { label: 'Fair', color: 'bg-yellow-500', tooltip: 'Sync is fair. Some latency, jitter, or drift detected.' };
    return { label: 'Poor', color: 'bg-red-500', tooltip: 'Sync is poor. High latency, jitter, or drift.' };
  }, [rtt, jitter, drift]);

  return { ultraPreciseOffset: smoothedOffset, syncQuality, allOffsets };
} 