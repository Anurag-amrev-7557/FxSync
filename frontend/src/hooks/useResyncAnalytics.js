import { useState, useCallback } from 'react';

export default function useResyncAnalytics(historySize) {
  const RESYNC_HISTORY_SIZE =
    typeof historySize === 'number'
      ? historySize
      : (typeof process !== 'undefined' && process.env && process.env.REACT_APP_RESYNC_HISTORY_SIZE)
        ? parseInt(process.env.REACT_APP_RESYNC_HISTORY_SIZE, 10) || 5
        : 5;

  const [resyncHistory, setResyncHistory] = useState([]);
  const [lastResyncTime, setLastResyncTime] = useState(0);
  const [resyncInProgress, setResyncInProgress] = useState(false);
  const [smartResyncSuggestion, setSmartResyncSuggestion] = useState(false);
  const [resyncStats, setResyncStats] = useState({
    totalResyncs: 0,
    successfulResyncs: 0,
    failedResyncs: 0,
    averageDrift: 0,
    lastDrift: 0
  });

  const updateResyncHistory = useCallback((result, drift, message, duration, currentTrackId = 'unknown') => {
    const resyncEntry = {
      timestamp: Date.now(),
      result,
      drift: parseFloat(drift?.toFixed?.(3) ?? drift),
      message,
      duration: parseFloat(duration?.toFixed?.(1) ?? duration),
      trackId: currentTrackId
    };
    setResyncHistory(prev => {
      const newHistory = [resyncEntry, ...prev.slice(0, RESYNC_HISTORY_SIZE - 1)];
      return newHistory;
    });
    setResyncStats(prev => {
      const totalResyncs = prev.totalResyncs + 1;
      const successfulResyncs = result === 'success' ? prev.successfulResyncs + 1 : prev.successfulResyncs;
      const failedResyncs = result === 'failed' ? prev.failedResyncs + 1 : prev.failedResyncs;
      const averageDrift = (prev.averageDrift * prev.totalResyncs + drift) / totalResyncs;
      return {
        totalResyncs,
        successfulResyncs,
        failedResyncs,
        averageDrift,
        lastDrift: drift
      };
    });
  }, [RESYNC_HISTORY_SIZE]);

  return {
    resyncHistory,
    lastResyncTime,
    setLastResyncTime,
    resyncInProgress,
    setResyncInProgress,
    smartResyncSuggestion,
    setSmartResyncSuggestion,
    resyncStats,
    updateResyncHistory
  };
} 