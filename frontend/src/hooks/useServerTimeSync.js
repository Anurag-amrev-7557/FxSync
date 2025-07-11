import { useEffect, useRef, useState } from 'react';

export default function useServerTimeSync(socket, intervalMs = 5000) {
  const [offset, setOffset] = useState(0);
  const [rtt, setRtt] = useState(null);

  useEffect(() => {
    if (!socket) return;
    let isMounted = true;

    const sync = () => {
      const clientSent = Date.now();
      socket.emit('time_ping', clientSent, (data) => {
        if (!isMounted || !data) return;
        const clientReceived = Date.now();
        const { clientSent, serverReceived, serverSent } = data;
        const rtt = clientReceived - clientSent;
        // Offset: how much server clock is ahead of client
        const offset = ((serverReceived - clientSent) + (serverSent - clientReceived)) / 2;
        setOffset(offset);
        setRtt(rtt);
      });
    };

    sync();
    const id = setInterval(sync, intervalMs);
    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [socket, intervalMs]);

  // getServerTime: returns estimated server time for now
  const getServerTime = () => Date.now() + offset;

  return { offset, rtt, getServerTime };
} 