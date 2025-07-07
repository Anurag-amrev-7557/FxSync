import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { addSessionFile } from '../managers/fileManager.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

const AUDIO_URL = process.env.AUDIO_URL || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const AUDIO_BASE_PATH = process.env.AUDIO_BASE_PATH || '/audio';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
(async () => {
  try {
    await fs.promises.mkdir(uploadsDir, { recursive: true });
  } catch (err) {
    // Directory creation failed
  }
})();

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Use clientId and timestamp to make filename unique
    let clientId = 'unknown';
    if (req.body && req.body.clientId) {
      clientId = req.body.clientId;
    } else if (req.query && req.query.clientId) {
      clientId = req.query.clientId;
    }
    const ext = path.extname(file.originalname);
    cb(null, `${clientId}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

router.get('/audio-url', (req, res) => {
  res.json({ url: AUDIO_URL });
});

// Upload endpoint
router.post('/upload', upload.single('music'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const clientId = req.body.clientId || req.query.clientId || 'unknown';
  const sessionId = req.body.sessionId || req.query.sessionId || 'unknown';
  addSessionFile(sessionId, clientId, req.file.filename);
  // Return the file URL to the client
  const fileUrl = `${AUDIO_BASE_PATH}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.filename });
});

// Serve uploaded files
router.use('/uploads', express.static(uploadsDir));

// List all tracks (user uploads + samples)
router.get('/all-tracks', async (req, res) => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const samplesDir = path.join(uploadsDir, 'samples');
  let tracks = [];

  // Helper to add tracks from a directory
  async function addTracksFromDir(dir, type, urlPrefix) {
    try {
      await fs.promises.access(dir);
      const files = await fs.promises.readdir(dir);
      files.forEach(file => {
        if (file.endsWith('.mp3')) {
          tracks.push({
            title: file.replace(/\.mp3$/i, ''),
            url: `${AUDIO_BASE_PATH}${urlPrefix}/${file}`,
            type
          });
        }
      });
    } catch (err) {
      // Directory does not exist or error reading, skip
    }
  }

  // User uploads (exclude samples subdir)
  await addTracksFromDir(uploadsDir, 'user', '/uploads');
  // Sample tracks
  await addTracksFromDir(samplesDir, 'sample', '/uploads/samples');

  res.json(tracks);
});

export default router;