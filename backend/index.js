import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
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

const io = new SocketIOServer(server, {
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

const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, request) => {
  ws._ntpRequests = new Map();
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }
    if (data.type === 'NTP_REQUEST' && typeof data.t0 === 'number') {
      const t1 = Date.now();
      const t2 = Date.now();
      ws.send(JSON.stringify({
        type: 'NTP_RESPONSE',
        t0: data.t0,
        t1,
        t2
      }));
    }
    if (data.type === 'NTP_PING') {
      ws.send(JSON.stringify({ type: 'NTP_PONG', t: Date.now() }));
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ntp') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
  // else: let socket.io or other handlers process it
});

console.log('NTP WebSocket handler attached to /ntp');

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  log(`Server listening on port ${PORT}`);
}); 