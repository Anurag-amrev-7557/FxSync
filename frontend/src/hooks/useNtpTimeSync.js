import { useEffect, useRef } from 'react';

const SAMPLES = 5;
const SYNC_INTERVAL = 10000; // ms
const MAX_RTT = 200; // ms, outlier threshold

export function useNtpTimeSync(socket) {
  const offsetRef = useRef(0);

  // Take multiple samples and pick the best one
  const syncTime = async () => {
    if (!socket) return;
    let bestSample = null;

    for (let i = 0; i < SAMPLES; i++) {
      // eslint-disable-next-line no-await-in-loop
      const sample = await new Promise((resolve) => {
        const clientSentAt = Date.now();
        socket.emit('time:sync', clientSentAt, ({ serverTime, clientSentAt: echoed }) => {
          const clientReceivedAt = Date.now();
          const rtt = clientReceivedAt - echoed;
          const offset = serverTime - (echoed + rtt / 2);
          resolve({ offset, rtt });
        });
      });

      // Outlier rejection: ignore samples with RTT > MAX_RTT
      if (sample.rtt > MAX_RTT) continue;

      if (!bestSample || sample.rtt < bestSample.rtt) {
        bestSample = sample;
      }
    }

    // If we found a good sample, update the offset
    if (bestSample) {
      // Smoothly adjust offset to avoid jumps
      offsetRef.current += (bestSample.offset - offsetRef.current) * 0.5;
    }
  };

  useEffect(() => {
    syncTime();
    const interval = setInterval(syncTime, SYNC_INTERVAL);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Returns the current server time as estimated by the client
  const getServerTime = () => Date.now() + offsetRef.current;

  return { getServerTime, offset: offsetRef.current };
} 