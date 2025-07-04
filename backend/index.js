import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocket } from './socket.js';
import audioRouter from './routes/audio.js';
import sessionRouter from './routes/session.js';
import healthRouter from './routes/health.js';
import { log } from './utils/utils.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://fxsync-web.web.app', // or your custom domain
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

app.use('/', audioRouter);
app.use('/', sessionRouter);
app.use('/', healthRouter);

app.get('/', (req, res) => {
  res.send('<h1>Audio Sync Backend is running! 🚀</h1><p>Deployed on Render.</p>');
});

setupSocket(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  log(`Server listening on port ${PORT}`);
}); 