import { useState, useEffect } from 'react';

export default function useQueue(socket, initialQueue = [], pendingTrackIdxRef = null) {
  const [queue, setQueue] = useState(initialQueue);
  const [selectedTrackIdx, setSelectedTrackIdx] = useState(0);
  const [currentTrackOverride, setCurrentTrackOverride] = useState(null);

  // Handle queue updates
  useEffect(() => {
    if (!socket) return;
    const handleQueueUpdate = (q) => {
      setQueue(q);
      // If a track_change was received before the queue, apply it now
      if (pendingTrackIdxRef && pendingTrackIdxRef.current !== null) {
        if (pendingTrackIdxRef.currentTrack) {
          setCurrentTrackOverride(pendingTrackIdxRef.currentTrack);
        } else {
          setCurrentTrackOverride(null);
        }
        setSelectedTrackIdx(pendingTrackIdxRef.current);
        pendingTrackIdxRef.current = null;
        pendingTrackIdxRef.currentTrack = null;
      }
    };
    socket.on('queue_update', handleQueueUpdate);
    return () => {
      socket.off('queue_update', handleQueueUpdate);
    };
  }, [socket, pendingTrackIdxRef]);

  // Handle track changes
  useEffect(() => {
    if (!socket) return;
    const handleTrackChange = (payload) => {
      let idx, track;
      if (typeof payload === 'object' && payload !== null) {
        idx = typeof payload.idx === 'number' ? payload.idx : null;
        track = payload.track || null;
      } else {
        idx = payload;
        track = null;
      }
      if (typeof idx !== 'number' || idx < 0) return;
      if (!Array.isArray(queue) || queue.length === 0) {
        if (pendingTrackIdxRef) {
          pendingTrackIdxRef.current = idx;
          pendingTrackIdxRef.currentTrack = track;
        }
      } else {
        const clampedIdx = Math.max(0, Math.min(idx, queue.length - 1));
        setCurrentTrackOverride(track || null);
        setSelectedTrackIdx(clampedIdx);
      }
    };
    socket.on('track_change', handleTrackChange);
    return () => {
      socket.off('track_change', handleTrackChange);
    };
  }, [socket, queue, pendingTrackIdxRef]);

  // Reset selected track if queue changes
  useEffect(() => {
    if (queue.length === 0) setSelectedTrackIdx(0);
    else if (selectedTrackIdx >= queue.length) setSelectedTrackIdx(0);
  }, [queue]);

  // Apply buffered track_change when queue is set
  useEffect(() => {
    if (
      Array.isArray(queue) &&
      queue.length > 0 &&
      pendingTrackIdxRef &&
      pendingTrackIdxRef.current !== null
    ) {
      const clampedIdx = Math.max(0, Math.min(pendingTrackIdxRef.current, queue.length - 1));
      setCurrentTrackOverride(pendingTrackIdxRef.currentTrack || null);
      setSelectedTrackIdx(clampedIdx);
      pendingTrackIdxRef.current = null;
      pendingTrackIdxRef.currentTrack = null;
    }
  }, [queue, pendingTrackIdxRef]);

  return [
    queue,
    setQueue,
    selectedTrackIdx,
    setSelectedTrackIdx,
    currentTrackOverride,
    setCurrentTrackOverride,
  ];
}
