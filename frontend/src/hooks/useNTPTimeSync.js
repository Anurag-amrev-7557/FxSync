import { useEffect, useRef, useState, useCallback } from "react";

export function epochNow() {
  return Date.now();
}

export function calculateOffsetEstimate(ntpMeasurements) {
  const sorted = [...ntpMeasurements].sort((a, b) => a.roundTripDelay - b.roundTripDelay);
  const best = sorted.slice(0, Math.ceil(sorted.length / 2));
  const avgOffset = best.reduce((sum, m) => sum + m.clockOffset, 0) / best.length;
  const avgRTT = ntpMeasurements.reduce((sum, m) => sum + m.roundTripDelay, 0) / ntpMeasurements.length;
  return { averageOffset: avgOffset, averageRoundTrip: avgRTT };
}

export default function useNTPTimeSync(ws, { samples = 8, interval = 10000 } = {}) {
  const ntpMeasurements = useRef([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [averageRTT, setAverageRTT] = useState(null);

  // Send a single NTP request and handle the response
  const sendNTPRequest = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const t0 = epochNow();
    ws.send(JSON.stringify({ type: "NTP_REQUEST", t0 }));

    const handler = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "NTP_RESPONSE" && data.t0 === t0) {
        const t3 = epochNow();
        const { t1, t2 } = data;
        const roundTripDelay = (t3 - t0) - (t2 - t1);
        const offset = ((t1 - t0) + (t2 - t3)) / 2;
        ntpMeasurements.current.push({ t0, t1, t2, t3, roundTripDelay, clockOffset: offset });
        if (ntpMeasurements.current.length > samples) ntpMeasurements.current.shift();
        const { averageOffset, averageRoundTrip } = calculateOffsetEstimate(ntpMeasurements.current);
        setClockOffset(averageOffset);
        setAverageRTT(averageRoundTrip);
        ws.removeEventListener("message", handler);
      }
    };
    ws.addEventListener("message", handler);
  }, [ws, samples]);

  // Initial burst of NTP requests for accuracy
  useEffect(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (let i = 0; i < samples; i++) {
      setTimeout(() => sendNTPRequest(), i * 150);
    }
    // Periodic NTP sync
    const id = setInterval(() => sendNTPRequest(), interval);
    return () => clearInterval(id);
  }, [ws, sendNTPRequest, samples, interval]);

  // Utility to get current server time
  const getServerTime = useCallback(() => epochNow() + clockOffset, [clockOffset]);

  return {
    getServerTime,
    clockOffset,
    averageRTT,
    ntpMeasurements: ntpMeasurements.current
  };
} 