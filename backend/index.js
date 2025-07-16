import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import compression from 'compression';
import { setupSocket } from './socket.js';
import audioRouter from './routes/audio.js';
import sessionRouter from './routes/session.js';
import healthRouter from './routes/health.js';
import { log } from './utils/utils.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(compression());
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

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  log(`Server listening on port ${PORT}`);
}); 