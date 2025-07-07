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
import compression from 'compression';
import helmet from 'helmet';
import cluster from 'cluster';
import os from 'os';
import rateLimit from 'express-rate-limit';
dotenv.config();

const app = express();
const server = http.createServer(app);

// Response time logging middleware
app.use((req, res, next) => {
  const startHrTime = process.hrtime();
  res.on('finish', () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6;
    log(`${req.method} ${req.originalUrl} [${res.statusCode}] - ${elapsedMs.toFixed(2)} ms`);
  });
  next();
});

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
// Limit JSON payload size to 1MB
app.use(express.json({ limit: '1mb' }));

// Serve static audio files with cache headers
app.use('/uploads/samples', express.static('backend/uploads/samples', {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));

// Apply compression, helmet, and rate limiting only to API routes
const apiMiddlewares = [compression(), helmet(), rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
})];

app.use(['/audio', '/session', '/health'], ...apiMiddlewares);

app.use('/audio', audioRouter);
app.use('/session', sessionRouter);
app.use('/health', healthRouter);

app.get('/', (req, res) => {
  res.send('<h1>Audio Sync Backend is running! 🚀</h1><p>Deployed on Render.</p>');
});

setupSocket(io);

if (process.env.NODE_ENV === 'production' && cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => {
    log(`Server listening on port ${PORT}`);
  });
} 