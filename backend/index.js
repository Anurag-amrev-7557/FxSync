import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocket } from './socket.js';
import audioRouter from './routes/audio.js';
import sessionRouter from './routes/session.js';
import healthRouter from './routes/health.js';
import { log } from './utils/utils.js';
import dotenv from 'dotenv';
import WebSocket from 'ws';
dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.FRONTEND_ORIGINS
  ? process.env.FRONTEND_ORIGINS.split(',').map(origin => origin.trim())
  : ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "https://fxsync-web.web.app"]);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

app.use('/audio', audioRouter);
app.use('/session', sessionRouter);
app.use('/health', healthRouter);

app.get('/', (req, res) => {
  res.send('<h1>Audio Sync Backend is running! 🚀</h1><p>Deployed on Render.</p>');
});

setupSocket(io);

// --- Advanced NTP WebSocket Integration ---

/**
 * Advanced NTP WebSocket handler:
 * - Uses process.hrtime.bigint() for sub-millisecond precision (if available)
 * - Supports multiple in-flight requests per client (by t0)
 * - Optionally includes server monotonic time and server timezone offset
 * - Handles client clock skew detection (optionally logs large offsets)
 * - Optionally supports a "ping" for RTT measurement
 */

function getPreciseTime() {
  // Returns { epochMs, hrtimeNs }
  const epochMs = Date.now();
  let hrtimeNs = null;
  if (typeof process !== "undefined" && process.hrtime && process.hrtime.bigint) {
    hrtimeNs = process.hrtime.bigint();
  }
  return { epochMs, hrtimeNs };
}

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  // Optionally: track in-flight NTP requests per connection
  ws._ntpRequests = new Map();

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    // Advanced: handle NTP_REQUEST
    if (data.type === 'NTP_REQUEST' && typeof data.t0 === 'number') {
      // t0: client send time (epoch ms)
      // t1: server receive time (epoch ms)
      // t2: server send time (epoch ms)
      // Optionally: t1_hr, t2_hr for sub-ms precision

      const t1Obj = getPreciseTime();
      // Optionally, store t1Obj for this t0 if you want to support multi-packet
      // ws._ntpRequests.set(data.t0, t1Obj);

      // Simulate minimal processing delay
      setImmediate(() => {
        const t2Obj = getPreciseTime();

        // Optionally, detect large client-server clock skew
        const serverTimezoneOffset = new Date().getTimezoneOffset(); // in minutes
        const response = {
          type: 'NTP_RESPONSE',
          t0: data.t0,
          t1: t1Obj.epochMs,
          t2: t2Obj.epochMs,
          t1_hr: t1Obj.hrtimeNs ? t1Obj.hrtimeNs.toString() : undefined,
          t2_hr: t2Obj.hrtimeNs ? t2Obj.hrtimeNs.toString() : undefined,
          serverTimezoneOffset, // minutes
          serverMonotonic: t2Obj.hrtimeNs ? t2Obj.hrtimeNs.toString() : undefined
        };

        // Optionally, log large offsets for diagnostics
        if (typeof data.clientTime === 'number') {
          const offset = t1Obj.epochMs - data.clientTime;
          if (Math.abs(offset) > 10000) { // >10s skew
            console.warn(`[NTP] Large client-server clock offset: ${offset} ms`);
          }
        }

        ws.send(JSON.stringify(response));
      });
    }

    // Optionally: handle ping for RTT measurement
    if (data.type === 'NTP_PING') {
      ws.send(JSON.stringify({ type: 'NTP_PONG', t: Date.now() }));
    }
  });
});

console.log('Advanced NTP WebSocket handler integrated on main server');

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  log(`Server listening on port ${PORT}`);
}); 